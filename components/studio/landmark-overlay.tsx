'use client'

import { useEffect, useRef } from 'react'
import type { ViewLandmarks } from '@/lib/pose/types'

/** BlazePose skeleton edges (torso + limbs) */
const EDGES: [number, number][] = [
  [11, 12], // shoulders
  [11, 23],
  [12, 24], // flanks
  [23, 24], // hips
  [11, 13],
  [13, 15], // left arm
  [12, 14],
  [14, 16], // right arm
  [23, 25],
  [25, 27], // left leg
  [24, 26],
  [26, 28], // right leg
  [27, 31],
  [28, 32], // feet
]

type Props = {
  photoUrl: string
  landmarks: ViewLandmarks
  label: string
}

/**
 * Draws the captured photo with the detected 33-keypoint skeleton on top —
 * visual proof the extraction is real, and a debugging aid for bad captures.
 */
export function LandmarkOverlay({ photoUrl, landmarks, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const maxW = 320
      const scale = Math.min(1, maxW / img.width)
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const px = (p: { x: number; y: number }) => [p.x * canvas.width, p.y * canvas.height] as const

      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.9)'
      for (const [a, b] of EDGES) {
        const pa = landmarks[a]
        const pb = landmarks[b]
        if (!pa || !pb || pa.visibility < 0.3 || pb.visibility < 0.3) continue
        const [ax, ay] = px(pa)
        const [bx, by] = px(pb)
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
      }

      ctx.fillStyle = 'rgba(16, 185, 129, 1)'
      for (const p of landmarks) {
        if (p.visibility < 0.3) continue
        const [x, y] = px(p)
        ctx.beginPath()
        ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    img.src = photoUrl
  }, [photoUrl, landmarks])

  return (
    <figure className="flex flex-col items-center gap-1.5">
      <canvas
        ref={canvasRef}
        className="w-full max-w-40 rounded-lg border border-border"
        role="img"
        aria-label={`${label} photo with detected body landmarks`}
      />
      <figcaption className="font-mono text-[10px] text-muted-foreground">{label}</figcaption>
    </figure>
  )
}
