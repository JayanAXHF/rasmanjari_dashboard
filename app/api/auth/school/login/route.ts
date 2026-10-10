import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticateSchool, logAudit } from "@/lib/auth"
import { clearAttempts, isRateLimited, recordFailedAttempt } from "@/lib/rate-limit"
import { getSchoolSession } from "@/lib/session"

const credentialsSchema = z.object({ schoolCode: z.string().trim().min(1).max(64), password: z.string().min(1).max(256) })

export async function POST(request: Request) {
  const formSubmission = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded") ?? false
  const body = formSubmission ? Object.fromEntries(await request.formData()) : await request.json().catch(() => null)
  const parsed = credentialsSchema.safeParse(body)
  if (!parsed.success) return loginFailure(request, formSubmission, "Invalid school ID or password.", 400)

  const forwardedFor = (await headers()).get("x-forwarded-for")
  const ip = forwardedFor?.split(",")[0]?.trim() ?? "unknown"
  const schoolCode = parsed.data.schoolCode.toUpperCase()
  const rateLimitKey = `${ip}:${schoolCode}`

  if (isRateLimited(rateLimitKey)) return loginFailure(request, formSubmission, "Please try again later.", 429)

  const school = await authenticateSchool(schoolCode, parsed.data.password)
  if (!school) {
    recordFailedAttempt(rateLimitKey)
    return loginFailure(request, formSubmission, "Invalid school ID or password.", 401)
  }

  clearAttempts(rateLimitKey)
  const session = await getSchoolSession()
  session.school = { id: school.id, schoolCode: school.schoolCode, name: school.name, version: school.sessionVersion }
  await session.save()
  await logAudit(`school:${school.id}`, "school_login", school.schoolCode, ip)
  return formSubmission ? redirectTo(request, "/dashboard") : NextResponse.json({ ok: true })
}

function loginFailure(request: Request, formSubmission: boolean, message: string, status: number) {
  return formSubmission
    ? redirectTo(request, "/login?error=1")
    : NextResponse.json({ error: message }, { status })
}

function redirectTo(request: Request, path: string) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const protocol = request.headers.get("x-forwarded-proto") ?? "http"
  if (!host) throw new Error("Request host is required for login redirect.")
  return NextResponse.redirect(new URL(path, `${protocol}://${host}`), 303)
}
