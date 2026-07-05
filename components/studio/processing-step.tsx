'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStudioStore } from '@/lib/studio-store'
import { extractPose, PoseDetectionError, type PoseExtraction } from '@/lib/pose/landmarker'
import { estimateMeasurements } from '@/lib/pose/measurements'
import { LandmarkOverlay } from './landmark-overlay'
import type { AvatarLandmarks } from '@/lib/pose/types'

const STAGES = [
  { label: 'Uploading photos', detail: 'Private blob storage · device-scoped' },
  { label: 'Extracting body landmarks', detail: 'MediaPipe pose estimation · 33 keypoints' },
  { label: 'Estimating measurements', detail: 'Silhouette calibration · ellipse fitting' },
  { label: 'Saving your avatar', detail: 'Persisted for your next visit' },
]

type Failure = { stage: number; message: string }

export function ProcessingStep() {
  const setStep = useStudioStore((s) => s.setStep)
  const photos = useStudioStore((s) => s.photos)
  const photoPreviews = useStudioStore((s) => s.photoPreviews)
  const heightHint = useStudioStore((s) => s.heightHint)
  const completeProcessing = useStudioStore((s) => s.completeProcessing)

  const [current, setCurrent] = useState(0)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [landmarks, setLandmarks] = useState<AvatarLandmarks | null>(null)
  const [sideSkipped, setSideSkipped] = useState(false)
  const runningRef = useRef(false)
  const [attempt, setAttempt] = useState(0)

  const runPipeline = useCallback(async () => {
    const { front, side } = photos
    if (!front || !side) {
      setFailure({ stage: 0, message: 'Photos are missing — go back and re-add them.' })
      return
    }

    try {
      // Stage 1: upload photos to private Blob storage + create avatar row
      setCurrent(0)
      const form = new FormData()
      form.append('front', front)
      form.append('side', side)
      const uploadRes = await fetch('/api/avatars/photos', { method: 'POST', body: form })
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => null)
        throw new Error(body?.error ?? `Upload failed (${uploadRes.status})`)
      }
      const { avatarId } = (await uploadRes.json()) as { avatarId: string }

      // Stage 2: on-device landmark extraction (MediaPipe)
      setCurrent(1)
      const frontPose = await extractPose(front, 'front')
      let sidePose: PoseExtraction | null = null
      try {
        sidePose = await extractPose(side, 'side')
      } catch (err) {
        // side view is an enhancement — fall back to population depth ratios
        if (err instanceof PoseDetectionError) setSideSkipped(true)
        else throw err
      }
      const extracted: AvatarLandmarks = {
        front: frontPose.landmarks,
        side: sidePose?.landmarks ?? null,
      }
      setLandmarks(extracted)

      // Stage 3: measurement estimation from silhouette + landmarks
      setCurrent(2)
      const estimate = estimateMeasurements(frontPose, sidePose, heightHint)

      // Stage 4: persist landmarks + measurements
      setCurrent(3)
      const patchRes = await fetch(`/api/avatars/${avatarId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landmarks: extracted,
          measurements: estimate.measurements,
          source: 'photo',
          status: 'ready',
        }),
      })
      if (!patchRes.ok) {
        const body = await patchRes.json().catch(() => null)
        throw new Error(body?.error ?? `Saving failed (${patchRes.status})`)
      }

      setCurrent(4)
      // brief pause so the user sees the completed checklist
      setTimeout(() => {
        completeProcessing({
          avatarId,
          measurements: estimate.measurements,
          landmarks: extracted,
          confidence: estimate.confidence,
        })
      }, 700)
    } catch (err) {
      const stage = Math.min(3, currentRef.current)
      const message =
        err instanceof PoseDetectionError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong during processing.'
      setFailure({ stage, message })
    }
  }, [photos, heightHint, completeProcessing])

  // track current stage inside the async closure without re-triggering effects
  const currentRef = useRef(0)
  useEffect(() => {
    currentRef.current = current
  }, [current])

  useEffect(() => {
    if (runningRef.current) return
    runningRef.current = true
    void runPipeline()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  function retry() {
    runningRef.current = false
    setFailure(null)
    setLandmarks(null)
    setSideSkipped(false)
    setCurrent(0)
    setAttempt((a) => a + 1)
  }

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
          const failed = failure !== null && i === failure.stage
          const done = !failed && i < current
          const active = !failure && i === current
          return (
            <li
              key={stage.label}
              className={`flex items-start gap-4 rounded-lg border p-4 transition-colors ${
                failed
                  ? 'border-destructive/60 bg-card'
                  : active
                    ? 'border-primary/50 bg-card'
                    : done
                      ? 'border-border bg-card/50'
                      : 'border-border/50 opacity-50'
              }`}
            >
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                  failed
                    ? 'bg-destructive text-destructive-foreground'
                    : done
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground'
                }`}
              >
                {failed ? (
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                ) : done ? (
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
                {i === 1 && sideSkipped && !failure && (
                  <span className="text-xs text-amber-600 dark:text-amber-500">
                    Side view unclear — using population depth ratios instead
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {landmarks && !failure && (
        <div className="flex w-full justify-center gap-4">
          {photoPreviews.front && (
            <LandmarkOverlay
              photoUrl={photoPreviews.front}
              landmarks={landmarks.front}
              label="FRONT · 33 KEYPOINTS"
            />
          )}
          {photoPreviews.side && landmarks.side && (
            <LandmarkOverlay
              photoUrl={photoPreviews.side}
              landmarks={landmarks.side}
              label="SIDE · 33 KEYPOINTS"
            />
          )}
        </div>
      )}

      {failure ? (
        <div className="flex w-full flex-col items-center gap-4">
          <p className="max-w-sm text-center text-sm text-destructive text-pretty">
            {failure.message}
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep('upload')}>
              Back to photos
            </Button>
            <Button onClick={retry}>Try again</Button>
          </div>
        </div>
      ) : (
        <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${Math.min(100, (current / STAGES.length) * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
