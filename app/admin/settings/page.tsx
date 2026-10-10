import {
  saveSettings,
  uploadPrompt,
  saveJudgePassword,
} from "@/app/admin/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { judgeSessionsConfigured, requireAdmin } from "@/lib/auth"
import { getSettings } from "@/lib/settings"
import {
  competitionTimeInput,
  formatCompetitionTime,
} from "@/lib/competition-time"

export const dynamic = "force-dynamic"
const datetime = competitionTimeInput

export default async function SettingsPage() {
  await requireAdmin()
  const setting = await getSettings()
  return (
    <main className="mx-auto min-h-svh max-w-3xl px-6 py-10">
      <a href="/admin">← Dashboard</a>
      <div className="mt-5">
        <Badge variant="secondary">Competition setup</Badge>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-wider uppercase">
          Settings
        </h1>
      </div>
      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Judge access</CardTitle>
            <CardDescription>
              {setting.judgePasswordHash
                ? "A shared judge password is configured. Changing it signs out all judges."
                : "Set a shared password for judges to view anonymous entries and enter marks."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!judgeSessionsConfigured() && (
              <p className="mb-4 text-sm text-destructive">
                Judge sessions need JUDGE_SESSION_PASSWORD configured on the
                server (at least 32 characters).
              </p>
            )}
            <form action={saveJudgePassword} className="grid gap-4">
              <label className="text-sm font-medium">
                Shared judge password
                <Input
                  className="mt-2"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={256}
                  required
                />
              </label>
              <Button type="submit">Save judge password</Button>
            </form>
            <a
              href="/judge/login"
              className="mt-4 inline-block text-sm underline"
            >
              Open judge login ↗
            </a>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Submission window</CardTitle>
            <CardDescription>
              All competition times use Indian Standard Time (IST, GMT+5:30).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-5 text-sm text-muted-foreground">
              Saved window:{" "}
              {setting.submissionsOpenAt
                ? formatCompetitionTime(setting.submissionsOpenAt)
                : "Opening time not set"}{" "}
              →{" "}
              {setting.submissionsCloseAt
                ? formatCompetitionTime(setting.submissionsCloseAt)
                : "Closing time not set"}
            </p>
            <form action={saveSettings} className="grid gap-5">
              <label className="text-sm font-medium">
                Open at (IST)
                <Input
                  name="submissionsOpenAt"
                  type="datetime-local"
                  defaultValue={datetime(setting.submissionsOpenAt)}
                  className="mt-2"
                />
              </label>
              <label className="text-sm font-medium">
                Close at (IST)
                <Input
                  name="submissionsCloseAt"
                  type="datetime-local"
                  defaultValue={datetime(setting.submissionsCloseAt)}
                  className="mt-2"
                />
              </label>
              <label className="text-sm font-medium">
                Maximum PNG size (MB)
                <Input
                  name="maxFileSizeMB"
                  type="number"
                  min="1"
                  max="100"
                  defaultValue={setting.maxFileSizeMB}
                  className="mt-2"
                  required
                />
              </label>
              <Button type="submit">Save competition settings</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Prompt image</CardTitle>
            <CardDescription>
              {setting.promptImagePath
                ? "A prompt is uploaded. Schools can see it once the opening time is reached."
                : "Upload a PNG prompt image for participating schools."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={uploadPrompt}
              className="flex flex-col gap-4 sm:flex-row"
            >
              <Input
                name="prompt"
                type="file"
                accept="image/png,.png"
                required
              />
              <Button type="submit" variant="outline">
                Upload prompt PNG
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
