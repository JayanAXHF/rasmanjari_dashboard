import { JudgeEntries } from "@/components/judge-entries"
import { Button } from "@/components/ui/button"
import { requireJudge } from "@/lib/auth"
import { getJudgeEntries } from "@/lib/judging"

export const dynamic = "force-dynamic"

export default async function JudgePage() {
  await requireJudge()
  const entries = await getJudgeEntries()
  return (
    <main className="mx-auto min-h-svh max-w-6xl px-6 py-10">
      <header className="flex items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold uppercase">
            Judge submissions
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Each criterion is out of 5. Marks autosave and can be revised.
          </p>
        </div>
        <form action="/api/auth/logout?kind=judge" method="post">
          <Button type="submit" variant="outline">
            Log out
          </Button>
        </form>
      </header>
      <JudgeEntries entries={entries} />
    </main>
  )
}
