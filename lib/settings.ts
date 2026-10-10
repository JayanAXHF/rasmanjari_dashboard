import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"

export const defaultSettings = {
  id: 1,
  promptImagePath: null,
  submissionsOpenAt: null,
  submissionsCloseAt: null,
  maxFileSizeMB: 50,
  adminSessionVersion: 0,
  judgePasswordHash: null,
  judgeSessionVersion: 0,
}

export async function getSettings() {
  return (
    (await db.query.settings.findFirst({ where: eq(settings.id, 1) })) ??
    defaultSettings
  )
}

export function submissionWindowState(
  setting: Awaited<ReturnType<typeof getSettings>>,
  now = new Date()
) {
  if (!setting.submissionsOpenAt || !setting.submissionsCloseAt)
    return "not-configured" as const
  if (now < setting.submissionsOpenAt) return "upcoming" as const
  if (now > setting.submissionsCloseAt) return "closed" as const
  return "open" as const
}
