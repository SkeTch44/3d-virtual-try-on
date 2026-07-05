import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { Measurements } from '../size-ai'
import type { AvatarLandmarks } from '../pose/types'

export const avatars = pgTable(
  'avatars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: text('device_id').notNull(),
    frontPhotoUrl: text('front_photo_url'),
    sidePhotoUrl: text('side_photo_url'),
    landmarks: jsonb('landmarks').$type<AvatarLandmarks>(),
    measurements: jsonb('measurements').$type<Measurements>(),
    source: text('source').notNull().default('photo'),
    status: text('status').notNull().default('processing'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('avatars_device_id_idx').on(t.deviceId, t.createdAt)],
)

export type AvatarRow = typeof avatars.$inferSelect
