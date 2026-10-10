import argon2 from "argon2"
import { NextResponse } from "next/server"
import { judgeSessionsConfigured, logAudit } from "@/lib/auth"
import {
  clearAttempts,
  isRateLimited,
  recordFailedAttempt,
} from "@/lib/rate-limit"
import { getJudgeSession } from "@/lib/session"
import { getSettings } from "@/lib/settings"

export async function POST(request: Request) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const protocol = request.headers.get("x-forwarded-proto") ?? "http"
  if (!host) return new NextResponse(null, { status: 400 })
  const redirect = (path: string) =>
    NextResponse.redirect(new URL(path, `${protocol}://${host}`), 303)
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const key = `judge:${ip}`
  if (isRateLimited(key)) return redirect("/judge/login?error=limited")
  if (!judgeSessionsConfigured()) return redirect("/judge/login?error=setup")
  const setting = await getSettings()
  if (!setting.judgePasswordHash) return redirect("/judge/login?error=setup")
  const form = await request.formData().catch(() => null)
  const password = form?.get("password")
  if (
    typeof password !== "string" ||
    password.length > 256 ||
    !password ||
    !(await argon2.verify(setting.judgePasswordHash, password))
  ) {
    recordFailedAttempt(key)
    return redirect("/judge/login?error=invalid")
  }
  clearAttempts(key)
  const session = await getJudgeSession()
  session.judge = {
    authenticatedAt: Date.now(),
    version: setting.judgeSessionVersion,
  }
  await session.save()
  await logAudit("judge", "judge_login", "judge", ip)
  return redirect("/judge")
}
