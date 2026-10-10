import { eq } from "drizzle-orm"

import { SubmissionUpload } from "@/components/submission-upload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireSchool } from "@/lib/auth"
import { db } from "@/lib/db"
import { submissions } from "@/lib/db/schema"
import { getSettings, submissionWindowState } from "@/lib/settings"
import { formatCompetitionTime, isPromptVisible } from "@/lib/competition-time"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const school = await requireSchool()
  const [setting, submission] = await Promise.all([
    getSettings(),
    db.query.submissions.findFirst({
      where: eq(submissions.schoolId, school.id),
    }),
  ])
  const state = submissionWindowState(setting)

  return (
    <main className="mx-auto min-h-svh max-w-4xl px-6 py-10">
      <header className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <Badge variant="secondary">{school.schoolCode}</Badge>
          <h1 className="mt-3 font-heading text-3xl font-semibold tracking-wider uppercase">
            {school.name}
          </h1>
        </div>
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="ghost" size="sm">
            Log out
          </Button>
        </form>
      </header>
      <div className="mt-8 grid gap-6">
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle>Competition prompt</CardTitle>
            <CardDescription>
              {state === "open"
                ? "The submission window is open."
                : "Prompt availability follows the competition schedule."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {setting.submissionsOpenAt && setting.submissionsCloseAt && (
              <p className="mb-4 text-sm text-muted-foreground">
                Submission window: {formatCompetitionTime(setting.submissionsOpenAt)} → {formatCompetitionTime(setting.submissionsCloseAt)}
              </p>
            )}
            {!setting.promptImagePath ? (
              <p className="text-muted-foreground">
                The prompt has not been published yet.
              </p>
            ) : !isPromptVisible(setting) ? (
              <p className="text-muted-foreground">
                The prompt will be revealed when submissions open.
              </p>
            ) : (
              <img
                className="max-h-[700px] w-full border border-border object-contain"
                src="/api/prompt"
                alt="Competition prompt"
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your final submission</CardTitle>
            <CardDescription>
              Each school may submit one final PNG.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submission ? (
              <div>
                <p className="border-l-2 border-l-primary bg-muted px-4 py-3 text-sm">
                  Submitted on {formatCompetitionTime(submission.submittedAt)}.
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Your entry is recorded and cannot be changed from this page.
                </p>
              </div>
            ) : state === "open" ? (
              <SubmissionUpload maxFileSizeMB={setting.maxFileSizeMB} />
            ) : (
              <p className="text-muted-foreground">
                {state === "upcoming"
                  ? "Submissions have not opened yet."
                  : state === "closed"
                    ? "The submission window has closed."
                    : "The submission period has not been configured yet."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
