'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Loader2, RotateCcw, Upload, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStudioStore } from '@/lib/studio-store'
import { preloadLandmarker } from '@/lib/pose/landmarker'

const SLOTS = [
  {
    key: 'front',
    label: 'Front view',
    hint: 'Face the camera, arms slightly out, full body in frame',
    sample: '/images/scan-front.png',
  },
  {
    key: 'side',
    label: 'Side view',
    hint: 'Turn 90°, arms relaxed, full body in frame',
    sample: '/images/scan-side.png',
  },
] as const

export function UploadStep() {
  const setStep = useStudioStore((s) => s.setStep)
  const photos = useStudioStore((s) => s.photos)
  const photoPreviews = useStudioStore((s) => s.photoPreviews)
  const setPhoto = useStudioStore((s) => s.setPhoto)
  const heightHint = useStudioStore((s) => s.heightHint)
  const setHeightHint = useStudioStore((s) => s.setHeightHint)
  const savedAvatar = useStudioStore((s) => s.savedAvatar)
  const useSavedAvatar = useStudioStore((s) => s.useSavedAvatar)

  const [loadingSamples, setLoadingSamples] = useState(false)
  const [sampleError, setSampleError] = useState<string | null>(null)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Warm the MediaPipe WASM + model download while the user picks photos.
  useEffect(() => {
    preloadLandmarker()
  }, [])

  const allLoaded = Boolean(photos.front && photos.side)
  const heightValid = heightHint >= 120 && heightHint <= 220

  async function loadSamplePhotos() {
    setLoadingSamples(true)
    setSampleError(null)
    try {
      const files = await Promise.all(
        SLOTS.map(async (slot) => {
          const res = await fetch(slot.sample)
          if (!res.ok) throw new Error(`Failed to load sample (${res.status})`)
          const blob = await res.blob()
          return new File([blob], `sample-${slot.key}.png`, { type: 'image/png' })
        }),
      )
      setPhoto('front', files[0])
      setPhoto('side', files[1])
    } catch {
      setSampleError('Could not load the sample photos. Try uploading your own.')
    } finally {
      setLoadingSamples(false)
    }
  }

  function onFileChosen(key: 'front' | 'side', fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    setPhoto(key, file)
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8 px-4 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
          STEP 1 / 3 — CAPTURE
        </span>
        <h1 className="text-3xl font-semibold text-balance">Create your 3D avatar</h1>
        <p className="max-w-md text-muted-foreground leading-relaxed text-pretty">
          Two photos are all it takes. Pose landmarks are extracted on-device with MediaPipe,
          then your measurements drive a parametric body model.
        </p>
      </div>

      {savedAvatar && (
        <div className="flex w-full items-center justify-between gap-4 rounded-xl border border-primary/40 bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
              <UserRound className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Welcome back</span>
              <span className="text-xs text-muted-foreground">
                We found your saved avatar ({savedAvatar.measurements.height}cm ·{' '}
                {savedAvatar.measurements.chest}cm chest)
              </span>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={useSavedAvatar}>
            Continue
          </Button>
        </div>
      )}

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {SLOTS.map((slot) => {
          const preview = photoPreviews[slot.key]
          return (
            <div key={slot.key} className="flex flex-col gap-2">
              <input
                ref={(el) => {
                  inputRefs.current[slot.key] = el
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label={`Choose ${slot.label} photo`}
                onChange={(e) => onFileChosen(slot.key, e.target.files)}
              />
              <button
                type="button"
                onClick={() => inputRefs.current[slot.key]?.click()}
                className={`group relative flex aspect-[3/4] flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border transition-colors ${
                  preview
                    ? 'border-primary/60'
                    : 'border-dashed border-input hover:border-primary/40'
                }`}
                aria-label={preview ? `Replace ${slot.label} photo` : `Add ${slot.label} photo`}
              >
                {preview ? (
                  <>
                    {/* object URL preview of the user's actual photo */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview || '/placeholder.svg'}
                      alt={`Your ${slot.label} photo`}
                      className="absolute inset-0 size-full object-cover"
                    />
                    <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-4" aria-hidden="true" />
                    </span>
                    <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
                      <RotateCcw className="size-3" aria-hidden="true" />
                      Tap to replace
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground group-hover:text-primary">
                      <Camera className="size-6" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-medium">{slot.label}</span>
                    <span className="px-6 text-center text-xs text-muted-foreground">
                      {slot.hint}
                    </span>
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <label htmlFor="height-input" className="text-sm font-medium">
          Your height
          <span className="ml-2 font-normal text-muted-foreground">(calibrates the scan)</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id="height-input"
            type="number"
            min={120}
            max={220}
            value={heightHint}
            onChange={(e) => setHeightHint(Number(e.target.value))}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="text-sm text-muted-foreground">cm</span>
        </div>
        {!heightValid && (
          <p className="text-xs text-destructive">Enter a height between 120 and 220 cm.</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        {!allLoaded && (
          <Button
            variant="secondary"
            onClick={loadSamplePhotos}
            disabled={loadingSamples}
            className="gap-2"
          >
            {loadingSamples ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            Use sample photos
          </Button>
        )}
        {sampleError && <p className="text-xs text-destructive">{sampleError}</p>}
        <Button
          size="lg"
          disabled={!allLoaded || !heightValid}
          onClick={() => setStep('processing')}
          className="min-w-56"
        >
          Generate my avatar
        </Button>
        <p className="max-w-sm text-center text-xs text-muted-foreground text-pretty">
          Landmark extraction runs on-device. Photos are stored privately to your device profile
          and never shared.
        </p>
      </div>
    </div>
  )
}
