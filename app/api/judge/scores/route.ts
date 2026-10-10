import crypto from "node:crypto"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { hasJudgeAccess } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLogs, scorecards, submissions } from "@/lib/db/schema"
import { criteria, parseScore, type Criterion } from "@/lib/scoring"

export async function PATCH(request: Request) {
  if (!(await hasJudgeAccess()))
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 }
    )
  const origin = request.headers.get("origin")
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    new URL(request.url).protocol.replace(":", "")
  if (
    origin !== `${protocol}://${host}` ||
    !request.headers.get("content-type")?.includes("application/json")
  ) {
    return NextResponse.json(
      { error: "Invalid request origin or content type." },
      { status: 403 }
    )
  }
  const body = await request.json().catch(() => null)
  if (
    !body ||
    typeof body.submissionId !== "string" ||
    !criteria.includes(body.criterion)
  ) {
    return NextResponse.json(
      { error: "Invalid score request." },
      { status: 400 }
    )
  }
  let score: number | null
  try {
    score = parseScore(body.value)
  } catch {
    return NextResponse.json(
      { error: "Use a score from 0 to 5 with up to two decimal places." },
      { status: 400 }
    )
  }
  const criterion: Criterion = body.criterion
  const result = db.transaction((tx) => {
    if (
      !tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.id, body.submissionId))
        .get()
    )
      return null
    const now = new Date()
    const updated = tx
      .insert(scorecards)
      .values({
        submissionId: body.submissionId,
        [criterion]: score,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: scorecards.submissionId,
        set: { [criterion]: score, updatedAt: now },
      })
      .returning()
      .get()
    tx.insert(auditLogs)
      .values({
        id: crypto.randomUUID(),
        actor: "judge",
        action: `score_${criterion}_updated`,
        target: body.submissionId,
        at: now,
      })
      .run()
    return { criterion, value: updated[criterion] }
  })
  return result
    ? NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json(
        { error: "This submission is no longer available." },
        { status: 404 }
      )
}
