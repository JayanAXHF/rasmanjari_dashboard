import { NextResponse } from "next/server"
import { isAdminSessionValid } from "@/lib/auth"
import { getAdminSession } from "@/lib/session"
import { getJudgingResults } from "@/lib/judging"

export async function GET() {
  const session = await getAdminSession()
  if (!(await isAdminSessionValid(session.admin)))
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 }
    )
  return NextResponse.json(
    { rows: await getJudgingResults(), updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}
