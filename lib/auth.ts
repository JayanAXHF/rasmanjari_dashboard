import crypto from "node:crypto"
import { eq } from "drizzle-orm"
import argon2 from "argon2"
import { redirect } from "next/navigation"

import { db } from "@/lib/db"
import { auditLogs, schools } from "@/lib/db/schema"
import { getAdminSession, getSchoolSession } from "@/lib/session"

export async function logAudit(actor: string, action: string, target: string, ip?: string | null) {
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), actor, action, target, ip: ip ?? null, at: new Date() })
}

export async function requireSchool() {
  const session = await getSchoolSession()
  if (!session.school) redirect("/login")
  return session.school
}

export async function requireAdmin() {
  const session = await getAdminSession()
  if (!session.admin) redirect("/admin/login")
  return session.admin
}

export async function authenticateSchool(schoolCode: string, password: string) {
  const school = await db.query.schools.findFirst({ where: eq(schools.schoolCode, schoolCode.trim().toUpperCase()) })
  if (!school || !(await argon2.verify(school.passwordHash, password))) return null
  return school
}

export async function authenticateAdmin(password: string) {
  return Boolean(process.env.ADMIN_PASSWORD_HASH && password && (await argon2.verify(process.env.ADMIN_PASSWORD_HASH, password)))
}
