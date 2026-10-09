import { asc } from "drizzle-orm"

import { addSchool, deleteSchool, importSchools, resetSchoolPassword } from "@/app/admin/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { schools } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

export default async function SchoolsPage() {
  await requireAdmin(); const rows = await db.select().from(schools).orderBy(asc(schools.schoolCode))
  return <main className="mx-auto min-h-svh max-w-6xl px-6 py-10"><a className="text-xs font-semibold tracking-widest text-muted-foreground uppercase hover:text-foreground" href="/admin">← Dashboard</a><div className="mt-5"><Badge variant="secondary">{rows.length} schools</Badge><h1 className="mt-3 font-heading text-3xl font-semibold tracking-wider uppercase">Schools</h1></div><div className="mt-8 grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Add school</CardTitle><CardDescription>Create individual credentials for a school.</CardDescription></CardHeader><CardContent><form action={addSchool} className="grid gap-4"><Input name="schoolCode" placeholder="School ID e.g. SCHOOL01" required /><Input name="name" placeholder="School name" required /><Input name="password" type="password" placeholder="Initial password (12+ characters)" required /><Button type="submit">Create school</Button></form></CardContent></Card><Card><CardHeader><CardTitle>CSV import</CardTitle><CardDescription>Header: schoolCode,name,password. Omit passwords only if you will reset each one later.</CardDescription></CardHeader><CardContent><form action={importSchools} className="grid gap-4"><Input name="csv" type="file" accept=".csv,text/csv" required /><Button type="submit" variant="outline">Import schools</Button></form></CardContent></Card></div><Card className="mt-6"><CardHeader><CardTitle>Registered schools</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>School</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((school) => <TableRow key={school.id}><TableCell><p className="font-medium">{school.name}</p><p className="text-xs text-muted-foreground">{school.schoolCode}</p></TableCell><TableCell>{school.createdAt.toLocaleDateString()}</TableCell><TableCell><div className="flex justify-end gap-2"><form action={resetSchoolPassword} className="flex gap-2"><input type="hidden" name="schoolId" value={school.id} /><Input name="password" type="password" placeholder="New password" className="h-8 w-36" required /><Button type="submit" size="xs" variant="outline">Reset password</Button></form><form action={deleteSchool}><input type="hidden" name="schoolId" value={school.id} /><Button type="submit" size="xs" variant="destructive">Delete</Button></form></div></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></main>
}
