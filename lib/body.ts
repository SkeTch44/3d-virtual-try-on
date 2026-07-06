import type { Measurements } from './size-ai'

/**
 * Parametric body model shared by the avatar mesh and the cloth solver.
 * Y is up, floor at y=0, all units in meters.
 * The torso cross-section is an ellipse with depth = ELLIPSE_RATIO * width.
 */

export const ELLIPSE_RATIO = 0.62

/** Ramanujan-derived: ellipse half-width `a` from circumference, with b = 0.62a */
export function circumferenceToHalfWidth(circumferenceCm: number): number {
  return circumferenceCm / 100 / 5.16
}

// key landmarks as fractions of total height
export const LANDMARKS = {
  hip: 0.52,
  waist: 0.63,
  chest: 0.72,
  shoulder: 0.805,
  neck: 0.85,
  headCenter: 0.925,
}

export type BodyProfile = {
  heightM: number
  hipY: number
  waistY: number
  chestY: number
  shoulderY: number
  neckY: number
  headCenterY: number
  headR: number
  hipA: number
  waistA: number
  chestA: number
  shoulderA: number
  neckA: number
  /** half-width of torso ellipse at world y */
  halfWidthAt: (y: number) => number
  /** arm capsule endpoints [shoulder, wrist] for each side */
  arms: { start: [number, number, number]; end: [number, number, number]; r: number }[]
  /** leg capsule endpoints [hip, ankle] for each side */
  legs: { start: [number, number, number]; end: [number, number, number]; r: number }[]
  legR: number
  legOffsetX: number
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function smooth(t: number) {
  return t * t * (3 - 2 * t)
}

export function buildBodyProfile(m: Measurements): BodyProfile {
  const heightM = m.height / 100
  const hipY = LANDMARKS.hip * heightM
  const waistY = LANDMARKS.waist * heightM
  const chestY = LANDMARKS.chest * heightM
  const shoulderY = LANDMARKS.shoulder * heightM
  const neckY = LANDMARKS.neck * heightM
  const headCenterY = LANDMARKS.headCenter * heightM
  const headR = 0.062 * heightM

  const hipA = circumferenceToHalfWidth(m.hips)
  const waistA = circumferenceToHalfWidth(m.waist)
  const chestA = circumferenceToHalfWidth(m.chest)
  const shoulderA = chestA * 1.12
  const neckA = 0.055 * heightM

  const halfWidthAt = (y: number): number => {
    if (y <= hipY) {
      // taper from hips down toward the legs
      const t = Math.min(1, (hipY - y) / (hipY * 0.35))
      return lerp(hipA, hipA * 0.72, smooth(t))
    }
    if (y <= waistY) return lerp(hipA, waistA, smooth((y - hipY) / (waistY - hipY)))
    if (y <= chestY) return lerp(waistA, chestA, smooth((y - waistY) / (chestY - waistY)))
    if (y <= shoulderY) return lerp(chestA, shoulderA, smooth((y - chestY) / (shoulderY - chestY)))
    if (y <= neckY) return lerp(shoulderA, neckA, smooth((y - shoulderY) / (neckY - shoulderY)))
    return neckA
  }

  const armR = 0.042 * heightM
  const armLen = 0.34 * heightM
  const spread = 0.32 // A-pose angle (radians-ish, as x-per-y slope)
  const arms = [-1, 1].map((side) => {
    const sx = side * (shoulderA * 0.92)
    const sy = shoulderY - armR * 0.4
    return {
      start: [sx, sy, 0] as [number, number, number],
      end: [sx + side * armLen * spread, sy - armLen * 0.94, 0] as [number, number, number],
      r: armR,
    }
  })

  const legR = 0.055 * heightM
  const legOffsetX = hipA * 0.48
  const legs = [-1, 1].map((side) => ({
    start: [side * legOffsetX, hipY * 0.92, 0] as [number, number, number],
    end: [side * legOffsetX, 0.06, 0] as [number, number, number],
    r: legR,
  }))

  return {
    heightM,
    hipY,
    waistY,
    chestY,
    shoulderY,
    neckY,
    headCenterY,
    headR,
    hipA,
    waistA,
    chestA,
    shoulderA,
    neckA,
    halfWidthAt,
    arms,
    legs,
    legR,
    legOffsetX,
  }
}

/**
 * Push a point outside the body surface (torso ellipse stack + arm capsules).
 * Mutates and returns [x, y, z]. `offset` is the cloth thickness gap.
 * Returns the signed penetration depth (>0 means it was inside).
 */
export function collideBody(
  p: Float32Array,
  i: number,
  body: BodyProfile,
  offset: number,
): number {
  const x = p[i]
  const y = p[i + 1]
  const z = p[i + 2]
  let penetration = 0

  // torso ellipse
  if (y > 0.1 && y < body.neckY) {
    const a = body.halfWidthAt(y) + offset
    const b = a * ELLIPSE_RATIO + offset * 0.4
    const k = (x * x) / (a * a) + (z * z) / (b * b)
    if (k < 1 && k > 1e-6) {
      const scale = 1 / Math.sqrt(k)
      p[i] = x * scale
      p[i + 2] = z * scale
      penetration = Math.max(penetration, (scale - 1) * Math.hypot(x, z))
    }
  }

  // leg capsules (only below the hip line, where the torso ellipse has tapered off)
  if (y < body.hipY) {
    for (const leg of body.legs) {
      const lx = leg.start[0]
      const dx = p[i] - lx
      const dz = p[i + 2]
      const dist = Math.sqrt(dx * dx + dz * dz)
      const minDist = leg.r + offset * 0.7
      if (dist < minDist && dist > 1e-6 && y < leg.start[1] + leg.r && y > leg.end[1] - leg.r) {
        const push = minDist / dist
        p[i] = lx + dx * push
        p[i + 2] = dz * push
        penetration = Math.max(penetration, minDist - dist)
      }
    }
  }

  // arm capsules
  for (const arm of body.arms) {
    const ax = arm.start[0]
    const ay = arm.start[1]
    const bx = arm.end[0]
    const by = arm.end[1]
    const abx = bx - ax
    const aby = by - ay
    const t = Math.max(0, Math.min(1, ((p[i] - ax) * abx + (p[i + 1] - ay) * aby) / (abx * abx + aby * aby)))
    const cx = ax + abx * t
    const cy = ay + aby * t
    const dx = p[i] - cx
    const dy = p[i + 1] - cy
    const dz = p[i + 2]
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const minDist = arm.r + offset * 0.7
    if (dist < minDist && dist > 1e-6) {
      const push = minDist / dist
      p[i] = cx + dx * push
      p[i + 1] = cy + dy * push
      p[i + 2] = dz * push
      penetration = Math.max(penetration, minDist - dist)
    }
  }

  return penetration
}
