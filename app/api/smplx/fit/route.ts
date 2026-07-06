import { NextResponse } from 'next/server'
import type { Measurements } from '@/lib/size-ai'
import type { ViewLandmarks } from '@/lib/pose/types'

/**
 * Proxy to the self-hosted SMPL-X fitting service (services/smplx-fitting).
 *
 * The GPU service is optional infrastructure: when SMPLX_SERVICE_URL is not
 * configured (or the service is down / times out), this route responds with
 * 503 and the client falls back to the on-device heuristic pipeline
 * (lib/pose/measurements.ts). The browser never talks to the GPU service
 * directly — the URL stays server-side.
 */

export const maxDuration = 60

const FIT_TIMEOUT_MS = 45_000

/** Must match the slider ranges in the studio UI / avatar PATCH route. */
const RANGES: Record<keyof Measurements, [number, number]> = {
  height: [120, 220],
  chest: [70, 140],
  waist: [50, 130],
  hips: [70, 145],
}

function clampMeasurements(m: Record<string, unknown>): Measurements | null {
  const out: Partial<Measurements> = {}
  for (const key of Object.keys(RANGES) as (keyof Measurements)[]) {
    const v = m[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    const [min, max] = RANGES[key]
    out[key] = Math.round(Math.min(max, Math.max(min, v)))
  }
  return out as Measurements
}

function isViewLandmarks(value: unknown): value is ViewLandmarks {
  return (
    Array.isArray(value) &&
    value.length === 33 &&
    value.every(
      (p) =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as Record<string, unknown>).x === 'number' &&
        typeof (p as Record<string, unknown>).y === 'number' &&
        typeof (p as Record<string, unknown>).z === 'number' &&
        typeof (p as Record<string, unknown>).visibility === 'number',
    )
  )
}

export async function POST(request: Request) {
  const serviceUrl = process.env.SMPLX_SERVICE_URL
  if (!serviceUrl) {
    return NextResponse.json(
      { error: 'SMPL-X service not configured', configured: false },
      { status: 503 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const heightCm = body.heightCm
  if (typeof heightCm !== 'number' || heightCm < 120 || heightCm > 230) {
    return NextResponse.json({ error: 'heightCm must be 120-230' }, { status: 400 })
  }
  if (!isViewLandmarks(body.front)) {
    return NextResponse.json({ error: 'front must be 33 BlazePose keypoints' }, { status: 400 })
  }
  if (body.side != null && !isViewLandmarks(body.side)) {
    return NextResponse.json({ error: 'side must be null or 33 keypoints' }, { status: 400 })
  }

  try {
    const res = await fetch(`${serviceUrl.replace(/\/$/, '')}/fit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        height_cm: heightCm,
        gender: 'neutral',
        front: body.front,
        side: body.side ?? null,
        return_mesh: false,
      }),
      signal: AbortSignal.timeout(FIT_TIMEOUT_MS),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `SMPL-X service error (${res.status})`, detail: detail.slice(0, 500) },
        { status: 502 },
      )
    }

    const data = (await res.json()) as {
      betas: number[]
      measurements: Record<string, unknown>
      confidence: number
    }

    const measurements = clampMeasurements(data.measurements)
    if (!measurements) {
      return NextResponse.json({ error: 'SMPL-X service returned malformed measurements' }, { status: 502 })
    }

    return NextResponse.json({
      measurements,
      /** 0-100 to match the heuristic pipeline's confidence scale */
      confidence: Math.round(Math.min(1, Math.max(0, data.confidence)) * 100),
      betas: data.betas,
      source: 'smplx' as const,
    })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    return NextResponse.json(
      { error: timedOut ? 'SMPL-X service timed out' : 'SMPL-X service unreachable' },
      { status: 503 },
    )
  }
}
