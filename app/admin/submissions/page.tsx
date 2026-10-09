import { desc, eq } from "drizzle-orm"

import { resetSubmission, updateSubmissionStatus } from "@/app/admin/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { schools, submissions } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

export default async function SubmissionsPage() {
  await requireAdmin()
  const rows = await db.select({ submission: submissions, school: schools }).from(submissions).innerJoin(schools, eq(submissions.schoolId, schools.id)).orderBy(desc(submissions.submittedAt))
  return <main className="mx-auto min-h-svh max-w-6xl px-6 py-10"><a className="text-xs font-semibold tracking-widest text-muted-foreground uppercase hover:text-foreground" href="/admin">← Dashboard</a><div className="mt-5 flex items-end justify-between"><div><Badge variant="secondary">{rows.length} entries</Badge><h1 className="mt-3 font-heading text-3xl font-semibold tracking-wider uppercase">Submissions</h1></div><Button render={<a href="/api/admin/export" />}>Download ZIP export</Button></div><Card className="mt-8"><CardHeader><CardTitle>Final entries</CardTitle><CardDescription>Review each final PNG, then approve, flag, or reset it.</CardDescription></CardHeader><CardContent>{rows.length === 0 ? <p className="text-muted-foreground">No submissions have been received.</p> : <Table><TableHeader><TableRow><TableHead>School</TableHead><TableHead>Preview</TableHead><TableHead>Submitted</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map(({ submission, school }) => <TableRow key={submission.id}><TableCell><p className="font-medium">{school.name}</p><p className="text-xs text-muted-foreground">{school.schoolCode}</p></TableCell><TableCell><a href={`/api/files/${submission.id}`} target="_blank"><img className="h-16 w-24 border border-border object-cover" src={`/api/files/${submission.id}?thumbnail=1`} alt={`Submission from ${school.name}`} /></a></TableCell><TableCell>{submission.submittedAt.toLocaleString()}</TableCell><TableCell><Badge variant={submission.status === "flagged" ? "destructive" : "secondary"}>{submission.status}</Badge></TableCell><TableCell><div className="flex justify-end gap-2"><form action={updateSubmissionStatus}><input type="hidden" name="submissionId" value={submission.id} /><input type="hidden" name="status" value="approved" /><Button type="submit" size="xs" variant="outline">Approve</Button></form><form action={updateSubmissionStatus}><input type="hidden" name="submissionId" value={submission.id} /><input type="hidden" name="status" value="flagged" /><Button type="submit" size="xs" variant="outline">Flag</Button></form><form action={resetSubmission}><input type="hidden" name="submissionId" value={submission.id} /><Button type="submit" size="xs" variant="destructive">Reset</Button></form></div></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></main>
}
