// Run after `pnpm exec next build --webpack`. Uses only temporary data and a local server.
import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:net"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import argon2 from "argon2"
import sharp from "sharp"
import { sealData } from "iron-session"
import { existsSync } from "node:fs"
import { launchBrowser } from "./browser-cdp.mjs"

const secret = (kind) => `integration-${kind}-secret-at-least-32-characters`
let directory, sqlite, server, origin, judgeCookie, adminCookie, schoolCookie
const password = "integration-judge-password"
const headers = (cookie) => ({ Cookie: cookie, Origin: origin, "Content-Type": "application/json" })
const score = (criterion, value, cookie = judgeCookie, submissionId = "entry-a") => fetch(`${origin}/api/judge/scores`, {
  method: "PATCH", headers: headers(cookie), body: JSON.stringify({ submissionId, criterion, value }),
})
const get = (route, cookie = "") => fetch(`${origin}${route}`, { headers: { Cookie: cookie }, redirect: "manual" })

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "rasmanjari-judging-test-"))
  const oldMigrations = path.join(directory, "old-migrations")
  await mkdir(path.join(oldMigrations, "meta"), { recursive: true })
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"))
  for (const entry of journal.entries.slice(0, 3)) await copyFile(`drizzle/${entry.tag}.sql`, path.join(oldMigrations, `${entry.tag}.sql`))
  await writeFile(path.join(oldMigrations, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 3) }))
  sqlite = new Database(path.join(directory, "app.db"))
  sqlite.pragma("foreign_keys = ON")
  sqlite.pragma("journal_mode = WAL")
  migrate(drizzle(sqlite), { migrationsFolder: oldMigrations })
  const hash = await argon2.hash(password)
  for (const [id, code, name] of [["school-a", "TEAM01", "Secret School Alpha"], ["school-b", "TEAM02", "Secret School Beta"], ["school-c", "TEAM03", "Secret School Gamma"]]) {
    sqlite.prepare("INSERT INTO schools (id, school_code, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(id, code, name, hash, Date.now())
  }
  sqlite.prepare("INSERT INTO settings (id) VALUES (1)").run()
  const imagePath = path.join(directory, "entry.png"), thumbPath = path.join(directory, "thumb.webp")
  await sharp({ create: { width: 32, height: 24, channels: 3, background: "#e9d5ff" } }).withExif({ IFD0: { Artist: "Secret School Alpha" } }).png().toFile(imagePath)
  await sharp(imagePath).webp().toFile(thumbPath)
  for (const [id, school] of [["entry-a", "school-a"], ["entry-b", "school-b"]]) {
    sqlite.prepare("INSERT INTO submissions (id, school_id, file_path, thumb_path, original_name, size_bytes, width, height, sha256, submitted_at, status) VALUES (?, ?, ?, ?, ?, 100, 32, 24, 'test-hash', ?, 'flagged')").run(id, school, imagePath, thumbPath, "Secret School Alpha.png", Date.now())
  }
  // Upgrade an existing populated database, then repeat to verify idempotence.
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" })
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" })
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM submissions").get().n, 2)
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM schools").get().n, 3)
  sqlite.prepare("UPDATE settings SET judge_password_hash = ? WHERE id = 1").run(hash)
  adminCookie = `portal_admin=${await sealData({ admin: { version: 0, authenticatedAt: Date.now() } }, { password: secret("admin"), ttl: 7200 })}`
  schoolCookie = `portal_school=${await sealData({ school: { id: "school-a", schoolCode: "TEAM01", name: "Secret School Alpha", version: 0 } }, { password: secret("school"), ttl: 7200 })}`
  const probe = createServer()
  probe.listen(0, "127.0.0.1")
  await once(probe, "listening")
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  origin = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, DATABASE_PATH: path.join(directory, "app.db"), UPLOAD_DIR: directory, PROMPT_DIR: directory,
      ADMIN_SESSION_PASSWORD: secret("admin"), SCHOOL_SESSION_PASSWORD: secret("school"), JUDGE_SESSION_PASSWORD: secret("judge"),
      ADMIN_PASSWORD_HASH: hash, SESSION_COOKIE_SECURE: "false" }, stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  server.stdout.on("data", (data) => { output += data })
  server.stderr.on("data", (data) => { output += data })
  let ready = false
  for (let attempt = 0; attempt < 150; attempt++) {
    try { ready = (await get("/api/health")).ok } catch { /* Startup may still be in progress. */ }
    if (ready) break
    if (server.exitCode !== null) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.ok(ready, `Test server failed to start: ${output}`)
  const login = await fetch(`${origin}/api/auth/judge/login`, { method: "POST", body: new URLSearchParams({ password }), redirect: "manual" })
  assert.equal(login.status, 303)
  assert.equal(new URL(login.headers.get("location")).pathname, "/judge")
  judgeCookie = login.headers.get("set-cookie").split(";")[0]
}, { timeout: 45000 })

after(async () => {
  if (server && server.exitCode === null) { const exited = once(server, "exit"); server.kill(); await exited }
  sqlite?.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

test("judge page is anonymous and shows all submitted entries, including flagged", async () => {
  const response = await get("/judge", judgeCookie)
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /TEAM01/)
  assert.match(html, /TEAM02/)
  assert.doesNotMatch(html, /Secret School|originalName|passwordHash|test-hash|flagged/)
  assert.equal((await get("/judge")).status, 307)
  assert.equal((await get("/judge", schoolCookie)).status, 307)
})

test("roles cannot cross authorization boundaries", async () => {
  assert.equal((await get("/api/admin/results", judgeCookie)).status, 401)
  assert.equal((await get("/api/admin/results", schoolCookie)).status, 401)
  assert.equal((await get("/admin/submissions", judgeCookie)).status, 307)
  assert.equal((await get("/api/admin/export", judgeCookie)).status, 401)
  assert.equal((await score("message", "5", "")).status, 401)
  assert.equal((await score("message", "5", schoolCookie)).status, 401)
  assert.equal((await score("message", "5", adminCookie)).status, 401)
  const upload = await fetch(`${origin}/api/submissions`, { method: "POST", headers: { Cookie: judgeCookie }, body: new FormData() })
  assert.equal(upload.status, 401)
})

test("judges receive images with metadata stripped, and cannot bypass protection", async () => {
  const response = await get("/api/files/entry-a", judgeCookie)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
  assert.equal(metadata.width, 32)
  assert.equal(metadata.height, 24)
  assert.equal(metadata.exif, undefined)
  assert.equal((await get("/api/files/entry-a?judge=1&thumbnail=1", judgeCookie)).status, 200)
  assert.equal((await get("/api/files/entry-a")).status, 403)
  assert.equal((await get("/api/files/entry-a?judge=1", schoolCookie)).status, 403)
  assert.equal((await get("/api/files/entry-b", schoolCookie)).status, 403)
})

test("score validation, partial marks, independent updates, revisions, and clearing", async () => {
  for (const invalid of ["-1", "5.01", "0.001", "NaN", 4]) assert.equal((await score("message", invalid)).status, 400)
  assert.equal((await score("unknown", "2")).status, 400)
  assert.equal((await score("message", "2", judgeCookie, "missing")).status, 404)
  const crossOrigin = await fetch(`${origin}/api/judge/scores`, { method: "PATCH", headers: { ...headers(judgeCookie), Origin: "https://other.example" }, body: JSON.stringify({ submissionId: "entry-a", criterion: "message", value: "5" }) })
  assert.equal(crossOrigin.status, 403)
  const changes = await Promise.all([score("message", "4.99"), score("originality", "0"), score("visualAppeal", "2.50")])
  changes.forEach((response) => assert.equal(response.status, 200))
  let row = sqlite.prepare("SELECT * FROM scorecards WHERE submission_id = 'entry-a'").get()
  assert.deepEqual([row.message, row.originality, row.visual_appeal, row.creativity], [499, 0, 250, null])
  const results = await (await get("/api/admin/results", adminCookie)).json()
  assert.equal(results.rows.length, 3)
  assert.equal(results.rows.find((team) => team.username === "TEAM01").message, 499)
  assert.equal((await score("creativity", "5")).status, 200)
  assert.equal((await score("message", "1.01")).status, 200)
  assert.equal((await score("originality", "")).status, 200)
  row = sqlite.prepare("SELECT * FROM scorecards WHERE submission_id = 'entry-a'").get()
  assert.deepEqual([row.message, row.originality, row.visual_appeal, row.creativity], [101, null, 250, 500])
  assert.throws(() => sqlite.prepare("UPDATE scorecards SET message = 501").run())
  assert.throws(() => sqlite.prepare("UPDATE scorecards SET message = 0.5").run())
})

test("admin pages expose marks and leaderboard while judge logout targets judge login", async () => {
  for (const route of ["/admin/leaderboard", "/admin/submissions"]) {
    const response = await get(route, adminCookie)
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.match(html, /Secret School Alpha/)
    assert.match(html, /1\.01/)
    assert.match(html, /partial/)
  }
  const logout = await fetch(`${origin}/api/auth/logout?kind=judge`, { method: "POST", headers: { Cookie: judgeCookie }, redirect: "manual" })
  assert.equal(logout.status, 303)
  assert.equal(logout.headers.get("location"), "/judge/login")
  assert.match(logout.headers.get("set-cookie"), /portal_judge=/)
})

const browserExecutable = process.env.JUDGING_BROWSER ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "")
test("browser autosave, retry, revisions, live admin marks, and leaderboard", { skip: !browserExecutable || !existsSync(browserExecutable), timeout: 60000 }, async () => {
  for (const criterion of ["message", "originality", "visualAppeal", "creativity"]) assert.equal((await score(criterion, "")).status, 200)
  const browser = await launchBrowser(browserExecutable, path.join(directory, "chrome-profile"))
  try {
    const judge = await browser.page(`${origin}/judge`, judgeCookie)
    const admin = await browser.page(`${origin}/admin/leaderboard`, adminCookie)
    const review = await browser.page(`${origin}/admin/submissions`, adminCookie)
    await browser.waitFor(judge, "document.querySelector('#entry-a-message') && Object.keys(document.querySelector('#entry-a-message')).some(key => key.startsWith('__reactProps'))")
    const fill = async (criterion, value) => {
      await browser.evaluate(judge, `document.getElementById(${JSON.stringify(`entry-a-${criterion}`)}).select()`)
      await browser.send("Input.insertText", { text: value }, judge)
    }
    assert.doesNotMatch(await browser.evaluate(judge, "document.body.innerText"), /Secret School/)
    await browser.waitFor(judge, "Array.from(document.images).every(image => image.complete && image.naturalWidth > 0)")
    await fill("message", "4.99")
    await browser.waitFor(admin, "document.body.innerText.includes('4.99') && document.body.innerText.includes('partial')")
    await browser.waitFor(review, "document.body.innerText.includes('4.99') && document.body.innerText.includes('partial')")
    await fill("originality", "0")
    await fill("visualAppeal", "2.50")
    await fill("creativity", "5")
    await browser.waitFor(judge, "document.body.innerText.includes('Total: 12.49 / 20') && !document.body.innerText.includes('Changes are not all saved yet.')")
    await browser.waitFor(admin, "document.querySelector('[role=meter]')?.getAttribute('aria-valuenow') === '12.49'")
    await fill("message", "2.25")
    await browser.waitFor(admin, "document.querySelector('[role=meter]')?.getAttribute('aria-valuenow') === '9.75'")
    await fill("message", "5.01")
    await browser.waitFor(judge, "document.getElementById('entry-a-message').getAttribute('aria-invalid') === 'true'")
    assert.equal(sqlite.prepare("SELECT message FROM scorecards WHERE submission_id = 'entry-a'").get().message, 225)
    // Fail one save to verify input retention and the visible retry action.
    await browser.evaluate(judge, "window.originalFetch = window.fetch; window.fetch = (...args) => { if (args[0] === '/api/judge/scores') { window.fetch = window.originalFetch; return Promise.reject(new Error('Simulated save failure')) }; return window.originalFetch(...args) }")
    await fill("message", "3.25")
    await browser.waitFor(judge, "document.body.innerText.includes('Simulated save failure') && Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Retry')")
    assert.equal(await browser.evaluate(judge, "document.getElementById('entry-a-message').value"), "3.25")
    await browser.evaluate(judge, "Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Retry').click()")
    await browser.waitFor(admin, "document.querySelector('[role=meter]')?.getAttribute('aria-valuenow') === '10.75'")
    const settings = await browser.page(`${origin}/admin/settings`, adminCookie)
    await browser.waitFor(settings, "document.querySelector('input[name=password]') && Object.keys(document.querySelector('input[name=password]')).some(key => key.startsWith('__reactProps'))")
    await browser.evaluate(settings, "document.querySelector('input[name=password]').select()")
    await browser.send("Input.insertText", { text: "rotated-integration-password" }, settings)
    await browser.evaluate(settings, "Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Save judge password').click()")
    await browser.waitFor(settings, "document.querySelector('input[name=password]').value === ''")
    const rotated = sqlite.prepare("SELECT judge_password_hash, judge_session_version FROM settings").get()
    assert.ok(rotated.judge_session_version > 0)
    assert.equal(await argon2.verify(rotated.judge_password_hash, "rotated-integration-password"), true)
    assert.equal((await score("message", "2")).status, 401)
    assert.deepEqual(browser.errors, [])
  } finally { await browser.close() }
})

test("password rotation invalidates old judge sessions and school deletion clears scorecards", async () => {
  sqlite.prepare("UPDATE settings SET judge_session_version = judge_session_version + 1").run()
  assert.equal((await score("message", "2")).status, 401)
  assert.equal((await get("/judge", judgeCookie)).status, 307)
  assert.equal((await get("/api/files/entry-a", judgeCookie)).status, 403)
  sqlite.prepare("DELETE FROM schools WHERE id = 'school-a'").run()
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM scorecards").get().n, 0)
})
