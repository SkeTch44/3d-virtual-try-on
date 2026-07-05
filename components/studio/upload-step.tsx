'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Camera, Check, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStudioStore } from '@/lib/studio-store'

const SLOTS = [
  { key: 'front', label: 'Front view', hint: 'Face the camera, arms slightly out', img: '/images/scan-front.png' },
  { key: 'side', label: 'Side view', hint: 'Turn 90°, arms relaxed', img: '/images/scan-side.png' },
] as const

export function UploadStep() {
  const setStep = useStudioStore((s) => s.setStep)
  const [loaded, setLoaded] = useState<Record<string, boolean>>({})

  const allLoaded = SLOTS.every((s) => loaded[s.key])

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8 px-4 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
          STEP 1 / 3 — CAPTURE
        </span>
        <h1 className="text-3xl font-semibold text-balance">Create your 3D avatar</h1>
        <p className="max-w-md text-muted-foreground leading-relaxed text-pretty">
          Two photos are all it takes. Our pipeline extracts body landmarks and fits a
          parametric body model with measurement accuracy of &plusmn;1.5cm.
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {SLOTS.map((slot) => (
          <button
            key={slot.key}
            type="button"
            onClick={() => setLoaded((l) => ({ ...l, [slot.key]: true }))}
            className={`group relative flex aspect-[3/4] flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border transition-colors ${
              loaded[slot.key] ? 'border-primary/60' : 'border-dashed border-input hover:border-primary/40'
            }`}
            aria-label={loaded[slot.key] ? `${slot.label} photo added` : `Add ${slot.label} photo`}
          >
            {loaded[slot.key] ? (
              <>
                <Image
                  src={slot.img || '/placeholder.svg'}
                  alt={`Sample ${slot.label} body scan photo`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 320px"
                />
                <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-4" aria-hidden="true" />
                </span>
              </>
            ) : (
              <>
                <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground group-hover:text-primary">
                  <Camera className="size-6" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium">{slot.label}</span>
                <span className="px-6 text-center text-xs text-muted-foreground">{slot.hint}</span>
              </>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3">
        {!allLoaded && (
          <Button
            variant="secondary"
            onClick={() => setLoaded({ front: true, side: true })}
            className="gap-2"
          >
            <Upload className="size-4" aria-hidden="true" />
            Use sample photos
          </Button>
        )}
        <Button
          size="lg"
          disabled={!allLoaded}
          onClick={() => setStep('processing')}
          className="min-w-56"
        >
          Generate my avatar
        </Button>
        <p className="text-xs text-muted-foreground">
          Photos are processed on-device in this demo. Nothing is uploaded.
        </p>
      </div>
    </div>
  )
}
