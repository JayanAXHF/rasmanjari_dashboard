import assert from "node:assert/strict"
import { test } from "node:test"
import { competitionTimeInput, formatCompetitionTime, isPromptVisible, parseCompetitionTime } from "../lib/competition-time.ts"

test("IST schedule parsing and display are independent of server timezone", () => {
  const date = parseCompetitionTime("2026-10-10T15:15")
  assert.equal(date.toISOString(), "2026-10-10T09:45:00.000Z")
  assert.equal(competitionTimeInput(date), "2026-10-10T15:15")
  assert.match(formatCompetitionTime(date), /3:15 pm IST/i)
  assert.equal(parseCompetitionTime("2026-01-01T00:15").toISOString(), "2025-12-31T18:45:00.000Z")
  assert.equal(parseCompetitionTime(""), null)
  assert.throws(() => parseCompetitionTime("2026-02-30T15:15"))
  assert.throws(() => parseCompetitionTime("invalid"))
})

test("prompt becomes visible at the configured opening instant", () => {
  const open = parseCompetitionTime("2026-10-10T15:15")
  const setting = { promptImagePath: "/prompt.png", submissionsOpenAt: open }
  assert.equal(isPromptVisible(setting, new Date(open.getTime() - 1)), false)
  assert.equal(isPromptVisible(setting, open), true)
  assert.equal(isPromptVisible({ ...setting, promptImagePath: null }, open), false)
})
