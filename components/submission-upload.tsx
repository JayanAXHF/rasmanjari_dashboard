"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

export function SubmissionUpload({ maxFileSizeMB }: { maxFileSizeMB: number }) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState("")
  const [uploading, setUploading] = useState(false)

  function upload() {
    if (!file) return
    setUploading(true); setError(""); setProgress(0)
    const body = new FormData(); body.set("file", file)
    const request = new XMLHttpRequest()
    request.open("POST", "/api/submissions")
    request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100)) }
    request.onload = () => {
      setUploading(false)
      if (request.status >= 200 && request.status < 300) { router.refresh(); return }
      try { setError(JSON.parse(request.responseText).error ?? "Upload failed.") } catch { setError("Upload failed.") }
    }
    request.onerror = () => { setUploading(false); setError("The network interrupted the upload. Please try again.") }
    request.send(body)
  }

  return <div className="space-y-4">
    <Input ref={fileInput} type="file" accept="image/png,.png" className="block" disabled={uploading} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); setProgress(0) }} />
    <p className="text-sm text-slate-600">PNG only, up to {maxFileSizeMB} MB. Your submission is final.</p>
    {file && <p className="rounded bg-slate-50 p-3 text-sm"><strong>{file.name}</strong> · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
    {uploading && <Progress value={progress} aria-live="polite"><ProgressLabel>Uploading</ProgressLabel><ProgressValue>{(_formattedValue, value) => `${value ?? 0}%`}</ProgressValue></Progress>}
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" disabled={!file || uploading} />}>{uploading ? "Uploading…" : "Submit final PNG"}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Submit final entry?</AlertDialogTitle><AlertDialogDescription>This PNG will be your school’s final entry. It cannot be changed unless an administrator resets it.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Go back</AlertDialogCancel><AlertDialogAction onClick={upload}>Confirm submission</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
