import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { eq } from "drizzle-orm"

import { isSchoolSessionValid } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLogs, submissions } from "@/lib/db/schema"
import { createThumbnail, inspectPng, isPng } from "@/lib/image"
import { getSchoolSession } from "@/lib/session"
import { getSettings, submissionWindowState } from "@/lib/settings"
import { ensureStorageDirectories, storagePaths, submissionImagePath, submissionThumbnailPath } from "@/lib/storage"

export const runtime = "nodejs"
export const maxDuration = 60

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const session = await getSchoolSession()
  if (!session.school || !(await isSchoolSessionValid(session.school))) return error("Please sign in again.", 401)
  const school = session.school

  const setting = await getSettings()
  if (submissionWindowState(setting) !== "open") return error("Submissions are not currently open.", 403)
  const existing = await db.query.submissions.findFirst({ where: eq(submissions.schoolId, school.id) })
  if (existing) return error("Your school has already submitted its final entry.", 409)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return error("The upload could not be read.", 400)
  }
  const uploaded = form.get("file")
  if (!(uploaded instanceof File)) return error("Choose a PNG file to upload.", 400)

  const maximumSize = setting.maxFileSizeMB * 1024 * 1024
  if (uploaded.size === 0 || uploaded.size > maximumSize) return error(`The PNG must be no larger than ${setting.maxFileSizeMB} MB.`, 413)

  const contents = Buffer.from(await uploaded.arrayBuffer())
  if (!isPng(contents)) return error("Only genuine PNG images can be submitted.", 415)

  const id = crypto.randomUUID()
  const temporaryPath = path.join(storagePaths.temporary, `${id}.png`)
  const imagePath = submissionImagePath(id)
  const thumbnailPath = submissionThumbnailPath(id)

  try {
    await ensureStorageDirectories()
    await fs.writeFile(temporaryPath, contents, { flag: "wx" })
    const { width, height } = await inspectPng(contents)
    await fs.rename(temporaryPath, imagePath)
    await createThumbnail(imagePath, thumbnailPath)

    const forwardedFor = (await headers()).get("x-forwarded-for")
    db.transaction((tx) => {
      tx.insert(submissions).values({
        id,
        schoolId: school.id,
        filePath: imagePath,
        thumbPath: thumbnailPath,
        originalName: path.basename(uploaded.name || "submission.png"),
        sizeBytes: uploaded.size,
        width,
        height,
        sha256: crypto.createHash("sha256").update(contents).digest("hex"),
        submittedAt: new Date(),
        status: "submitted",
      }).run()
      tx.insert(auditLogs).values({ id: crypto.randomUUID(), actor: `school:${school.id}`, action: "submission_created", target: id, ip: forwardedFor?.split(",")[0]?.trim() ?? null, at: new Date() }).run()
    })
    return NextResponse.json({ id, submittedAt: new Date().toISOString() }, { status: 201 })
  } catch (cause) {
    await Promise.allSettled([fs.unlink(temporaryPath), fs.unlink(imagePath), fs.unlink(thumbnailPath)])
    if (cause instanceof Error && /UNIQUE constraint failed: submissions\.school_id/.test(cause.message)) return error("Your school has already submitted its final entry.", 409)
    const message = cause instanceof Error && cause.message ? cause.message : "The image could not be processed."
    return error(message, 422)
  }
}
