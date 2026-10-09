import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticateAdmin, logAudit } from "@/lib/auth"
import { clearAttempts, isRateLimited, recordFailedAttempt } from "@/lib/rate-limit"
import { getAdminSession } from "@/lib/session"
import { getSettings } from "@/lib/settings"

const credentialsSchema = z.object({ password: z.string().min(1).max(256) })

export async function POST(request: Request) {
  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid password." }, { status: 400 })

  const forwardedFor = (await headers()).get("x-forwarded-for")
  const ip = forwardedFor?.split(",")[0]?.trim() ?? "unknown"
  const rateLimitKey = `admin:${ip}`
  if (isRateLimited(rateLimitKey)) return NextResponse.json({ error: "Please try again later." }, { status: 429 })

  if (!(await authenticateAdmin(parsed.data.password))) {
    recordFailedAttempt(rateLimitKey)
    return NextResponse.json({ error: "Invalid password." }, { status: 401 })
  }

  clearAttempts(rateLimitKey)
  const session = await getAdminSession()
  session.admin = { authenticatedAt: Date.now(), version: (await getSettings()).adminSessionVersion }
  await session.save()
  await logAudit("admin", "admin_login", "admin", ip)
  return NextResponse.json({ ok: true })
}
