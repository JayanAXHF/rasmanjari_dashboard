import crypto from "node:crypto"
import { eq } from "drizzle-orm"
import argon2 from "argon2"
import { redirect } from "next/navigation"

import { db } from "@/lib/db"
import { auditLogs, schools } from "@/lib/db/schema"
import {
  getAdminSession,
  getJudgeSession,
  getSchoolSession,
  type JudgeSession,
  type AdminSession,
  type SchoolSession,
} from "@/lib/session"
import { getSettings } from "@/lib/settings"

export async function logAudit(
  actor: string,
  action: string,
  target: string,
  ip?: string | null
) {
  await db
    .insert(auditLogs)
    .values({
      id: crypto.randomUUID(),
      actor,
      action,
      target,
      ip: ip ?? null,
      at: new Date(),
    })
}

export async function requireSchool() {
  const session = await getSchoolSession()
  if (!(await isSchoolSessionValid(session.school)) || !session.school)
    redirect("/login")
  return session.school
}

export async function requireAdmin() {
  const session = await getAdminSession()
  if (!(await isAdminSessionValid(session.admin)) || !session.admin)
    redirect("/admin/login")
  return session.admin
}

export async function isSchoolSessionValid(session: SchoolSession["school"]) {
  if (!session) return false
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, session.id),
  })
  return Boolean(school && school.sessionVersion === session.version)
}

export async function isAdminSessionValid(session: AdminSession["admin"]) {
  if (!session) return false
  return (await getSettings()).adminSessionVersion === session.version
}

export async function authenticateSchool(schoolCode: string, password: string) {
  const school = await db.query.schools.findFirst({
    where: eq(schools.schoolCode, schoolCode.trim().toUpperCase()),
  })
  if (!school || !(await argon2.verify(school.passwordHash, password)))
    return null
  return school
}

export async function authenticateAdmin(password: string) {
  // Keep this lookup dynamic: production supplies this value via /etc/portal.env.
  // A direct `process.env.ADMIN_PASSWORD_HASH` can be captured from a local .env
  // file while creating a standalone build.
  const passwordHash = process.env["ADMIN_PASSWORD_HASH"]
  return Boolean(
    passwordHash && password && (await argon2.verify(passwordHash, password))
  )
}

export async function isJudgeSessionValid(session: JudgeSession["judge"]) {
  if (
    !session ||
    !process.env["JUDGE_SESSION_PASSWORD"] ||
    process.env["JUDGE_SESSION_PASSWORD"].length < 32
  )
    return false
  const setting = await getSettings()
  return Boolean(
    setting.judgePasswordHash && setting.judgeSessionVersion === session.version
  )
}

export function judgeSessionsConfigured() {
  return (process.env["JUDGE_SESSION_PASSWORD"]?.length ?? 0) >= 32
}

export async function hasJudgeAccess() {
  if (!judgeSessionsConfigured()) return false
  const session = await getJudgeSession()
  return isJudgeSessionValid(session.judge)
}

export async function requireJudge() {
  if (!(await hasJudgeAccess())) redirect("/judge/login")
}
