import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { avatars, type SmplxFit } from '@/lib/db/schema'
import { getOrCreateDeviceId } from '@/lib/device-id'
import type { Measurements } from '@/lib/size-ai'

/** Must match the slider ranges in the studio UI. */
const RANGES: Record<keyof Measurements, [number, number]> = {
  height: [120, 220],
  chest: [70, 140],
  waist: [50, 130],
  hips: [70, 145],
}

type ServiceFitResponse = {
  betas: number[]
  measurements: Record<string, number>
  confidence: number
  vertices_count: number
}

function validateServiceResponse(value: unknown): ServiceFitResponse | null {
  if (typeof value !== 'object' || value === null) return null
  const r = value as Record<string, unknown>
  if (!Array.isArray(r.betas) || r.betas.length === 0) return null
  if (!r.betas.every((b) => typeof b === 'number' && Number.isFinite(b))) return null
  if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) return null
  if (typeof r.measurements !== 'object' || r.measurements === null) return null
  const m = r.measurements as Record<string, unknown>
  for (const key of Object.keys(RANGES) as (keyof Measurements)[]) {
    const v = m[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
  }
  return r as ServiceFitResponse
}

/** Clamp service measurements into the app's valid slider ranges. */
function clampMeasurements(m: Record<string, number>): Measurements {
  const out = {} as Measurements
  for (const key of Object.keys(RANGES) as (keyof Measurements)[]) {
    const [min, max] = RANGES[key]
    out[key] = Math.round(Math.min(max, Math.max(min, m[key])))
  }
  return out
}

/**
 * POST /api/avatars/[id]/smplx
 *
 * Server-side proxy to the SMPL-X fitting service (services/smplx-fitting).
 * Keeps SMPLX_SERVICE_URL off the client. When the service is not deployed
 * (env var unset) or fails, responds with { available: false } so the client
 * keeps the in-browser heuristic estimate — the UX degrades gracefully.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const serviceUrl = process.env.SMPLX_SERVICE_URL
  if (!serviceUrl) {
    return NextResponse.json({ available: false, reason: 'service_not_configured' })
  }

  const { id } = await params
  const deviceId = await getOrCreateDeviceId()

  // Ownership check: the avatar row must belong to this device.
  const [row] = await db
    .select({ id: avatars.id, landmarks: avatars.landmarks })
    .from(avatars)
    .where(and(eq(avatars.id, id), eq(avatars.deviceId, deviceId)))
    .limit(1)
  if (!row) {
    return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
  }

  let body: { heightCm?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const heightCm = body.heightCm
  if (typeof heightCm !== 'number' || heightCm < 120 || heightCm > 220) {
    return NextResponse.json({ error: 'heightCm out of range' }, { status: 400 })
  }
  if (!row.landmarks?.front) {
    return NextResponse.json({ error: 'Avatar has no landmarks to fit' }, { status: 409 })
  }

  // Forward to the fitting service using its FitRequest schema.
  let fit: ServiceFitResponse
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 90_000) // CPU fits can take ~60s
    const res = await fetch(`${serviceUrl.replace(/\/$/, '')}/fit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        height_cm: heightCm,
        gender: 'neutral',
        front: row.landmarks.front,
        side: row.landmarks.side,
        return_mesh: false,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      return NextResponse.json({ available: false, reason: `service_error_${res.status}` })
    }
    const parsed = validateServiceResponse(await res.json())
    if (!parsed) {
      return NextResponse.json({ available: false, reason: 'malformed_service_response' })
    }
    fit = parsed
  } catch {
    return NextResponse.json({ available: false, reason: 'service_unreachable' })
  }

  const measurements = clampMeasurements(fit.measurements)
  const smplx: SmplxFit = {
    betas: fit.betas,
    confidence: fit.confidence,
    fittedAt: new Date().toISOString(),
  }

  await db
    .update(avatars)
    .set({ measurements, smplx, updatedAt: new Date() })
    .where(and(eq(avatars.id, id), eq(avatars.deviceId, deviceId)))

  return NextResponse.json({
    available: true,
    measurements,
    betas: fit.betas,
    confidence: fit.confidence,
  })
}
