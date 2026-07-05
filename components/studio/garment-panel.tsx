'use client'

import { GARMENTS } from '@/lib/garments'
import { useStudioStore } from '@/lib/studio-store'

export function GarmentPanel() {
  const garment = useStudioStore((s) => s.garment)
  const selectGarment = useStudioStore((s) => s.selectGarment)
  const selectedSize = useStudioStore((s) => s.selectedSize)
  const setSelectedSize = useStudioStore((s) => s.setSelectedSize)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Garments</h2>
        <p className="text-sm text-muted-foreground">
          Each fabric carries measured physical properties into the solver.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {GARMENTS.map((g) => {
          const active = garment?.id === g.id
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => selectGarment(g)}
              className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ${
                active ? 'border-primary/60 bg-card' : 'border-border hover:border-primary/30'
              }`}
              aria-pressed={active}
            >
              <span className="size-5 rounded-full border border-border" style={{ backgroundColor: g.color }} />
              <span className="text-sm font-medium leading-tight">{g.name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {g.fabric.name} · {g.fabric.gsm}gsm
              </span>
              <span className="font-mono text-xs">${g.price}</span>
            </button>
          )
        })}
      </div>

      {garment && (
        <>
          <p className="text-xs text-muted-foreground leading-relaxed">{garment.description}</p>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Size</span>
            <div className="flex gap-2">
              {garment.sizes.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setSelectedSize(s.label)}
                  className={`flex h-9 w-12 items-center justify-center rounded-md border font-mono text-sm transition-colors ${
                    selectedSize === s.label
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:border-primary/40'
                  }`}
                  aria-pressed={selectedSize === s.label}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
