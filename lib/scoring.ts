export const criteria = [
  "message",
  "originality",
  "visualAppeal",
  "creativity",
] as const
export type Criterion = (typeof criteria)[number]
export type Scores = Record<Criterion, number | null>
export const criterionLabels: Record<Criterion, string> = {
  message: "Message",
  originality: "Originality",
  visualAppeal: "Visual Appeal",
  creativity: "Creativity",
}
export const emptyScores: Scores = {
  message: null,
  originality: null,
  visualAppeal: null,
  creativity: null,
}

// Input is a decimal string; stored scores use integer hundredths.
export function parseScore(value: unknown): number | null {
  if (value === null || value === "") return null
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error("Use a score from 0 to 5 with up to two decimal places.")
  const [whole, fraction = ""] = value.split(".")
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  if (!Number.isSafeInteger(result) || result > 500)
    throw new Error("Scores must be between 0 and 5.")
  return result
}

export function scoreSummary(scores: Scores) {
  const values = criteria.map((criterion) => scores[criterion])
  return {
    complete: values.every((value) => value !== null),
    total: values.reduce<number>((sum, value) => sum + (value ?? 0), 0),
  }
}

export function formatScore(value: number) {
  return (value / 100).toFixed(2)
}

export type ResultRow = Scores & {
  schoolId: string
  username: string
  name: string
  submissionId: string | null
}

export function rankResults(rows: ResultRow[]) {
  const ranked = rows
    .filter((row) => row.submissionId && scoreSummary(row).complete)
    .sort(
      (a, b) =>
        scoreSummary(b).total - scoreSummary(a).total ||
        a.username.localeCompare(b.username)
    )
  let rank = 0
  let previous: number | undefined
  return ranked.map((row, index) => {
    const total = scoreSummary(row).total
    if (total !== previous) rank = index + 1
    previous = total
    return { ...row, total, rank }
  })
}
