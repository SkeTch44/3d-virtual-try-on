import type { Garment, SizeSpec } from './garments'

export type Measurements = {
  /** cm */
  height: number
  chest: number
  waist: number
  hips: number
}

export const DEFAULT_MEASUREMENTS: Measurements = {
  height: 175,
  chest: 98,
  waist: 84,
  hips: 100,
}

export type ZoneFit = {
  zone: 'Chest' | 'Waist' | 'Hips'
  /** positive = garment ease (room), negative = compression, in cm */
  ease: number
  verdict: 'tight' | 'fitted' | 'relaxed' | 'loose'
}

export type SizeResult = {
  size: SizeSpec
  score: number
  zones: ZoneFit[]
}

export type Recommendation = {
  best: SizeResult
  all: SizeResult[]
  /** 0-100 */
  confidence: number
}

function verdictFor(ease: number, stretchCm: number): ZoneFit['verdict'] {
  if (ease < -stretchCm) return 'tight'
  if (ease < 3) return 'fitted'
  if (ease < 9) return 'relaxed'
  return 'loose'
}

/**
 * Scores each size against body measurements. The ideal garment has
 * a small positive ease (2-6cm) at every zone. Deterministic and
 * explainable -- stands in for the XGBoost model in the production plan.
 */
export function recommendSize(garment: Garment, body: Measurements): Recommendation {
  const stretchCm = garment.fabric.stretch * body.chest

  const results: SizeResult[] = garment.sizes.map((size) => {
    const zones: ZoneFit[] = (
      [
        ['Chest', size.chest - body.chest],
        ['Waist', size.waist - body.waist],
        ['Hips', size.hips - body.hips],
      ] as const
    ).map(([zone, ease]) => ({ zone, ease, verdict: verdictFor(ease, stretchCm) }))

    // ideal ease target of 4cm; penalize deviation, penalize compression harder
    const score = zones.reduce((acc, z) => {
      const dev = z.ease - 4
      const penalty = dev < 0 ? Math.abs(dev) * 1.6 : dev
      return acc - penalty
    }, 100)

    return { size, score, zones }
  })

  const sorted = [...results].sort((a, b) => b.score - a.score)
  const best = sorted[0]
  const runnerUp = sorted[1]
  const margin = runnerUp ? best.score - runnerUp.score : 20
  const confidence = Math.round(Math.min(97, Math.max(58, 70 + margin * 2.2)))

  return { best, all: results, confidence }
}
