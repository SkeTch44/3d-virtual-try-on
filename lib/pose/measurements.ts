import type { Measurements } from '../size-ai'
import type { PoseExtraction } from './landmarker'
import { POSE } from './types'

/**
 * Measurement estimation from pose landmarks + person segmentation.
 *
 * Approach (the plan's "heuristics first, NN later"):
 * 1. Calibrate pixels->cm using the user-stated height and the nose->ankle
 *    landmark span (known anthropometric fractions of stature).
 * 2. Read torso silhouette WIDTH at chest/waist/hip heights from the front
 *    mask, and torso DEPTH at the same heights from the side mask.
 * 3. Combine width + depth into circumferences with Ramanujan's ellipse
 *    perimeter approximation.
 * 4. Fall back to population width:depth ratios when the side view is weak.
 *
 * All outputs are clamped to the studio slider ranges so the parametric
 * body model always receives valid input.
 */

// Anthropometric landmark heights as fraction of stature (matches lib/body.ts)
const FRAC = { nose: 0.93, ankle: 0.047, chest: 0.72, waist: 0.63, hip: 0.52 }

// Depth:width fallback ratio — same ellipse ratio the body model renders with.
const DEPTH_RATIO = 0.62

const CLAMP: Record<keyof Measurements, [number, number]> = {
  height: [150, 200],
  chest: [80, 125],
  waist: [60, 115],
  hips: [80, 130],
}

export type MeasurementEstimate = {
  measurements: Measurements
  /** 0-100, blends landmark visibility with silhouette availability */
  confidence: number
  /** true when the side-view silhouette contributed real depth data */
  usedSideDepth: boolean
}

type Mask = NonNullable<PoseExtraction['mask']>

function clamp(key: keyof Measurements, v: number): number {
  const [min, max] = CLAMP[key]
  // whole-cm values: matches the slider steps and keeps the UI clean
  return Math.round(Math.min(max, Math.max(min, v)))
}

/** Ramanujan approximation of an ellipse perimeter, semi-axes a and b. */
function ellipsePerimeter(a: number, b: number): number {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
}

function mid(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * Width in mask pixels of the contiguous body segment at a given row,
 * anchored at the torso centerline (so out-stretched arms are excluded).
 */
function torsoExtentAtRow(mask: Mask, rowFrac: number, centerFrac: number): number | null {
  const row = Math.round(rowFrac * (mask.height - 1))
  if (row < 0 || row >= mask.height) return null
  const center = Math.min(mask.width - 1, Math.max(0, Math.round(centerFrac * (mask.width - 1))))
  const offset = row * mask.width
  const solid = (x: number) => mask.data[offset + x] > 0.5

  if (!solid(center)) {
    // centerline slightly off (e.g. side view) — probe nearby
    let found = -1
    for (let d = 1; d < mask.width * 0.12; d++) {
      if (center - d >= 0 && solid(center - d)) {
        found = center - d
        break
      }
      if (center + d < mask.width && solid(center + d)) {
        found = center + d
        break
      }
    }
    if (found === -1) return null
    return runLength(mask, offset, found)
  }
  return runLength(mask, offset, center)
}

function runLength(mask: Mask, rowOffset: number, startX: number): number {
  let left = startX
  let right = startX
  while (left > 0 && mask.data[rowOffset + left - 1] > 0.5) left--
  while (right < mask.width - 1 && mask.data[rowOffset + right + 1] > 0.5) right++
  return right - left + 1
}

type ViewGeometry = {
  /** convert a stature fraction (0=floor) to a mask row fraction (0=top) */
  rowFracAt: (statureFrac: number) => number
  /** torso centerline as fraction of image width */
  centerFrac: number
  /** cm per mask pixel (horizontal, assuming square pixels) */
  cmPerPx: number
}

function calibrate(extraction: PoseExtraction, heightCm: number): ViewGeometry | null {
  const lm = extraction.landmarks
  const nose = lm[POSE.nose]
  const ankle = mid(lm[POSE.leftAnkle], lm[POSE.rightAnkle])
  const shoulderMid = mid(lm[POSE.leftShoulder], lm[POSE.rightShoulder])
  const hipMid = mid(lm[POSE.leftHip], lm[POSE.rightHip])

  const spanFrac = ankle.y - nose.y // normalized image fraction, top-down
  if (spanFrac <= 0.15) return null // degenerate / person too small in frame

  // nose->ankle covers (FRAC.nose - FRAC.ankle) of total stature
  const statureFracSpan = FRAC.nose - FRAC.ankle
  const imageFracPerStatureFrac = spanFrac / statureFracSpan
  const floorFrac = ankle.y + FRAC.ankle * imageFracPerStatureFrac // image frac of floor

  const mask = extraction.mask
  if (!mask) return null

  const personPxHeight = imageFracPerStatureFrac * mask.height
  const cmPerPx = heightCm / personPxHeight

  return {
    rowFracAt: (statureFrac) => floorFrac - statureFrac * imageFracPerStatureFrac,
    centerFrac: (shoulderMid.x + hipMid.x) / 2,
    cmPerPx,
  }
}

function extentCm(geo: ViewGeometry, mask: Mask, statureFrac: number): number | null {
  const px = torsoExtentAtRow(mask, geo.rowFracAt(statureFrac), geo.centerFrac)
  if (px === null || px < 2) return null
  return px * geo.cmPerPx
}

export function estimateMeasurements(
  front: PoseExtraction,
  side: PoseExtraction | null,
  heightCm: number,
): MeasurementEstimate {
  const frontGeo = front.mask ? calibrate(front, heightCm) : null
  const sideGeo = side?.mask ? calibrate(side, heightCm) : null

  const zones = [
    { key: 'chest' as const, frac: FRAC.chest },
    { key: 'waist' as const, frac: FRAC.waist },
    { key: 'hips' as const, frac: FRAC.hip },
  ]

  let usedSideDepth = false
  const result: Partial<Measurements> = { height: clamp('height', heightCm) }

  for (const zone of zones) {
    const width = frontGeo && front.mask ? extentCm(frontGeo, front.mask, zone.frac) : null
    const depth = sideGeo && side?.mask ? extentCm(sideGeo, side.mask, zone.frac) : null

    let circumference: number
    if (width !== null && depth !== null && depth > width * 0.3 && depth < width * 1.4) {
      circumference = ellipsePerimeter(width / 2, depth / 2)
      usedSideDepth = true
    } else if (width !== null) {
      circumference = ellipsePerimeter(width / 2, (width * DEPTH_RATIO) / 2)
    } else {
      // silhouette unavailable — landmark-only fallback via shoulder/hip spans
      circumference = landmarkFallback(front, heightCm, zone.key)
    }
    result[zone.key] = clamp(zone.key, circumference)
  }

  const maskQuality = (front.mask ? 0.5 : 0.2) + (usedSideDepth ? 0.5 : 0.25)
  const confidence = Math.round(
    Math.min(97, Math.max(50, front.confidence * 60 + maskQuality * 40)),
  )

  return { measurements: result as Measurements, confidence, usedSideDepth }
}

/**
 * Last-resort estimates from landmark spans + population ratios
 * (used only when segmentation masks are unavailable).
 */
function landmarkFallback(
  front: PoseExtraction,
  heightCm: number,
  zone: 'chest' | 'waist' | 'hips',
): number {
  const lm = front.landmarks
  const nose = lm[POSE.nose]
  const ankle = mid(lm[POSE.leftAnkle], lm[POSE.rightAnkle])
  const spanFrac = ankle.y - nose.y
  const cmPerImageFrac = (heightCm * (FRAC.nose - FRAC.ankle)) / Math.max(spanFrac, 1e-4)

  const shoulderSpanCm =
    Math.abs(lm[POSE.leftShoulder].x - lm[POSE.rightShoulder].x) * cmPerImageFrac
  const hipSpanCm = Math.abs(lm[POSE.leftHip].x - lm[POSE.rightHip].x) * cmPerImageFrac

  // biacromial/hip-joint spans to circumference, population regression ratios
  switch (zone) {
    case 'chest':
      return shoulderSpanCm * 2.55
    case 'waist':
      return (shoulderSpanCm * 0.82 + hipSpanCm * 1.1) * 1.35
    case 'hips':
      return hipSpanCm * 3.7
  }
}
