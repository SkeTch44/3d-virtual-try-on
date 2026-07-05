/** One MediaPipe pose keypoint, normalized to [0,1] image coordinates. */
export type PoseKeypoint = {
  x: number
  y: number
  z: number
  /** 0-1, how confident the model is that this point is visible */
  visibility: number
}

/** The 33 BlazePose keypoints for one photo. */
export type ViewLandmarks = PoseKeypoint[]

/** Landmarks for both capture views. */
export type AvatarLandmarks = {
  front: ViewLandmarks
  side: ViewLandmarks | null
}

/** BlazePose landmark indices we rely on. */
export const POSE = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const
