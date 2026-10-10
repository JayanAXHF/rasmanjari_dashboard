"use client"

import { resetSubmission, updateSubmissionStatus } from "@/app/admin/actions"
import { useJudgingResults } from "@/components/judging-results"
import { formatCompetitionTime } from "@/lib/competition-time"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  criteria,
  criterionLabels,
  emptyScores,
  formatScore,
  scoreSummary,
  type ResultRow,
} from "@/lib/scoring"

type Submission = {
  id: string
  schoolId: string
  username: string
  name: string
  submittedAt: Date
  status: "submitted" | "approved" | "flagged"
}

export function SubmissionReviewTable({
  submissions,
  initialResults,
}: {
  submissions: Submission[]
  initialResults: ResultRow[]
}) {
  const { rows, updatedAt, error } = useJudgingResults(initialResults)
  const results = new Map(rows.map((row) => [row.submissionId, row]))
  return (
    <>
      <p className="mb-4 text-xs text-muted-foreground">
        Marks refresh every 3 seconds.
        {updatedAt &&
          ` Last updated: ${new Date(updatedAt).toLocaleTimeString()}.`}
      </p>
      {error && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {submissions.length === 0 ? (
        <p className="text-muted-foreground">
          No submissions have been received.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>School</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              {criteria.map((key) => (
                <TableHead key={key}>{criterionLabels[key]} / 5</TableHead>
              ))}
              <TableHead>Total / 20</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.map((submission) => {
              const scores = results.get(submission.id) ?? emptyScores
              const summary = scoreSummary(scores)
              const marked = criteria.some((key) => scores[key] !== null)
              return (
                <TableRow key={submission.id}>
                  <TableCell>
                    <p className="font-medium">{submission.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {submission.username}
                    </p>
                  </TableCell>
                  <TableCell>
                    <a
                      href={`/api/files/${submission.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="h-16 w-24 border border-border object-contain"
                        src={`/api/files/${submission.id}?thumbnail=1`}
                        alt={`Submission from ${submission.name}`}
                      />
                    </a>
                  </TableCell>
                  <TableCell>
                    {formatCompetitionTime(new Date(submission.submittedAt))}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        submission.status === "flagged"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {submission.status}
                    </Badge>
                  </TableCell>
                  {criteria.map((key) => (
                    <TableCell key={key} className="tabular-nums">
                      {scores[key] === null ? "—" : formatScore(scores[key])}
                    </TableCell>
                  ))}
                  <TableCell className="tabular-nums">
                    {marked
                      ? `${formatScore(summary.total)}${summary.complete ? "" : " (partial)"}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <form action={updateSubmissionStatus}>
                        <input
                          type="hidden"
                          name="submissionId"
                          value={submission.id}
                        />
                        <input type="hidden" name="status" value="approved" />
                        <Button type="submit" size="xs" variant="outline">
                          Approve
                        </Button>
                      </form>
                      <form action={updateSubmissionStatus}>
                        <input
                          type="hidden"
                          name="submissionId"
                          value={submission.id}
                        />
                        <input type="hidden" name="status" value="flagged" />
                        <Button type="submit" size="xs" variant="outline">
                          Flag
                        </Button>
                      </form>
                      <form action={resetSubmission}>
                        <input
                          type="hidden"
                          name="submissionId"
                          value={submission.id}
                        />
                        <Button type="submit" size="xs" variant="destructive">
                          Reset
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </>
  )
}
