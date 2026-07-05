import { POSE, type ViewLandmarks } from './types'

/**
 * MediaPipe Pose Landmarker, running fully in the browser (WASM).
 * Replaces the Python MediaPipe service from the production plan.
 */

export type PoseExtraction = {
  landmarks: ViewLandmarks
  /** person segmentation mask, values 0-1, row-major */
  mask: { data: Float32Array; width: number; height: number } | null
  /** mean visibility of the key landmarks, 0-1 */
  confidence: number
}

export class PoseDetectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PoseDetectionError'
  }
}

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

// Landmarks the pipeline cannot work without.
const REQUIRED = [
  POSE.nose,
  POSE.leftShoulder,
  POSE.rightShoulder,
  POSE.leftHip,
  POSE.rightHip,
  POSE.leftAnkle,
  POSE.rightAnkle,
] as const

const MIN_VISIBILITY = 0.45

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let landmarkerPromise: Promise<any> | null = null

async function getLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT)
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'IMAGE',
        numPoses: 1,
        outputSegmentationMasks: true,
      })
    })().catch((err) => {
      landmarkerPromise = null
      throw err
    })
  }
  return landmarkerPromise
}

/** Warm the WASM + model download while the user is still picking photos. */
export function preloadLandmarker() {
  void getLandmarker().catch(() => {
    /* surfaced on actual extraction */
  })
}

async function fileToImage(file: File | Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new PoseDetectionError('Could not decode the image file'))
      img.src = url
    })
    return img
  } finally {
    // revoke after decode completes; the pixel data is already in memory
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/**
 * Runs pose detection on a photo. Throws PoseDetectionError when no
 * full body is detectable so the UI can prompt for a retake.
 */
export async function extractPose(file: File | Blob, viewLabel: string): Promise<PoseExtraction> {
  const landmarker = await getLandmarker()
  const image = await fileToImage(file)

  const result = landmarker.detect(image)

  const raw = result.landmarks?.[0]
  if (!raw || raw.length < 33) {
    closeMasks(result)
    throw new PoseDetectionError(
      `No person detected in the ${viewLabel} photo. Use a full-body photo with good lighting.`,
    )
  }

  const landmarks: ViewLandmarks = raw.map(
    (p: { x: number; y: number; z: number; visibility?: number }) => ({
      x: p.x,
      y: p.y,
      z: p.z,
      visibility: p.visibility ?? 0,
    }),
  )

  const visibilities = REQUIRED.map((i) => landmarks[i].visibility)
  const confidence = visibilities.reduce((a, b) => a + b, 0) / visibilities.length
  const weakest = Math.min(...visibilities)

  if (weakest < MIN_VISIBILITY) {
    closeMasks(result)
    throw new PoseDetectionError(
      `Couldn't see the full body in the ${viewLabel} photo (head to ankles must be in frame). Retake from further back.`,
    )
  }

  // Copy the segmentation mask before MediaPipe reclaims the GPU/WASM memory.
  let mask: PoseExtraction['mask'] = null
  const mpMask = result.segmentationMasks?.[0]
  if (mpMask) {
    try {
      const data = mpMask.getAsFloat32Array()
      mask = { data: Float32Array.from(data), width: mpMask.width, height: mpMask.height }
    } catch {
      mask = null
    }
  }
  closeMasks(result)

  return { landmarks, mask, confidence }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function closeMasks(result: any) {
  try {
    result.segmentationMasks?.forEach((m: { close: () => void }) => m.close())
  } catch {
    /* already closed */
  }
}
