"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { IScannerControls } from "@zxing/browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { parseSchoolQr } from "@/lib/school-qr"

type Phase = "idle" | "starting" | "scanning" | "image" | "login"

function cameraError(error: unknown) {
  const name = error instanceof Error ? error.name : ""
  if (name === "NotAllowedError") return "Camera access was denied. Allow it in your browser settings, choose an image, or cancel to sign in manually."
  if (name === "NotFoundError") return "No camera was found. Choose an image or cancel to sign in manually."
  if (name === "NotReadableError") return "The camera is busy or unavailable. Close other apps using it and try again."
  return "Could not start the camera. Try again, choose an image, or cancel to sign in manually."
}

export function SchoolQrScanner({ disabled, onActiveChange }: { disabled: boolean; onActiveChange: (active: boolean) => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const [message, setMessage] = useState("")
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState("")
  const [videoKey, setVideoKey] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const controls = useRef<IScannerControls | null>(null)
  const generation = useRef(0)
  const locked = useRef(false)
  const request = useRef<AbortController | null>(null)
  const imageUrl = useRef<string | null>(null)
  const launchButton = useRef<HTMLButtonElement>(null)

  const stopMedia = useCallback(() => {
    controls.current?.stop()
    controls.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
    if (imageUrl.current) URL.revokeObjectURL(imageUrl.current)
    imageUrl.current = null
  }, [])

  const cleanup = useCallback(() => {
    generation.current += 1
    locked.current = false
    request.current?.abort()
    request.current = null
    stopMedia()
  }, [stopMedia])

  useEffect(() => {
    function hide() {
      if (document.visibilityState !== "hidden") return
      cleanup()
      setOpen(false)
      setPhase("idle")
      onActiveChange(false)
    }
    document.addEventListener("visibilitychange", hide)
    window.addEventListener("pagehide", cleanup)
    return () => {
      document.removeEventListener("visibilitychange", hide)
      window.removeEventListener("pagehide", cleanup)
      cleanup()
    }
  }, [cleanup, onActiveChange])

  async function authenticate(payload: string, token: number) {
    if (token !== generation.current || locked.current) return
    locked.current = true
    stopMedia()
    const credentials = parseSchoolQr(payload)
    if (!credentials) {
      setMessage("This QR code is not a valid school card. Scan or select one school card and try again.")
      setPhase("idle")
      return
    }
    setPhase("login")
    setMessage("Signing in…")
    const controller = new AbortController()
    request.current = controller
    // Never retry automatically: every retry must be an explicit user action.
    try {
      const response = await fetch("/api/auth/school/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        signal: controller.signal,
      })
      if (token !== generation.current) return
      if (response.ok) {
        router.replace("/dashboard")
        router.refresh()
        return
      }
      setMessage(response.status === 429
        ? "Too many sign-in attempts. Please wait before trying again."
        : response.status === 400 || response.status === 401
          ? "Invalid school ID or password. Try another card or cancel to sign in manually."
          : "Sign-in is temporarily unavailable. Please try again.")
    } catch {
      if (token !== generation.current) return
      setMessage("Could not reach the sign-in service. Check your connection and try again.")
    }
    if (token === generation.current) {
      request.current = null
      setPhase("idle")
    }
  }

  async function startCamera(selected = "") {
    cleanup()
    const token = generation.current
    setVideoKey(token)
    setMessage("")
    if (!window.isSecureContext) {
      setMessage("Camera scanning requires HTTPS. Choose an image or cancel to sign in manually.")
      setPhase("idle")
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Camera scanning is unavailable in this browser. Choose an image or cancel to sign in manually.")
      setPhase("idle")
      return
    }
    setPhase("starting")
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser")
      if (token !== generation.current) return
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: selected ? { deviceId: { exact: selected } } : { facingMode: { ideal: "environment" } },
      })
      if (token !== generation.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = media
      setDeviceId(media.getVideoTracks()[0]?.getSettings().deviceId ?? selected)
      // Device labels become available after camera permission is granted.
      navigator.mediaDevices.enumerateDevices().then((available) => {
        if (token === generation.current) setDevices(available.filter((device) => device.kind === "videoinput"))
      }).catch(() => { /* Scanning still works without camera enumeration. */ })
      const reader = new BrowserQRCodeReader()
      const activeControls = await reader.decodeFromStream(media, video.current!, (result) => {
        if (result) void authenticate(result.getText(), token)
      })
      if (token !== generation.current || locked.current) activeControls.stop()
      else {
        controls.current = activeControls
        setPhase("scanning")
      }
    } catch (error) {
      if (token !== generation.current || locked.current) return
      stopMedia()
      setPhase("idle")
      setMessage(cameraError(error))
    }
  }

  async function scanImage(file: File) {
    cleanup()
    const token = generation.current
    setPhase("idle")
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("Choose a PNG, JPEG, or WebP image. For a PDF card, take a screenshot of one card first.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("Choose an image smaller than 10 MB.")
      return
    }
    setPhase("image")
    setMessage("Reading image…")
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser")
      if (token !== generation.current) return
      const url = URL.createObjectURL(file)
      imageUrl.current = url
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url)
      await authenticate(result.getText(), token)
    } catch {
      if (token !== generation.current) return
      stopMedia()
      setPhase("idle")
      setMessage("Could not read a QR code from this image. Choose a clear photo or screenshot containing one school card.")
    }
  }

  function cancel() {
    cleanup()
    setOpen(false)
    setPhase("idle")
    setMessage("")
    onActiveChange(false)
    requestAnimationFrame(() => launchButton.current?.focus())
  }

  const busy = phase === "login" || phase === "image"
  if (!open) return <Button ref={launchButton} type="button" variant="outline" className="w-full" disabled={disabled} onClick={() => {
    setOpen(true)
    onActiveChange(true)
    setMessage("")
  }}>Scan school QR code</Button>

  return (
    <section aria-label="School QR sign-in" className="space-y-4 border border-border p-4">
      <p className="text-sm">Scan one school card to sign in automatically, or choose a photo or screenshot. Images stay on your device.</p>
      <video key={videoKey} ref={video} muted playsInline autoPlay className={`aspect-square w-full bg-black object-contain ${phase === "starting" || phase === "scanning" ? "" : "hidden"}`} aria-label="Camera preview" />
      {devices.length > 1 && (
        <label className="block text-sm font-medium">
          Camera
          <select aria-label="Camera" value={deviceId} disabled={busy || phase === "starting"} className="mt-1 w-full border border-border bg-background p-2 text-sm" onChange={(event) => void startCamera(event.target.value)}>
            {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
          </select>
        </label>
      )}
      <Button type="button" className="w-full" disabled={busy || phase === "starting" || phase === "scanning"} onClick={() => void startCamera(deviceId)}>
        {phase === "starting" ? "Starting camera…" : phase === "scanning" ? "Scanning…" : "Start camera"}
      </Button>
      <label className="block text-sm font-medium">
        Choose image
        <Input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="mt-1.5" onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void scanImage(file)
        }} />
      </label>
      <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP; up to 10 MB. Keep just one QR code in view.</p>
      <p role="status" aria-live="polite" className="text-sm">{message || (phase === "scanning" ? "Hold the school QR code steady in front of the camera." : "")}</p>
      <Button type="button" variant="ghost" disabled={phase === "login"} className="w-full" onClick={cancel}>Cancel</Button>
    </section>
  )
}
