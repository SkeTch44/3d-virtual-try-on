import { create } from 'zustand'
import { GARMENTS, type Garment } from './garments'
import { DEFAULT_MEASUREMENTS, type Measurements } from './size-ai'

export type StudioStep = 'upload' | 'processing' | 'avatar' | 'tryon'

type StudioState = {
  step: StudioStep
  measurements: Measurements
  garment: Garment | null
  selectedSize: string
  heatmap: boolean
  /** bump to re-drop the cloth simulation */
  simKey: number
  setStep: (step: StudioStep) => void
  setMeasurement: (key: keyof Measurements, value: number) => void
  selectGarment: (garment: Garment | null) => void
  setSelectedSize: (label: string) => void
  setHeatmap: (on: boolean) => void
  resetSim: () => void
}

export const useStudioStore = create<StudioState>((set) => ({
  step: 'upload',
  measurements: { ...DEFAULT_MEASUREMENTS },
  garment: GARMENTS[0],
  selectedSize: 'M',
  heatmap: false,
  simKey: 0,
  setStep: (step) => set({ step }),
  setMeasurement: (key, value) =>
    set((s) => ({
      measurements: { ...s.measurements, [key]: value },
      simKey: s.simKey + 1,
    })),
  selectGarment: (garment) => set((s) => ({ garment, simKey: s.simKey + 1 })),
  setSelectedSize: (selectedSize) => set((s) => ({ selectedSize, simKey: s.simKey + 1 })),
  setHeatmap: (heatmap) => set({ heatmap }),
  resetSim: () => set((s) => ({ simKey: s.simKey + 1 })),
}))
