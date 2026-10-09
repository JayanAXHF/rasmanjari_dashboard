"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function LoginForm({ admin = false }: { admin?: boolean }) {
  const router = useRouter()
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function submit(formData: FormData) {
    setPending(true)
    setError("")
    try {
      const response = await fetch(
        admin ? "/api/auth/admin/login" : "/api/auth/school/login",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            schoolCode: formData.get("schoolCode"),
            password: formData.get("password"),
          }),
        }
      )
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok) return setError(result.error ?? "Unable to sign in.")
      router.replace(admin ? "/admin" : "/dashboard")
      router.refresh()
    } catch {
      setError("Unable to contact the server. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form action={submit} className="space-y-5">
      {!admin && (
        <label className="block text-sm font-medium text-foreground">
          School ID
          <Input
            required
            name="schoolCode"
            autoCapitalize="characters"
            className="mt-1.5"
          />
        </label>
      )}
      <label className="block text-sm font-medium text-foreground">
        Password
        <Input
          required
          name="password"
          type="password"
          autoComplete="current-password"
          className="mt-1.5"
        />
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  )
}
