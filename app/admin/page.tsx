import { eq, sql } from "drizzle-orm"
import { CheckCircle2, Clock3, Settings, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { schools, submissions } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  await requireAdmin()
  const [schoolCount, submissionCount] = await Promise.all([db.select({ count: sql<number>`count(*)` }).from(schools), db.select({ count: sql<number>`count(*)` }).from(submissions)])
  const yetToSubmit = schoolCount[0].count - submissionCount[0].count
  return <main className="mx-auto min-h-svh max-w-6xl px-6 py-10"><header className="flex flex-col justify-between gap-5 border-b border-border pb-6 sm:flex-row sm:items-end"><div><Badge variant="secondary">Admin area</Badge><h1 className="mt-3 font-heading text-3xl font-semibold tracking-wider uppercase">Competition dashboard</h1><p className="mt-2 text-sm text-muted-foreground">Monitor submissions and manage the competition.</p></div><form action="/api/auth/logout?kind=admin" method="post"><Button type="submit" variant="outline" size="sm">Log out</Button></form></header><section className="mt-8 grid gap-5 md:grid-cols-2"><Card className="border-l-4 border-l-primary"><CardHeader><CardDescription className="flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" />Final submissions</CardDescription><CardTitle className="text-5xl tabular-nums">{submissionCount[0].count}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Entries received from participating schools.</CardContent></Card><Card><CardHeader><CardDescription className="flex items-center gap-2"><Clock3 className="size-4 text-muted-foreground" />Schools yet to submit</CardDescription><CardTitle className="text-5xl tabular-nums">{yetToSubmit}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Of {schoolCount[0].count} registered schools.</CardContent></Card></section><section className="mt-8"><p className="mb-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">Management</p><div className="grid gap-3 sm:grid-cols-3"><Button variant="outline" className="h-auto justify-start py-5" render={<a href="/admin/submissions" />}><CheckCircle2 data-icon="inline-start" />Review submissions</Button><Button variant="outline" className="h-auto justify-start py-5" render={<a href="/admin/schools" />}><Users data-icon="inline-start" />Manage schools</Button><Button variant="outline" className="h-auto justify-start py-5" render={<a href="/admin/settings" />}><Settings data-icon="inline-start" />Competition settings</Button></div></section></main>
}
