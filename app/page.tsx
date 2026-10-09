import { ArrowRight, Building2, ImageIcon, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <main className="relative mx-auto flex min-h-svh max-w-6xl items-center overflow-hidden px-6 py-16">
      <div className="absolute -top-36 right-0 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative grid w-full gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section>
          <Badge variant="secondary">Rasmanjari · 2026</Badge>
          <h1 className="mt-5 max-w-3xl font-heading text-5xl font-semibold tracking-wider text-foreground uppercase sm:text-6xl">
            Interschool
            <br />
            <span className="text-primary">Competition</span> portal
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            View the competition prompt, prepare your response, and submit one
            final PNG entry on behalf of your school.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button render={<a href="/login" />}>
              <Building2 data-icon="inline-start" />
              School sign in
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button variant="outline" render={<a href="/guidelines" />}>
              Read guidelines
            </Button>
          </div>
          <a
            className="mt-8 inline-block text-xs font-semibold tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground"
            href="/admin/login"
          >
            Administrator access →
          </a>
        </section>
      </div>
    </main>
  )
}
