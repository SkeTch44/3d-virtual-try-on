'use client'

import { useEffect, useRef } from 'react'
import { Camera, PencilRuler } from 'lucide-react'
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
  const avatarId = useStudioStore((s) => s.avatarId)
  const measurementSource = useStudioStore((s) => s.measurementSource)
  const estimateConfidence = useStudioStore((s) => s.estimateConfidence)

  // Persist manual slider tweaks to the saved avatar (debounced PATCH).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (!avatarId || measurementSource !== 'manual') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch(`/api/avatars/${avatarId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ measurements, source: 'manual' }),
      }).catch(() => {
        // non-fatal: local state is still correct
      })
    }, 600)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [measurements, avatarId, measurementSource])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-xs text-muted-foreground">STEP 3 / 3 — CALIBRATE</span>
        <h2 className="text-xl font-semibold">Your measurements</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {measurementSource === 'photo'
            ? 'Extracted from your photos. Fine-tune anything — the avatar updates live.'
            : 'Manually adjusted. Changes are saved to your device profile automatically.'}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {measurementSource === 'photo' ? (
          <span className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-secondary px-3 py-1 text-xs text-foreground">
            <Camera className="size-3.5 text-primary" aria-hidden="true" />
            Estimated from photos
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs text-foreground">
            <PencilRuler className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Manually adjusted
          </span>
        )}
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

      {estimateConfidence !== null && measurementSource === 'photo' && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-mono text-xs text-muted-foreground leading-relaxed">
            CONFIDENCE: {estimateConfidence}% · MediaPipe pose landmarks · height-calibrated
            ellipse circumference model
          </p>
        </div>
      )}

      <Button size="lg" onClick={() => setStep('tryon')}>
        Looks right — start trying on
      </Button>
    </div>
  )
}
