import { saveSettings, uploadPrompt } from "@/app/admin/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { requireAdmin } from "@/lib/auth"
import { getSettings } from "@/lib/settings"

export const dynamic = "force-dynamic"
const datetime = (value: Date | null) => value ? new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ""

export default async function SettingsPage() {
  await requireAdmin(); const setting = await getSettings()
  return <main className="mx-auto min-h-svh max-w-3xl px-6 py-10"><a className="text-xs font-semibold tracking-widest text-muted-foreground uppercase hover:text-foreground" href="/admin">← Dashboard</a><div className="mt-5"><Badge variant="secondary">Competition setup</Badge><h1 className="mt-3 font-heading text-3xl font-semibold tracking-wider uppercase">Settings</h1></div><div className="mt-8 grid gap-6"><Card><CardHeader><CardTitle>Submission window</CardTitle><CardDescription>All times use the server’s local time zone.</CardDescription></CardHeader><CardContent><form action={saveSettings} className="grid gap-5"><label className="text-sm font-medium">Open at<Input name="submissionsOpenAt" type="datetime-local" defaultValue={datetime(setting.submissionsOpenAt)} className="mt-2" /></label><label className="text-sm font-medium">Close at<Input name="submissionsCloseAt" type="datetime-local" defaultValue={datetime(setting.submissionsCloseAt)} className="mt-2" /></label><label className="text-sm font-medium">Maximum PNG size (MB)<Input name="maxFileSizeMB" type="number" min="1" max="100" defaultValue={setting.maxFileSizeMB} className="mt-2" required /></label><Button type="submit">Save competition settings</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Prompt image</CardTitle><CardDescription>{setting.promptImagePath ? "A prompt is uploaded. Replacing it updates the private school prompt immediately." : "Upload a PNG prompt image for participating schools."}</CardDescription></CardHeader><CardContent><form action={uploadPrompt} className="flex flex-col gap-4 sm:flex-row"><Input name="prompt" type="file" accept="image/png,.png" required /><Button type="submit" variant="outline">Upload prompt PNG</Button></form></CardContent></Card></div></main>
}
