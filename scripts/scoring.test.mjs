import assert from "node:assert/strict"
import { test } from "node:test"
import { criteria, emptyScores, formatScore, parseScore, rankResults, scoreSummary } from "../lib/scoring.ts"

test("decimal scores preserve hundredths and reject invalid values", () => {
  for (const [input, expected] of [["0", 0], ["5", 500], ["4.99", 499], ["0.01", 1], ["2.5", 250], ["", null], [null, null]]) assert.equal(parseScore(input), expected)
  for (const invalid of [undefined, 5, "-1", "5.01", "1.234", "NaN", "Infinity", "1e0", " ", "1."]) assert.throws(() => parseScore(invalid))
  assert.equal(formatScore(parseScore("0.10") + parseScore("0.20")), "0.30")
})

test("partial scores are distinct from complete zero scores", () => {
  assert.deepEqual(scoreSummary(emptyScores), { complete: false, total: 0 })
  assert.deepEqual(scoreSummary({ ...emptyScores, message: 500 }), { complete: false, total: 500 })
  assert.deepEqual(scoreSummary(Object.fromEntries(criteria.map((key) => [key, 0]))), { complete: true, total: 0 })
  assert.deepEqual(scoreSummary(Object.fromEntries(criteria.map((key) => [key, 500]))), { complete: true, total: 2000 })
})

test("ranking includes only complete submitted scorecards and gives ties equal ranks", () => {
  const row = (username, scores, submissionId = username) => ({ schoolId: username, username, name: username, submissionId, ...emptyScores, ...scores })
  const full = (score) => Object.fromEntries(criteria.map((key) => [key, score]))
  const ranked = rankResults([row("B", full(400)), row("A", full(400)), row("C", full(300)), row("Z", full(0)), row("PARTIAL", { message: 500 }), row("NONE", full(500), null)])
  assert.deepEqual(ranked.map(({ username, rank, total }) => ({ username, rank, total })), [
    { username: "A", rank: 1, total: 1600 }, { username: "B", rank: 1, total: 1600 }, { username: "C", rank: 3, total: 1200 }, { username: "Z", rank: 4, total: 0 },
  ])
})
