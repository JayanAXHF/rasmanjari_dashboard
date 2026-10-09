import { cookies } from "next/headers"
import { getIronSession, type IronSession, type SessionOptions } from "iron-session"

export type SchoolSession = { school?: { id: string; schoolCode: string; name: string } }
export type AdminSession = { admin?: { authenticatedAt: number } }

function requiredSecret(name: "SCHOOL_SESSION_PASSWORD" | "ADMIN_SESSION_PASSWORD") {
  const value = process.env[name]
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set to a secret of at least 32 characters.`)
  }
  return value
}

const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" }

export async function getSchoolSession(): Promise<IronSession<SchoolSession>> {
  const options: SessionOptions = { cookieName: "portal_school", password: requiredSecret("SCHOOL_SESSION_PASSWORD"), ttl: 60 * 60 * 4, cookieOptions }
  return getIronSession<SchoolSession>(await cookies(), options)
}

export async function getAdminSession(): Promise<IronSession<AdminSession>> {
  const options: SessionOptions = { cookieName: "portal_admin", password: requiredSecret("ADMIN_SESSION_PASSWORD"), ttl: 60 * 60 * 2, cookieOptions }
  return getIronSession<AdminSession>(await cookies(), options)
}
