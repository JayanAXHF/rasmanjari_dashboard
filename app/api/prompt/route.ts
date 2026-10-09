import fs from "node:fs/promises"
import { NextResponse } from "next/server"

import { getSchoolSession } from "@/lib/session"
import { getSettings } from "@/lib/settings"

export const runtime = "nodejs"

export async function GET() {
  const session = await getSchoolSession()
  if (!session.school) return new NextResponse(null, { status: 401 })
  const setting = await getSettings()
  if (!setting.promptImagePath || (setting.submissionsOpenAt && new Date() < setting.submissionsOpenAt)) return new NextResponse(null, { status: 404 })
  try {
    const content = await fs.readFile(setting.promptImagePath)
    return new NextResponse(content, { headers: { "content-type": "image/png", "cache-control": "private, no-store" } })
  } catch { return new NextResponse(null, { status: 404 }) }
}
