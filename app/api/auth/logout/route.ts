import { NextResponse } from "next/server"

import {
  getAdminSession,
  getJudgeSession,
  getSchoolSession,
} from "@/lib/session"

export async function POST(request: Request) {
  const judge = new URL(request.url).searchParams.get("kind") === "judge"
  const destination =
    new URL(request.url).searchParams.get("kind") === "admin"
      ? "/admin/login"
      : judge
        ? "/judge/login"
        : "/login"
  const session = destination.startsWith("/admin")
    ? await getAdminSession()
    : judge
      ? await getJudgeSession()
      : await getSchoolSession()
  session.destroy()
  // Keep redirects on the browser's origin, even behind a reverse proxy whose
  // internal request URL uses localhost.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: destination, "Cache-Control": "no-store" },
  })
}
