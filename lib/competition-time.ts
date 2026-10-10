const IST_OFFSET_MS = 330 * 60_000

// datetime-local has no timezone. Competition wall-clock times always use IST.
export function parseCompetitionTime(value: string): Date | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("Enter a valid competition date and time in IST.")
  }
  const date = new Date(`${value}:00+05:30`)
  if (
    !Number.isFinite(date.getTime()) ||
    competitionTimeInput(date) !== value
  ) {
    throw new Error("Enter a valid competition date and time in IST.")
  }
  return date
}

export function competitionTimeInput(value: Date | null): string {
  return value
    ? new Date(value.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16)
    : ""
}

export function formatCompetitionTime(value: Date): string {
  return `${new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)} IST`
}

export function isPromptVisible(
  setting: { promptImagePath: string | null; submissionsOpenAt: Date | null },
  now = new Date()
): boolean {
  return Boolean(
    setting.promptImagePath &&
    (!setting.submissionsOpenAt || now >= setting.submissionsOpenAt)
  )
}
