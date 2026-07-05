import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { avatars } from '@/lib/db/schema'
import { getDeviceId } from '@/lib/device-id'

export async function GET() {
  const deviceId = await getDeviceId()
  if (!deviceId) return NextResponse.json({ avatar: null })

  const [row] = await db
    .select({
      id: avatars.id,
      measurements: avatars.measurements,
      landmarks: avatars.landmarks,
      source: avatars.source,
      createdAt: avatars.createdAt,
    })
    .from(avatars)
    .where(and(eq(avatars.deviceId, deviceId), eq(avatars.status, 'ready')))
    .orderBy(desc(avatars.createdAt))
    .limit(1)

  if (!row || !row.measurements) return NextResponse.json({ avatar: null })

  return NextResponse.json({
    avatar: {
      id: row.id,
      measurements: row.measurements,
      landmarks: row.landmarks,
      source: row.source,
      createdAt: row.createdAt,
    },
  })
}
