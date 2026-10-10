import { SubmissionReviewTable } from "@/components/submission-review-table"
import { getJudgingResults } from "@/lib/judging"
import { desc, eq } from "drizzle-orm"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { schools, submissions } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

export default async function SubmissionsPage() {
  await requireAdmin()
  const rows = await db
    .select({
      id: submissions.id,
      schoolId: schools.id,
      username: schools.schoolCode,
      name: schools.name,
      submittedAt: submissions.submittedAt,
      status: submissions.status,
    })
    .from(submissions)
    .innerJoin(schools, eq(submissions.schoolId, schools.id))
    .orderBy(desc(submissions.submittedAt))
  return (
    <main className="mx-auto min-h-svh max-w-6xl px-6 py-10">
      <a
        className="text-xs font-semibold tracking-widest text-muted-foreground uppercase hover:text-foreground"
        href="/admin"
      >
        ← Dashboard
      </a>
      <div className="mt-5 flex items-end justify-between">
        <div>
          <Badge variant="secondary">{rows.length} entries</Badge>
          <h1 className="mt-3 font-heading text-3xl font-semibold tracking-wider uppercase">
            Submissions
          </h1>
        </div>
        <Button render={<a href="/api/admin/export" />}>
          Download ZIP export
        </Button>
      </div>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Final entries</CardTitle>
          <CardDescription>
            Review each final PNG, then approve, flag, or reset it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubmissionReviewTable
            submissions={rows}
            initialResults={await getJudgingResults()}
          />
        </CardContent>
      </Card>
    </main>
  )
}
