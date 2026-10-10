import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"

export default async function JudgeLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const message =
    error === "setup"
      ? "Judge access has not been configured. Contact the administrator."
      : error === "limited"
        ? "Too many attempts. Please try again later."
        : "Invalid password. Please try again."
  return (
    <main className="mx-auto flex min-h-svh max-w-md items-center px-6">
      <Card className="w-full border-t-4 border-t-primary">
        <CardHeader>
          <CardTitle>Judge sign in</CardTitle>
          <CardDescription>
            Use the shared judge password to view entries and enter marks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action="/api/auth/judge/login"
            method="post"
            className="space-y-5"
          >
            <label className="block text-sm font-medium">
              Password
              <Input
                className="mt-2"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={256}
                required
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            )}
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
