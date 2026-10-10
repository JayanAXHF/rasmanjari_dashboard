"use server"

import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { eq } from "drizzle-orm"
import argon2 from "argon2"
import { revalidatePath } from "next/cache"

import { logAudit, requireAdmin } from "@/lib/auth"
import { parseCompetitionTime } from "@/lib/competition-time"
import { db } from "@/lib/db"
import { fileCleanupJobs, schools, settings, submissions } from "@/lib/db/schema"
import { inspectPng, isPng } from "@/lib/image"
import { ensureStorageDirectories, storagePaths } from "@/lib/storage"

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim()
}

async function drainFileCleanupJobs() {
  const jobs = await db.select().from(fileCleanupJobs)
  for (const job of jobs) {
    try {
      await fs.unlink(job.path)
    } catch (cause) {
      if (!(cause instanceof Error) || !('code' in cause) || cause.code !== "ENOENT") continue
    }
    await db.delete(fileCleanupJobs).where(eq(fileCleanupJobs.id, job.id))
  }
}

export async function addSchool(formData: FormData) {
  await requireAdmin()
  const schoolCode = text(formData, "schoolCode").toUpperCase()
  const name = text(formData, "name")
  const password = text(formData, "password")
  if (!/^[A-Z0-9_-]{2,32}$/.test(schoolCode) || !name || password.length < 12) throw new Error("Use a valid code, school name, and a password of at least 12 characters.")
  await db.insert(schools).values({ id: crypto.randomUUID(), schoolCode, name, passwordHash: await argon2.hash(password), createdAt: new Date() })
  await logAudit("admin", "school_created", schoolCode)
  revalidatePath("/admin/schools")
  revalidatePath("/admin")
}

export async function importSchools(formData: FormData) {
  await requireAdmin()
  const csv = formData.get("csv")
  if (!(csv instanceof File) || csv.size > 1_000_000) throw new Error("Upload a CSV file smaller than 1 MB.")
  const rows = (await csv.text()).split(/\r?\n/).slice(1).map((line) => line.split(",").map((value) => value.trim()))
  for (const [rawCode, name, suppliedPassword] of rows) {
    const schoolCode = rawCode?.toUpperCase()
    if (!schoolCode || !name || !/^[A-Z0-9_-]{2,32}$/.test(schoolCode)) continue
    const password = suppliedPassword || crypto.randomBytes(12).toString("base64url")
    await db.insert(schools).values({ id: crypto.randomUUID(), schoolCode, name, passwordHash: await argon2.hash(password), createdAt: new Date() }).onConflictDoNothing()
  }
  await logAudit("admin", "schools_csv_imported", csv.name)
  revalidatePath("/admin/schools")
  revalidatePath("/admin")
}

export async function resetSchoolPassword(formData: FormData) {
  await requireAdmin()
  const schoolId = text(formData, "schoolId"), password = text(formData, "password")
  if (password.length < 12) throw new Error("Passwords must have at least 12 characters.")
  await db.update(schools).set({ passwordHash: await argon2.hash(password) }).where(eq(schools.id, schoolId))
  await logAudit("admin", "school_password_reset", schoolId)
  revalidatePath("/admin/schools")
}

export async function deleteSchool(formData: FormData) {
  await requireAdmin()
  const schoolId = text(formData, "schoolId")
  const schoolSubmissions = await db.select().from(submissions).where(eq(submissions.schoolId, schoolId))
  db.transaction((tx) => {
    for (const submission of schoolSubmissions) {
      tx.insert(fileCleanupJobs).values([{ id: crypto.randomUUID(), path: submission.filePath, createdAt: new Date() }, { id: crypto.randomUUID(), path: submission.thumbPath, createdAt: new Date() }]).run()
    }
    tx.delete(schools).where(eq(schools.id, schoolId)).run()
  })
  await drainFileCleanupJobs()
  await logAudit("admin", "school_deleted", schoolId)
  revalidatePath("/admin/schools"); revalidatePath("/admin")
}

export async function resetSubmission(formData: FormData) {
  await requireAdmin()
  const id = text(formData, "submissionId")
  const submission = await db.query.submissions.findFirst({ where: eq(submissions.id, id) })
  if (!submission) return
  await Promise.allSettled([fs.unlink(submission.filePath), fs.unlink(submission.thumbPath)])
  await db.delete(submissions).where(eq(submissions.id, id))
  await logAudit("admin", "submission_reset", id)
  revalidatePath("/admin/submissions"); revalidatePath("/admin")
}

export async function updateSubmissionStatus(formData: FormData) {
  await requireAdmin()
  const id = text(formData, "submissionId"), status = text(formData, "status")
  if (!(["submitted", "approved", "flagged"] as string[]).includes(status)) throw new Error("Invalid submission status.")
  await db.update(submissions).set({ status: status as "submitted" | "approved" | "flagged" }).where(eq(submissions.id, id))
  await logAudit("admin", `submission_${status}`, id)
  revalidatePath("/admin/submissions")
}

export async function saveSettings(formData: FormData) {
  await requireAdmin()
  const maxFileSizeMB = Number(text(formData, "maxFileSizeMB"))
  const open = text(formData, "submissionsOpenAt"), close = text(formData, "submissionsCloseAt")
  if (!Number.isInteger(maxFileSizeMB) || maxFileSizeMB < 1 || maxFileSizeMB > 100) throw new Error("The file limit must be between 1 and 100 MB.")
  const values = { maxFileSizeMB, submissionsOpenAt: parseCompetitionTime(open), submissionsCloseAt: parseCompetitionTime(close) }
  if (values.submissionsOpenAt && values.submissionsCloseAt && values.submissionsCloseAt <= values.submissionsOpenAt) throw new Error("Closing time must be after opening time.")
  await db.insert(settings).values({ id: 1, ...values }).onConflictDoUpdate({ target: settings.id, set: values })
  await logAudit("admin", "settings_updated", "settings")
  revalidatePath("/admin/settings"); revalidatePath("/dashboard")
}

export async function uploadPrompt(formData: FormData) {
  await requireAdmin()
  const file = formData.get("prompt")
  if (!(file instanceof File) || file.size > 20 * 1024 * 1024) throw new Error("Upload a PNG prompt smaller than 20 MB.")
  const contents = Buffer.from(await file.arrayBuffer())
  if (!isPng(contents)) throw new Error("The prompt must be a PNG image.")
  await inspectPng(contents)
  await ensureStorageDirectories()
  const promptPath = path.join(storagePaths.prompt, "prompt.png")
  await fs.writeFile(promptPath, contents)
  await db.insert(settings).values({ id: 1, promptImagePath: promptPath }).onConflictDoUpdate({ target: settings.id, set: { promptImagePath: promptPath } })
  await logAudit("admin", "prompt_uploaded", file.name)
  revalidatePath("/admin/settings"); revalidatePath("/dashboard")
}
