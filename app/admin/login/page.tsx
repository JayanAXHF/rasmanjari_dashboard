import { LoginForm } from "@/components/auth/login-form"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main className="mx-auto flex min-h-svh max-w-md items-center px-6">
      <Card className="w-full border-t-4 border-t-primary">
        <CardHeader>
          <Badge variant="secondary">Restricted area</Badge>
          <CardTitle className="mt-3">Administrator sign in</CardTitle>
          <CardDescription>
            This area is restricted to competition administrators.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm admin error={error === "1"} />
        </CardContent>
      </Card>
    </main>
  )
}
