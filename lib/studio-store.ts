import { create } from 'zustand'
import { GARMENTS, type Garment } from './garments'
import { DEFAULT_MEASUREMENTS, type Measurements } from './size-ai'
import type { AvatarLandmarks } from './pose/types'

export type StudioStep = 'upload' | 'processing' | 'avatar' | 'tryon'

export type CapturedPhotos = {
  front: File | null
  side: File | null
}

export type SavedAvatar = {
  id: string
  measurements: Measurements
  landmarks: AvatarLandmarks | null
  source: 'photo' | 'manual'
}

type StudioState = {
  step: StudioStep
  measurements: Measurements
  garment: Garment | null
  selectedSize: string
  heatmap: boolean
  /** bump to re-drop the cloth simulation */
  simKey: number

  // --- Phase 1: real avatar pipeline ---
  /** user-stated height in cm, used for pixel->cm calibration */
  heightHint: number
  /** photos chosen on the upload step, consumed by the processing step */
  photos: CapturedPhotos
  /** local object URLs for previews / the landmark overlay */
  photoPreviews: { front: string | null; side: string | null }
  /** id of the persisted avatar row */
  avatarId: string | null
  /** extracted 33-keypoint landmarks per view */
  landmarks: AvatarLandmarks | null
  /** whether current measurements came from photos or manual sliders */
  measurementSource: 'photo' | 'manual'
  /** 0-100 estimate confidence from the extraction pipeline */
  estimateConfidence: number | null
  /** a previously saved avatar found on the server (session restore) */
  savedAvatar: SavedAvatar | null
  hydrationChecked: boolean

  setStep: (step: StudioStep) => void
  setMeasurement: (key: keyof Measurements, value: number) => void
  selectGarment: (garment: Garment | null) => void
  setSelectedSize: (label: string) => void
  setHeatmap: (on: boolean) => void
  resetSim: () => void

  setHeightHint: (cm: number) => void
  setPhoto: (view: 'front' | 'side', file: File | null) => void
  clearPhotos: () => void
  completeProcessing: (result: {
    avatarId: string
    measurements: Measurements
    landmarks: AvatarLandmarks
    confidence: number
  }) => void
  setSavedAvatar: (avatar: SavedAvatar | null) => void
  useSavedAvatar: () => void
}

export const useStudioStore = create<StudioState>((set, get) => ({
  step: 'upload',
  measurements: { ...DEFAULT_MEASUREMENTS },
  garment: GARMENTS[0],
  selectedSize: 'M',
  heatmap: false,
  simKey: 0,

  heightHint: DEFAULT_MEASUREMENTS.height,
  photos: { front: null, side: null },
  photoPreviews: { front: null, side: null },
  avatarId: null,
  landmarks: null,
  measurementSource: 'photo',
  estimateConfidence: null,
  savedAvatar: null,
  hydrationChecked: false,

  setStep: (step) => set({ step }),
  setMeasurement: (key, value) =>
    set((s) => ({
      measurements: { ...s.measurements, [key]: value },
      measurementSource: 'manual',
      simKey: s.simKey + 1,
    })),
  selectGarment: (garment) => set((s) => ({ garment, simKey: s.simKey + 1 })),
  setSelectedSize: (selectedSize) => set((s) => ({ selectedSize, simKey: s.simKey + 1 })),
  setHeatmap: (heatmap) => set({ heatmap }),
  resetSim: () => set((s) => ({ simKey: s.simKey + 1 })),

  setHeightHint: (heightHint) => set({ heightHint }),
  setPhoto: (view, file) =>
    set((s) => {
      const prev = s.photoPreviews[view]
      if (prev) URL.revokeObjectURL(prev)
      return {
        photos: { ...s.photos, [view]: file },
        photoPreviews: {
          ...s.photoPreviews,
          [view]: file ? URL.createObjectURL(file) : null,
        },
      }
    }),
  clearPhotos: () => {
    const { photoPreviews } = get()
    for (const url of [photoPreviews.front, photoPreviews.side]) {
      if (url) URL.revokeObjectURL(url)
    }
    set({ photos: { front: null, side: null }, photoPreviews: { front: null, side: null } })
  },
  completeProcessing: ({ avatarId, measurements, landmarks, confidence }) =>
    set((s) => ({
      avatarId,
      measurements,
      landmarks,
      estimateConfidence: confidence,
      measurementSource: 'photo',
      step: 'avatar',
      simKey: s.simKey + 1,
    })),
  setSavedAvatar: (savedAvatar) => set({ savedAvatar, hydrationChecked: true }),
  useSavedAvatar: () => {
    const { savedAvatar } = get()
    if (!savedAvatar) return
    set((s) => ({
      avatarId: savedAvatar.id,
      measurements: savedAvatar.measurements,
      landmarks: savedAvatar.landmarks,
      measurementSource: savedAvatar.source,
      step: 'avatar',
      simKey: s.simKey + 1,
    }))
  },
}))
