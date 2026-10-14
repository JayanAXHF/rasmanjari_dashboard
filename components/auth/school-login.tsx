"use client"

import { useRef, useState } from "react"
import { LoginForm } from "@/components/auth/login-form"
import { SchoolQrScanner } from "@/components/auth/school-qr-scanner"

export function SchoolLogin({ error }: { error: boolean }) {
  const [scannerActive, setScannerActive] = useState(false)
  const [manualPending, setManualPending] = useState(false)
  const manualLock = useRef(false)

  return (
    <div className="space-y-5">
      <LoginForm error={error} disabled={scannerActive} pending={manualPending} onSubmit={(event) => {
        if (scannerActive || manualLock.current) {
          event.preventDefault()
          return
        }
        manualLock.current = true
        setManualPending(true)
      }} />
      <SchoolQrScanner disabled={manualPending} onActiveChange={setScannerActive} />
    </div>
  )
}
