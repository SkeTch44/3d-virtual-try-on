import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { avatars } from '@/lib/db/schema'
import { getOrCreateDeviceId } from '@/lib/device-id'
import type { Measurements } from '@/lib/size-ai'
import type { AvatarLandmarks, ViewLandmarks } from '@/lib/pose/types'

/** Must match the slider ranges in the studio UI. */
const RANGES: Record<keyof Measurements, [number, number]> = {
  height: [120, 220],
  chest: [70, 140],
  waist: [50, 130],
  hips: [70, 145],
}

function validateMeasurements(value: unknown): Measurements | null {
  if (typeof value !== 'object' || value === null) return null
  const m = value as Record<string, unknown>
  const out: Partial<Measurements> = {}
  for (const key of Object.keys(RANGES) as (keyof Measurements)[]) {
    const v = m[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    const [min, max] = RANGES[key]
    if (v < min || v > max) return null
    out[key] = Math.round(v * 10) / 10
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
        typeof p.x === 'number' &&
        typeof p.y === 'number' &&
        typeof p.z === 'number' &&
        typeof p.visibility === 'number',
    )
  )
}

function validateLandmarks(value: unknown): AvatarLandmarks | null {
  if (typeof value !== 'object' || value === null) return null
  const l = value as Record<string, unknown>
  if (!isViewLandmarks(l.front)) return null
  if (l.side !== null && !isViewLandmarks(l.side)) return null
  return { front: l.front, side: l.side as ViewLandmarks | null }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const deviceId = await getOrCreateDeviceId()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Partial<typeof avatars.$inferInsert> = { updatedAt: new Date() }

  if (body.measurements !== undefined) {
    const measurements = validateMeasurements(body.measurements)
    if (!measurements) {
      return NextResponse.json({ error: 'Measurements out of valid range' }, { status: 400 })
    }
    updates.measurements = measurements
  }

  if (body.landmarks !== undefined) {
    const landmarks = validateLandmarks(body.landmarks)
    if (!landmarks) {
      return NextResponse.json({ error: 'Malformed landmarks payload' }, { status: 400 })
    }
    updates.landmarks = landmarks
  }

  if (body.source !== undefined) {
    if (body.source !== 'photo' && body.source !== 'manual') {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    }
    updates.source = body.source
  }

  if (body.status !== undefined) {
    if (body.status !== 'processing' && body.status !== 'ready' && body.status !== 'failed') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    updates.status = body.status
  }

  const [row] = await db
    .update(avatars)
    .set(updates)
    .where(and(eq(avatars.id, id), eq(avatars.deviceId, deviceId)))
    .returning({ id: avatars.id, status: avatars.status })

  if (!row) {
    return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, avatarId: row.id, status: row.status })
}
