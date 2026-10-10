"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  formatScore,
  rankResults,
  scoreSummary,
  type ResultRow,
} from "@/lib/scoring"

export function useJudgingResults(initialRows: ResultRow[]) {
  const [rows, setRows] = useState(initialRows)
  const [updatedAt, setUpdatedAt] = useState("")
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    let busy = false
    const controller = new AbortController()
    async function refresh() {
      if (document.visibilityState !== "visible" || busy) return
      busy = true
      try {
        const response = await fetch("/api/admin/results", {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        })
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Session expired. Sign in again."
              : "Could not refresh marks. Retrying automatically."
          )
        const data = await response.json()
        if (active) {
          setRows(data.rows)
          setUpdatedAt(data.updatedAt)
          setError("")
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Could not refresh marks."
          )
      } finally {
        busy = false
      }
    }
    void refresh()
    const timer = setInterval(refresh, 3000)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      active = false
      controller.abort()
      clearInterval(timer)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])
  return { rows, updatedAt, error }
}

export function JudgingResults({
  initialRows,
  leaderboard = false,
}: {
  initialRows: ResultRow[]
  leaderboard?: boolean
}) {
  const { rows, updatedAt, error } = useJudgingResults(initialRows)
  const ranked = rankResults(rows)
  const unranked = rows.filter(
    (row) => !row.submissionId || !scoreSummary(row).complete
  )
  const ordered = leaderboard
    ? [...ranked, ...unranked]
    : rows.filter((row) => row.submissionId)
  const ranks = new Map(ranked.map((row) => [row.schoolId, row.rank]))
  return (
    <section className="mt-8 space-y-6">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Marks refresh every 3 seconds.
        {updatedAt &&
          ` Last updated: ${new Date(updatedAt).toLocaleTimeString()}.`}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {leaderboard && (
        <Card>
          <CardHeader>
            <CardTitle>Leaderboard · out of 20</CardTitle>
          </CardHeader>
          <CardContent>
            {ranked.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No complete scorecards yet.
              </p>
            )}
            <ol className="space-y-5">
              {ranked.map((row) => (
                <li key={row.schoolId}>
                  <div className="mb-2 flex justify-between gap-4 text-sm">
                    <span>
                      #{row.rank} {row.name}{" "}
                      <span className="text-muted-foreground">
                        ({row.username})
                      </span>
                    </span>
                    <strong className="tabular-nums">
                      {formatScore(row.total)} / 20
                    </strong>
                  </div>
                  <div
                    role="meter"
                    aria-label={`${row.username} total score`}
                    aria-valuemin={0}
                    aria-valuemax={20}
                    aria-valuenow={row.total / 100}
                    className="h-6 overflow-hidden rounded bg-muted"
                  >
                    <div
                      className="h-full bg-primary transition-[width]"
                      style={{ width: `${row.total / 20}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
            {unranked.length > 0 && (
              <div className="mt-6 border-t pt-4">
                <h3 className="mb-3 font-semibold">
                  Awaiting complete marks · unranked
                </h3>
                <ul className="space-y-2 text-sm">
                  {unranked.map((row) => (
                    <li
                      key={row.schoolId}
                      className="flex justify-between gap-4"
                    >
                      <span>
                        {row.name} ({row.username})
                      </span>
                      <span className="text-muted-foreground">
                        {!row.submissionId
                          ? "No submission"
                          : criteria.some((key) => row[key] !== null)
                            ? `Partial · ${formatScore(scoreSummary(row).total)}`
                            : "Unmarked"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Judge marks</CardTitle>
        </CardHeader>
        <CardContent>
          {ordered.length === 0 ? (
            <p className="text-muted-foreground">No teams to display.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {leaderboard && <TableHead>Rank</TableHead>}
                  <TableHead>School / username</TableHead>
                  {criteria.map((key) => (
                    <TableHead key={key}>{criterionLabels[key]} / 5</TableHead>
                  ))}
                  <TableHead>Total / 20</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map((row) => {
                  const summary = scoreSummary(row)
                  const marked = criteria.filter(
                    (key) => row[key] !== null
                  ).length
                  return (
                    <TableRow key={row.schoolId}>
                      {leaderboard && (
                        <TableCell>{ranks.get(row.schoolId) ?? "—"}</TableCell>
                      )}
                      <TableCell>
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.username}
                        </p>
                      </TableCell>
                      {criteria.map((key) => (
                        <TableCell className="tabular-nums" key={key}>
                          {row[key] === null ? "—" : formatScore(row[key])}
                        </TableCell>
                      ))}
                      <TableCell className="tabular-nums">
                        {marked
                          ? `${formatScore(summary.total)}${summary.complete ? "" : " (partial)"}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {!row.submissionId
                          ? "No submission"
                          : summary.complete
                            ? "Complete"
                            : `${marked}/4 marked`}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
