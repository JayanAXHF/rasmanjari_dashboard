// Requires a production build, Playwright Chromium, school-card Python deps, and pdftoppm.
// Uses only a temporary database and synthetic school credentials.
import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { spawn, spawnSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createServer } from "node:net"
import { once } from "node:events"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import argon2 from "argon2"
import sharp from "sharp"
import { chromium, expect } from "@playwright/test"

const password = "  synthetic-QR-pass!  "
let directory, server, browser, origin, image, imageData

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "school-qr-test-"))
  const sqlite = new Database(path.join(directory, "app.db"))
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" })
  sqlite.prepare("INSERT INTO schools (id, school_code, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("qr-school", "QR01", "Synthetic QR School", await argon2.hash(password), Date.now())
  sqlite.close()
  const pdf = path.join(directory, "card.pdf")
  const record = ["QR01", "Synthetic QR School", password].map((field) => Buffer.from(field).toString("base64")).join("\t") + "\n"
  const generated = spawnSync(process.env.PYTHON_BIN || "python3", ["scripts/generate-school-cards.py", "--output", pdf], { input: record, encoding: "utf8" })
  assert.equal(generated.status, 0, generated.stderr)
  const rendered = spawnSync("pdftoppm", ["-singlefile", "-r", "200", "-png", pdf, path.join(directory, "page")], { encoding: "utf8" })
  assert.equal(rendered.status, 0, rendered.stderr)
  image = path.join(directory, "card.png")
  // First card on the A4 page, including the full quiet zone around its QR.
  await sharp(path.join(directory, "page.png")).extract({ left: 85, top: 85, width: 730, height: 690 }).png().toFile(image)
  imageData = `data:image/png;base64,${(await readFile(image)).toString("base64")}`
  const probe = createServer().listen(0, "127.0.0.1")
  await once(probe, "listening")
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  origin = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, DATABASE_PATH: path.join(directory, "app.db"), UPLOAD_DIR: directory, PROMPT_DIR: directory,
      SCHOOL_SESSION_PASSWORD: "school-qr-test-secret-".repeat(3), ADMIN_SESSION_PASSWORD: "admin-qr-test-secret-".repeat(3), SESSION_COOKIE_SECURE: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  server.stdout.on("data", (data) => { output += data })
  server.stderr.on("data", (data) => { output += data })
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(`${origin}/api/health`)).ok } catch { /* Wait for startup. */ }
    if (ready) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(ready, output)
  browser = await chromium.launch({ headless: true })
}, { timeout: 120000 })

after(async () => {
  await browser?.close()
  if (server && server.exitCode === null) {
    server.kill("SIGTERM")
    await once(server, "exit")
  }
  if (directory) await rm(directory, { recursive: true, force: true })
})

async function pageForTest() {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${origin}/login`)
  return page
}

async function openScanner(page) {
  await page.getByRole("button", { name: "Scan school QR code" }).click()
  await expect(page.getByRole("textbox", { name: "School ID" })).toBeDisabled()
}

test("camera policy is allowed only on school login", async () => {
  for (const [url, expected] of [["/login", "camera=(self)"], ["/admin/login", "camera=()"], ["/judge/login", "camera=()"]]) {
    const response = await fetch(origin + url)
    assert.ok(response.headers.get("permissions-policy").includes(expected))
    assert.ok(response.headers.get("content-security-policy").includes("media-src 'self' blob:"))
  }
})

test("rendered school-card image signs in and creates a real school session", async () => {
  const page = await pageForTest()
  await openScanner(page)
  await page.getByLabel("Choose image").setInputFiles(image)
  await page.waitForURL("**/dashboard")
  assert.equal(await page.getByRole("heading", { name: "Synthetic QR School" }).count(), 1)
  const cookies = await page.context().cookies()
  assert.ok(cookies.some((cookie) => cookie.name === "portal_school" && cookie.httpOnly))
})

test("manual sign-in still posts both credentials", async () => {
  const page = await pageForTest()
  await page.getByRole("textbox", { name: "School ID" }).fill("QR01")
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL("**/dashboard")
})

test("denied permission, unreadable images and unsupported formats leave manual fallback", async () => {
  const page = await pageForTest()
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError") } })
  await openScanner(page)
  await page.getByRole("button", { name: "Start camera" }).click()
  await page.getByRole("status").filter({ hasText: "Camera access was denied" }).waitFor()
  await page.getByLabel("Choose image").setInputFiles({ name: "card.pdf", mimeType: "application/pdf", buffer: Buffer.from("pdf") })
  await page.getByRole("status").filter({ hasText: "Choose a PNG" }).waitFor()
  const blank = await sharp({ create: { width: 64, height: 64, channels: 3, background: "white" } }).png().toBuffer()
  await page.getByLabel("Choose image").setInputFiles({ name: "blank.png", mimeType: "image/png", buffer: blank })
  await page.getByRole("status").filter({ hasText: "Could not read a QR" }).waitFor()
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "School ID" })).toBeEnabled()
})

test("authentication errors require an explicit retry and never repeat requests", async () => {
  const page = await pageForTest()
  let attempts = 0
  await page.route("**/api/auth/school/login", (route) => {
    attempts++
    assert.deepEqual(route.request().postDataJSON(), { schoolCode: "QR01", password })
    return route.fulfill({ status: attempts === 1 ? 401 : 429, json: { error: "synthetic failure" } })
  })
  await openScanner(page)
  await page.getByLabel("Choose image").setInputFiles(image)
  await page.getByRole("status").filter({ hasText: "Invalid school ID or password" }).waitFor()
  assert.equal(attempts, 1)
  await page.getByLabel("Choose image").setInputFiles(image)
  await page.getByRole("status").filter({ hasText: "Too many sign-in attempts" }).waitFor()
  assert.equal(attempts, 2)
})

test("video decoding signs in once and releases camera tracks", async () => {
  const page = await pageForTest()
  await page.evaluate(async (data) => {
    const img = new Image()
    img.src = data
    await img.decode()
    const canvas = document.createElement("canvas")
    canvas.width = img.width
    canvas.height = img.height
    canvas.getContext("2d").drawImage(img, 0, 0)
    window.testCameraStream = canvas.captureStream(10)
    navigator.mediaDevices.getUserMedia = async () => window.testCameraStream
  }, imageData)
  let attempts = 0
  await page.route("**/api/auth/school/login", async (route) => {
    attempts++
    await route.fulfill({ status: 401, json: { error: "synthetic failure" } })
  })
  await openScanner(page)
  await page.getByRole("button", { name: "Start camera" }).click()
  await page.getByRole("status").filter({ hasText: "Invalid school ID or password" }).waitFor()
  assert.equal(attempts, 1)
  assert.ok(await page.evaluate(() => window.testCameraStream.getTracks().every((track) => track.readyState === "ended")))
})

test("cancelling during camera startup releases a late stream", async () => {
  const page = await pageForTest()
  await page.evaluate(() => {
    const canvas = document.createElement("canvas")
    window.testCameraStream = canvas.captureStream(10)
    navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { window.resolveTestCamera = () => resolve(window.testCameraStream) })
  })
  await openScanner(page)
  await page.getByRole("button", { name: "Start camera" }).click()
  await page.waitForFunction(() => Boolean(window.resolveTestCamera))
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await page.evaluate(() => window.resolveTestCamera())
  await page.waitForFunction(() => window.testCameraStream.getTracks().every((track) => track.readyState === "ended"))
  await expect(page.getByRole("textbox", { name: "School ID" })).toBeEnabled()
})

test("camera switching and page hiding release every stream", async () => {
  const page = await pageForTest()
  await page.evaluate(() => {
    window.testStreams = []
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas")
      canvas.getContext("2d").fillRect(0, 0, canvas.width, canvas.height)
      const stream = canvas.captureStream(10)
      const frames = setInterval(() => {
        canvas.getContext("2d").fillRect(0, 0, canvas.width, canvas.height)
        if (stream.getTracks().every((track) => track.readyState === "ended")) clearInterval(frames)
      }, 50)
      window.testStreams.push(stream)
      return stream
    }
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: "videoinput", deviceId: "front", label: "Front camera", groupId: "" },
      { kind: "videoinput", deviceId: "back", label: "Back camera", groupId: "" },
    ]
  })
  await openScanner(page)
  await page.getByRole("button", { name: "Start camera" }).click()
  await page.getByRole("button", { name: "Scanning…", exact: true }).waitFor()
  await page.getByLabel("Camera", { exact: true }).selectOption("back")
  await page.waitForFunction(() => window.testStreams.length === 2 && window.testStreams[0].getTracks().every((track) => track.readyState === "ended"))
  await page.getByRole("button", { name: "Scanning…", exact: true }).waitFor()
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await page.getByRole("button", { name: "Scan school QR code" }).waitFor()
  assert.ok(await page.evaluate(() => window.testStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended"))))
  await expect(page.getByRole("textbox", { name: "School ID" })).toBeEnabled()
})

test("network failures show a retry message without automatic requests", async () => {
  const page = await pageForTest()
  let attempts = 0
  await page.route("**/api/auth/school/login", (route) => { attempts++; return route.abort("connectionfailed") })
  await openScanner(page)
  await page.getByLabel("Choose image").setInputFiles(image)
  await page.getByRole("status").filter({ hasText: "Check your connection" }).waitFor()
  assert.equal(attempts, 1)
})
