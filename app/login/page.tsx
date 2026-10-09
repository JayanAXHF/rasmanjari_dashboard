import { LoginForm } from "@/components/auth/login-form"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function SchoolLoginPage() {
  return <main className="mx-auto flex min-h-svh max-w-md items-center px-6"><Card className="w-full border-t-4 border-t-primary"><CardHeader><Badge variant="secondary">Rasmanjari</Badge><CardTitle className="mt-3">School sign in</CardTitle><CardDescription>Use the credentials supplied to your school.</CardDescription></CardHeader><CardContent><LoginForm /><a className="mt-7 inline-block text-xs font-semibold tracking-widest text-muted-foreground uppercase hover:text-foreground" href="/guidelines">Competition guidelines →</a></CardContent></Card></main>
}
