import { NextResponse } from "next/server"

import { getAdminSession, getSchoolSession } from "@/lib/session"

export async function POST(request: Request) {
  const destination = new URL(request.url).searchParams.get("kind") === "admin" ? "/admin/login" : "/login"
  const session = destination.startsWith("/admin") ? await getAdminSession() : await getSchoolSession()
  session.destroy()
  return NextResponse.redirect(new URL(destination, request.url), { status: 303 })
}
