'use client'

import { Button } from '@/components/ui/button'
import { useStudioStore } from '@/lib/studio-store'
import type { Measurements } from '@/lib/size-ai'

const SLIDERS: { key: keyof Measurements; label: string; min: number; max: number; unit: string }[] = [
  { key: 'height', label: 'Height', min: 150, max: 200, unit: 'cm' },
  { key: 'chest', label: 'Chest', min: 80, max: 125, unit: 'cm' },
  { key: 'waist', label: 'Waist', min: 60, max: 115, unit: 'cm' },
  { key: 'hips', label: 'Hips', min: 80, max: 130, unit: 'cm' },
]

export function MeasurementPanel() {
  const measurements = useStudioStore((s) => s.measurements)
  const setMeasurement = useStudioStore((s) => s.setMeasurement)
  const setStep = useStudioStore((s) => s.setStep)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-xs text-muted-foreground">STEP 3 / 3 — CALIBRATE</span>
        <h2 className="text-xl font-semibold">Your measurements</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Extracted from your photos. Fine-tune anything — the avatar updates live.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {SLIDERS.map((s) => (
          <div key={s.key} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor={`slider-${s.key}`} className="text-sm font-medium">
                {s.label}
              </label>
              <span className="font-mono text-sm text-primary">
                {measurements[s.key]}
                <span className="text-muted-foreground"> {s.unit}</span>
              </span>
            </div>
            <input
              id={`slider-${s.key}`}
              type="range"
              min={s.min}
              max={s.max}
              step={1}
              value={measurements[s.key]}
              onChange={(e) => setMeasurement(s.key, Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
            />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="font-mono text-xs text-muted-foreground leading-relaxed">
          CONFIDENCE: 94% · landmark reprojection error 2.1px · shape prior within 1σ of
          population mean
        </p>
      </div>

      <Button size="lg" onClick={() => setStep('tryon')}>
        Looks right — start trying on
      </Button>
    </div>
  )
}
