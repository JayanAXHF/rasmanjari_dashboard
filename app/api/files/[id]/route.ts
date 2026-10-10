import sharp from "sharp"
import fs from "node:fs/promises"
import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { submissions } from "@/lib/db/schema"
import { getAdminSession, getSchoolSession } from "@/lib/session"
import {
  hasJudgeAccess,
  isAdminSessionValid,
  isSchoolSessionValid,
} from "@/lib/auth"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const submission = await db.query.submissions.findFirst({
    where: eq(submissions.id, id),
  })
  if (!submission) return new NextResponse(null, { status: 404 })

  const params = new URL(request.url).searchParams
  const judge = params.get("judge") === "1" || (await hasJudgeAccess())
  if (params.get("judge") === "1" && !(await hasJudgeAccess()))
    return new NextResponse(null, { status: 403 })
  const admin = await getAdminSession()
  if (!judge && (!admin.admin || !(await isAdminSessionValid(admin.admin)))) {
    const school = await getSchoolSession()
    if (
      !school.school ||
      !(await isSchoolSessionValid(school.school)) ||
      school.school.id !== submission.schoolId
    )
      return new NextResponse(null, { status: 403 })
  }

  try {
    const thumbnail = params.get("thumbnail") === "1"
    let content = await fs.readFile(
      thumbnail ? submission.thumbPath : submission.filePath
    )
    if (judge && !thumbnail)
      content = await sharp(content, { limitInputPixels: 144_000_000 })
        .png()
        .toBuffer()
    return new NextResponse(content, {
      headers: {
        "content-type": thumbnail ? "image/webp" : "image/png",
        "cache-control": "private, no-store",
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
