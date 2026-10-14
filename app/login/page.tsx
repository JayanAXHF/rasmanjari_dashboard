import { SchoolLogin } from "@/components/auth/school-login"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function SchoolLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return <main className="mx-auto flex min-h-svh max-w-md items-center px-6 py-8"><Card className="w-full border-t-4 border-t-primary"><CardHeader><Badge variant="secondary">Rasmanjari</Badge><CardTitle className="mt-3">School sign in</CardTitle><CardDescription>Use your school credentials or scan your school card.</CardDescription></CardHeader><CardContent><SchoolLogin error={error === "1"} /><a className="mt-7 inline-block text-xs font-semibold tracking-widest text-muted-foreground uppercase hover:text-foreground" href="/guidelines">Competition guidelines →</a></CardContent></Card></main>
}
