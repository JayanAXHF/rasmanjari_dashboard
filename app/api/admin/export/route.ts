import * as archiver from "archiver"
import { eq } from "drizzle-orm"
import { Readable } from "node:stream"

import { getAdminSession } from "@/lib/session"
import { db } from "@/lib/db"
import { schools, submissions } from "@/lib/db/schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const createArchive = archiver as unknown as (format: "zip", options: { zlib: { level: number } }) => archiver.Archiver

function safeName(value: string) { return value.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "school" }
function csv(value: string | number) { return `"${String(value).replaceAll('"', '""')}"` }

export async function GET() {
  const session = await getAdminSession()
  if (!session.admin) return new Response(null, { status: 401 })
  const rows = await db.select({ submission: submissions, school: schools }).from(submissions).innerJoin(schools, eq(submissions.schoolId, schools.id))
  const archive = createArchive("zip", { zlib: { level: 9 } })
  const manifest = ["school,filename,time,size_bytes,sha256", ...rows.map(({ school, submission }) => [school.name, `${safeName(school.schoolCode)}_${safeName(school.name)}.png`, submission.submittedAt.toISOString(), submission.sizeBytes, submission.sha256].map(csv).join(","))].join("\n")
  archive.append(manifest, { name: "manifest.csv" })
  for (const { school, submission } of rows) archive.file(submission.filePath, { name: `${safeName(school.schoolCode)}_${safeName(school.name)}.png` })
  archive.finalize()
  return new Response(Readable.toWeb(archive) as ReadableStream, { headers: { "content-type": "application/zip", "content-disposition": "attachment; filename=rasmanjari-submissions.zip" } })
}
