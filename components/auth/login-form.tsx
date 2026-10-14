"use client"

import type { FormEventHandler } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function LoginForm({ admin = false, error = false, disabled = false, pending = false, onSubmit }: { admin?: boolean; error?: boolean; disabled?: boolean; pending?: boolean; onSubmit?: FormEventHandler<HTMLFormElement> }) {
  return (
    <form action={admin ? "/api/auth/admin/login" : "/api/auth/school/login"} method="post" onSubmit={onSubmit} className="space-y-5">
      <fieldset disabled={disabled} className="space-y-5">
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
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">Invalid credentials. Please try again.</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Signing in…" : "Sign in"}</Button>
      </fieldset>
    </form>
  )
}
