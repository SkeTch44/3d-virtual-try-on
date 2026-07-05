'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useStudioStore } from '@/lib/studio-store'

const STAGES = [
  { label: 'Extracting body landmarks', detail: 'MediaPipe pose estimation · 33 keypoints' },
  { label: 'Fitting parametric body model', detail: 'SMPL-X optimization · 10 shape coefficients' },
  { label: 'Estimating measurements', detail: 'Chest, waist, hips, inseam ±1.5cm' },
  { label: 'Generating avatar mesh', detail: 'Watertight mesh · collision SDF baked' },
]

const STAGE_MS = 1100

export function ProcessingStep() {
  const setStep = useStudioStore((s) => s.setStep)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (current >= STAGES.length) {
      const t = setTimeout(() => setStep('avatar'), 500)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setCurrent((c) => c + 1), STAGE_MS)
    return () => clearTimeout(t)
  }, [current, setStep])

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-10 px-4 py-24">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
          STEP 2 / 3 — RECONSTRUCTION
        </span>
        <h1 className="text-2xl font-semibold">Building your avatar</h1>
      </div>

      <ol className="flex w-full flex-col gap-4">
        {STAGES.map((stage, i) => {
          const done = i < current
          const active = i === current
          return (
            <li
              key={stage.label}
              className={`flex items-start gap-4 rounded-lg border p-4 transition-colors ${
                active ? 'border-primary/50 bg-card' : done ? 'border-border bg-card/50' : 'border-border/50 opacity-50'
              }`}
            >
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                  done ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {done ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : active ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <span className="font-mono text-[10px]">{i + 1}</span>
                )}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{stage.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{stage.detail}</span>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all duration-700"
          style={{ width: `${Math.min(100, (current / STAGES.length) * 100)}%` }}
        />
      </div>
    </div>
  )
}
