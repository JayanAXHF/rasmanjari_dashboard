import fs from "node:fs/promises"
import path from "node:path"

import { dataDirectory } from "@/lib/db"

export const storagePaths = {
  root: dataDirectory,
  uploads: requireEnvironment("UPLOAD_DIR"),
  thumbnails: path.join(requireEnvironment("UPLOAD_DIR"), "thumbnails"),
  prompt: requireEnvironment("PROMPT_DIR"),
  temporary: path.join(requireEnvironment("UPLOAD_DIR"), "temporary"),
}

function requireEnvironment(name: "UPLOAD_DIR" | "PROMPT_DIR") {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be set`)
  return value
}

export async function ensureStorageDirectories() {
  await Promise.all(Object.values(storagePaths).map((directory) => fs.mkdir(directory, { recursive: true })))
}

export function submissionImagePath(id: string) {
  return path.join(storagePaths.uploads, `${id}.png`)
}

export function submissionThumbnailPath(id: string) {
  return path.join(storagePaths.thumbnails, `${id}.webp`)
}
