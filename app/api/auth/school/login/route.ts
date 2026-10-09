import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticateSchool, logAudit } from "@/lib/auth"
import { clearAttempts, isRateLimited, recordFailedAttempt } from "@/lib/rate-limit"
import { getSchoolSession } from "@/lib/session"

const credentialsSchema = z.object({ schoolCode: z.string().trim().min(1).max(64), password: z.string().min(1).max(256) })

export async function POST(request: Request) {
  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid school ID or password." }, { status: 400 })

  const forwardedFor = (await headers()).get("x-forwarded-for")
  const ip = forwardedFor?.split(",")[0]?.trim() ?? "unknown"
  const schoolCode = parsed.data.schoolCode.toUpperCase()
  const rateLimitKey = `${ip}:${schoolCode}`

  if (isRateLimited(rateLimitKey)) return NextResponse.json({ error: "Please try again later." }, { status: 429 })

  const school = await authenticateSchool(schoolCode, parsed.data.password)
  if (!school) {
    recordFailedAttempt(rateLimitKey)
    return NextResponse.json({ error: "Invalid school ID or password." }, { status: 401 })
  }

  clearAttempts(rateLimitKey)
  const session = await getSchoolSession()
  session.school = { id: school.id, schoolCode: school.schoolCode, name: school.name, version: school.sessionVersion }
  await session.save()
  await logAudit(`school:${school.id}`, "school_login", school.schoolCode, ip)
  return NextResponse.json({ ok: true })
}
