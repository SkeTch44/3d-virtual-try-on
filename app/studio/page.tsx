'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft } from 'lucide-react'
import { useStudioStore } from '@/lib/studio-store'
import { UploadStep } from '@/components/studio/upload-step'
import { ProcessingStep } from '@/components/studio/processing-step'
import { MeasurementPanel } from '@/components/studio/measurement-panel'
import { GarmentPanel } from '@/components/studio/garment-panel'
import { FitPanel } from '@/components/studio/fit-panel'

const StudioScene = dynamic(
  () => import('@/components/studio/studio-scene').then((m) => m.StudioScene),
  { ssr: false },
)

export default function StudioPage() {
  const step = useStudioStore((s) => s.step)
  const setStep = useStudioStore((s) => s.setStep)
  const hydrationChecked = useStudioStore((s) => s.hydrationChecked)
  const setSavedAvatar = useStudioStore((s) => s.setSavedAvatar)

  // Session restore: look up the device's latest saved avatar once per visit.
  useEffect(() => {
    if (hydrationChecked) return
    let cancelled = false
    fetch('/api/avatars/latest')
      .then((res) => (res.ok ? res.json() : { avatar: null }))
      .then(({ avatar }) => {
        if (!cancelled) setSavedAvatar(avatar ?? null)
      })
      .catch(() => {
        if (!cancelled) setSavedAvatar(null)
      })
    return () => {
      cancelled = true
    }
  }, [hydrationChecked, setSavedAvatar])

  const has3D = step === 'avatar' || step === 'tryon'

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Back</span>
          </Link>
          <span className="font-semibold tracking-tight">
            Drape<span className="text-primary">AI</span>
            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">STUDIO</span>
          </span>
        </div>
        {has3D && (
          <nav className="flex items-center gap-1" aria-label="Studio steps">
            <button
              type="button"
              onClick={() => setStep('avatar')}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                step === 'avatar' ? 'bg-secondary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Avatar
            </button>
            <button
              type="button"
              onClick={() => setStep('tryon')}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                step === 'tryon' ? 'bg-secondary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Try-on
            </button>
          </nav>
        )}
      </header>

      {step === 'upload' && (
        <main className="flex-1">
          <UploadStep />
        </main>
      )}
      {step === 'processing' && (
        <main className="flex-1">
          <ProcessingStep />
        </main>
      )}

      {has3D && (
        <main className="flex flex-1 flex-col lg:flex-row">
          {/* 3D viewport */}
          <div className="relative h-[52vh] min-h-80 flex-1 lg:h-auto">
            <StudioScene showCloth={step === 'tryon'} />
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-background/70 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur">
              {step === 'tryon'
                ? 'XPBD CLOTH SOLVER · 60HZ · LIVE'
                : 'PARAMETRIC BODY MODEL · DRAG TO ORBIT'}
            </div>
          </div>

          {/* side panel */}
          <aside className="w-full shrink-0 overflow-y-auto border-t border-border p-5 lg:h-[calc(100vh-3.5rem)] lg:w-96 lg:border-l lg:border-t-0">
            {step === 'avatar' ? (
              <MeasurementPanel />
            ) : (
              <div className="flex flex-col gap-8">
                <GarmentPanel />
                <FitPanel />
              </div>
            )}
          </aside>
        </main>
      )}
    </div>
  )
}
