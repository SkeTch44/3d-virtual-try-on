import { cookies } from 'next/headers'

const COOKIE_NAME = 'tryon_device_id'
const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * Anonymous device identity. Issues an httpOnly cookie on first write-path
 * API call; all avatar rows are scoped by this ID. Stands in for user
 * accounts until auth lands in a later phase.
 *
 * Only call from Route Handlers or Server Actions (cookie writes are not
 * allowed during RSC render).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const store = await cookies()
  const existing = store.get(COOKIE_NAME)?.value
  if (existing) return existing

  const id = crypto.randomUUID()
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    // The v0 preview renders inside a cross-site iframe; without
    // SameSite=None + Secure the browser silently drops the cookie.
    sameSite: 'none',
    secure: true,
    path: '/',
    maxAge: ONE_YEAR,
  })
  return id
}

/** Read-only variant for GET routes: returns null instead of setting a cookie. */
export async function getDeviceId(): Promise<string | null> {
  const store = await cookies()
  return store.get(COOKIE_NAME)?.value ?? null
}
