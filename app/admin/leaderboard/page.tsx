import { JudgingResults } from "@/components/judging-results"
import { requireAdmin } from "@/lib/auth"
import { getJudgingResults } from "@/lib/judging"

export const dynamic = "force-dynamic"

export default async function LeaderboardPage() {
  await requireAdmin()
  return (
    <main className="mx-auto min-h-svh max-w-6xl px-6 py-10">
      <a href="/admin">← Dashboard</a>
      <h1 className="mt-5 font-heading text-3xl font-semibold uppercase">
        Judging leaderboard
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Completed scorecards are ranked by total. Equal totals share a rank.
      </p>
      <JudgingResults initialRows={await getJudgingResults()} leaderboard />
    </main>
  )
}
