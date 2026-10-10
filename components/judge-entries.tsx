"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  criteria,
  criterionLabels,
  formatScore,
  parseScore,
  scoreSummary,
  type Criterion,
  type Scores,
} from "@/lib/scoring"

type Entry = Scores & { id: string; username: string }
type SaveState = "Saved" | "Unsaved" | "Saving…" | "Failed" | "Invalid"

function Scorecard({
  entry,
  onComplete,
  enqueue,
}: {
  entry: Entry
  onComplete: (id: string, complete: boolean) => void
  enqueue: (task: () => Promise<void>) => void
}) {
  const [values, setValues] = useState(
    () =>
      Object.fromEntries(
        criteria.map((key) => [
          key,
          entry[key] === null ? "" : formatScore(entry[key]),
        ])
      ) as Record<Criterion, string>
  )
  const [states, setStates] = useState<Record<Criterion, SaveState>>({
    message: "Saved",
    originality: "Saved",
    visualAppeal: "Saved",
    creativity: "Saved",
  })
  const [error, setError] = useState("")
  const [saved, setSaved] = useState<Scores>(entry)
  const versions = useRef<Record<Criterion, number>>({
    message: 0,
    originality: 0,
    visualAppeal: 0,
    creativity: 0,
  })
  const timers = useRef<
    Partial<Record<Criterion, ReturnType<typeof setTimeout>>>
  >({})
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const pendingTimers = timers.current
    return () => {
      alive.current = false
      Object.values(pendingTimers).forEach(clearTimeout)
    }
  }, [])
  useEffect(() => {
    onComplete(entry.id, scoreSummary(saved).complete)
  }, [entry.id, saved, onComplete])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (Object.values(states).some((state) => state !== "Saved")) {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [states])

  function save(criterion: Criterion, value: string) {
    clearTimeout(timers.current[criterion])
    try {
      parseScore(value)
    } catch {
      return
    }
    const version = ++versions.current[criterion]
    setStates((previous) => ({ ...previous, [criterion]: "Saving…" }))
    enqueue(async () => {
      if (!alive.current || versions.current[criterion] !== version) return
      try {
        const response = await fetch("/api/judge/scores", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId: entry.id, criterion, value }),
          signal: AbortSignal.timeout(15000),
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error ?? "Could not save marks.")
        if (!alive.current) return
        setSaved((previous) => ({ ...previous, [criterion]: body.value }))
        if (versions.current[criterion] === version) {
          setStates((previous) => ({ ...previous, [criterion]: "Saved" }))
          setError("")
        }
      } catch (cause) {
        if (alive.current && versions.current[criterion] === version) {
          setStates((previous) => ({ ...previous, [criterion]: "Failed" }))
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not save marks. Retry below."
          )
        }
      }
    })
  }

  function change(criterion: Criterion, value: string) {
    ++versions.current[criterion]
    clearTimeout(timers.current[criterion])
    setValues((previous) => ({ ...previous, [criterion]: value }))
    try {
      parseScore(value)
      setStates((previous) => ({ ...previous, [criterion]: "Unsaved" }))
      timers.current[criterion] = setTimeout(() => save(criterion, value), 500)
    } catch {
      setStates((previous) => ({ ...previous, [criterion]: "Invalid" }))
    }
  }

  const current = { ...saved }
  for (const criterion of criteria) {
    try {
      current[criterion] = parseScore(values[criterion])
    } catch {
      current[criterion] = null
    }
  }
  const summary = scoreSummary(current)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{entry.username}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <a
          href={`/api/files/${entry.id}?judge=1`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View full-size submission ${entry.username}`}
        >
          {/* Authenticated private image route; previews preserve the whole artwork. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${entry.id}?judge=1&thumbnail=1`}
            alt={`Submission ${entry.username}`}
            className="max-h-[36rem] w-full border object-contain"
          />
          <span className="mt-2 block text-sm text-muted-foreground">
            Open full-size image ↗
          </span>
        </a>
        <div className="space-y-4">
          {criteria.map((criterion) => (
            <div key={criterion}>
              <label
                htmlFor={`${entry.id}-${criterion}`}
                className="text-sm font-medium"
              >
                {criterionLabels[criterion]} / 5
              </label>
              <Input
                id={`${entry.id}-${criterion}`}
                className="mt-2"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={values[criterion]}
                aria-invalid={states[criterion] === "Invalid"}
                aria-describedby={`${entry.id}-${criterion}-state`}
                onChange={(event) => change(criterion, event.target.value)}
                onBlur={() => {
                  if (states[criterion] === "Unsaved")
                    save(criterion, values[criterion])
                }}
              />
              <div
                id={`${entry.id}-${criterion}-state`}
                className="mt-1 text-xs text-muted-foreground"
                aria-live="polite"
              >
                {states[criterion] === "Invalid"
                  ? "Enter 0–5 with up to two decimal places."
                  : states[criterion]}
                {states[criterion] === "Failed" && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="ml-2"
                    onClick={() => save(criterion, values[criterion])}
                  >
                    Retry
                  </Button>
                )}
              </div>
            </div>
          ))}
          <p className="border-t pt-4 text-lg font-semibold tabular-nums">
            {summary.complete ? "Total" : "Running subtotal"}:{" "}
            {formatScore(summary.total)} / 20
          </p>
          {Object.values(states).some((state) => state !== "Saved") && (
            <p className="text-xs text-muted-foreground">
              Changes are not all saved yet.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function JudgeEntries({ entries }: { entries: Entry[] }) {
  const [completed, setCompleted] = useState(
    () =>
      new Set(
        entries
          .filter((entry) => scoreSummary(entry).complete)
          .map((entry) => entry.id)
      )
  )
  const queue = useRef<Promise<void>>(Promise.resolve())
  const enqueue = useCallback((task: () => Promise<void>) => {
    queue.current = queue.current.then(task).catch(() => {})
  }, [])
  const onComplete = useCallback(
    (id: string, complete: boolean) =>
      setCompleted((previous) => {
        if (previous.has(id) === complete) return previous
        const next = new Set(previous)
        if (complete) next.add(id)
        else next.delete(id)
        return next
      }),
    []
  )
  return (
    <section className="mt-8 space-y-6">
      <p className="text-sm text-muted-foreground">
        {completed.size} of {entries.length} entries marked. All judges share
        these marks; the latest saved edit wins.
      </p>
      {entries.length === 0 ? (
        <p>No submissions have been received.</p>
      ) : (
        entries.map((entry) => (
          <Scorecard
            key={entry.id}
            entry={entry}
            onComplete={onComplete}
            enqueue={enqueue}
          />
        ))
      )}
    </section>
  )
}
