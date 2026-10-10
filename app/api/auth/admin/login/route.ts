import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"

import { authenticateAdmin, logAudit } from "@/lib/auth"
import { clearAttempts, isRateLimited, recordFailedAttempt } from "@/lib/rate-limit"
import { getAdminSession } from "@/lib/session"
import { getSettings } from "@/lib/settings"

const credentialsSchema = z.object({ password: z.string().min(1).max(256) })

export async function POST(request: Request) {
  const formSubmission = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded") ?? false
  const body = formSubmission ? Object.fromEntries(await request.formData()) : await request.json().catch(() => null)
  const parsed = credentialsSchema.safeParse(body)
  if (!parsed.success) return loginFailure(request, formSubmission, "Invalid password.", 400)

  const forwardedFor = (await headers()).get("x-forwarded-for")
  const ip = forwardedFor?.split(",")[0]?.trim() ?? "unknown"
  const rateLimitKey = `admin:${ip}`
  if (isRateLimited(rateLimitKey)) return loginFailure(request, formSubmission, "Please try again later.", 429)

  if (!(await authenticateAdmin(parsed.data.password))) {
    recordFailedAttempt(rateLimitKey)
    return loginFailure(request, formSubmission, "Invalid password.", 401)
  }

  clearAttempts(rateLimitKey)
  const session = await getAdminSession()
  session.admin = { authenticatedAt: Date.now(), version: (await getSettings()).adminSessionVersion }
  await session.save()
  await logAudit("admin", "admin_login", "admin", ip)
  return formSubmission ? redirectTo(request, "/admin") : NextResponse.json({ ok: true })
}

function loginFailure(request: Request, formSubmission: boolean, message: string, status: number) {
  return formSubmission
    ? redirectTo(request, "/admin/login?error=1")
    : NextResponse.json({ error: message }, { status })
}

function redirectTo(request: Request, path: string) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const protocol = request.headers.get("x-forwarded-proto") ?? "http"
  if (!host) throw new Error("Request host is required for login redirect.")
  return NextResponse.redirect(new URL(path, `${protocol}://${host}`), 303)
}
