import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { avatars } from '@/lib/db/schema'
import { getOrCreateDeviceId } from '@/lib/device-id'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 8 * 1024 * 1024 // 8MB

function validatePhoto(file: unknown, label: string): File | { error: string } {
  if (!(file instanceof File)) return { error: `Missing ${label} photo` }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: `${label} photo must be JPEG, PNG, or WebP` }
  }
  if (file.size > MAX_BYTES) {
    return { error: `${label} photo exceeds the 8MB limit` }
  }
  return file
}

export async function POST(request: Request) {
  const deviceId = await getOrCreateDeviceId()

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const front = validatePhoto(form.get('front'), 'Front')
  if ('error' in front) return NextResponse.json({ error: front.error }, { status: 400 })
  const side = validatePhoto(form.get('side'), 'Side')
  if ('error' in side) return NextResponse.json({ error: side.error }, { status: 400 })

  const ext = (type: string) => (type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg')

  const [frontBlob, sideBlob] = await Promise.all([
    put(`avatars/${deviceId}/front.${ext(front.type)}`, front, {
      access: 'private',
      addRandomSuffix: true,
    }),
    put(`avatars/${deviceId}/side.${ext(side.type)}`, side, {
      access: 'private',
      addRandomSuffix: true,
    }),
  ])

  const [row] = await db
    .insert(avatars)
    .values({
      deviceId,
      frontPhotoUrl: frontBlob.url,
      sidePhotoUrl: sideBlob.url,
      status: 'processing',
    })
    .returning({ id: avatars.id })

  return NextResponse.json({
    avatarId: row.id,
    frontUrl: frontBlob.url,
    sideUrl: sideBlob.url,
  })
}
