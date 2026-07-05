'use client'

import { useMemo } from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { recommendSize } from '@/lib/size-ai'
import { useStudioStore } from '@/lib/studio-store'

const VERDICT_STYLES: Record<string, string> = {
  tight: 'text-[#e5484d]',
  fitted: 'text-[#46a758]',
  relaxed: 'text-[#46a758]',
  loose: 'text-[#3f7fd6]',
}

export function FitPanel() {
  const garment = useStudioStore((s) => s.garment)
  const measurements = useStudioStore((s) => s.measurements)
  const selectedSize = useStudioStore((s) => s.selectedSize)
  const setSelectedSize = useStudioStore((s) => s.setSelectedSize)
  const heatmap = useStudioStore((s) => s.heatmap)
  const setHeatmap = useStudioStore((s) => s.setHeatmap)
  const resetSim = useStudioStore((s) => s.resetSim)

  const rec = useMemo(
    () => (garment ? recommendSize(garment, measurements) : null),
    [garment, measurements],
  )

  if (!garment || !rec) return null

  const current = rec.all.find((r) => r.size.label === selectedSize) ?? rec.best
  const bestIsSelected = rec.best.size.label === selectedSize

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Fit analysis</h2>
        <Button variant="ghost" size="sm" onClick={resetSim} className="gap-1.5 text-muted-foreground">
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Re-drape
        </Button>
      </div>

      {/* AI recommendation */}
      <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-card p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-medium">AI size prediction</span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <span className="text-3xl font-semibold text-primary">{rec.best.size.label}</span>
            <span className="ml-2 text-sm text-muted-foreground">recommended</span>
          </div>
          <div className="text-right">
            <span className="font-mono text-xl">{rec.confidence}%</span>
            <p className="text-xs text-muted-foreground">confidence</p>
          </div>
        </div>
        {!bestIsSelected && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSelectedSize(rec.best.size.label)}
          >
            Switch to size {rec.best.size.label}
          </Button>
        )}
      </div>

      {/* zone breakdown for the size being viewed */}
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <span className="font-mono text-xs text-muted-foreground">
          SIZE {current.size.label} — ZONE BREAKDOWN
        </span>
        {current.zones.map((z) => (
          <div key={z.zone} className="flex items-center justify-between text-sm">
            <span>{z.zone}</span>
            <span className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground">
                {z.ease >= 0 ? '+' : ''}
                {z.ease.toFixed(0)}cm ease
              </span>
              <span className={`font-mono text-xs uppercase ${VERDICT_STYLES[z.verdict]}`}>{z.verdict}</span>
            </span>
          </div>
        ))}
      </div>

      {/* heatmap toggle */}
      <button
        type="button"
        onClick={() => setHeatmap(!heatmap)}
        className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
          heatmap ? 'border-primary/60 bg-card' : 'border-border hover:border-primary/30'
        }`}
        aria-pressed={heatmap}
      >
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-sm font-medium">Fit heatmap</span>
          <span className="text-xs text-muted-foreground">Strain visualization on the cloth</span>
        </div>
        <span
          className={`relative h-6 w-11 rounded-full transition-colors ${heatmap ? 'bg-primary' : 'bg-secondary'}`}
          aria-hidden="true"
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-background transition-all ${
              heatmap ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </span>
      </button>

      {heatmap && (
        <div className="flex items-center gap-2 px-1">
          <span className="size-3 rounded-full bg-[#e5484d]" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">Tight</span>
          <span className="ml-2 size-3 rounded-full bg-[#46a758]" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">Good fit</span>
          <span className="ml-2 size-3 rounded-full bg-[#3f7fd6]" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">Loose</span>
        </div>
      )}
    </div>
  )
}
