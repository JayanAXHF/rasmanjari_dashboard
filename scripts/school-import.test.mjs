import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import Database from "better-sqlite3"
import argon2 from "argon2"

const root = fileURLToPath(new URL("../", import.meta.url))
const python = process.env.PYTHON_BIN || (existsSync(path.join(root, ".venv-school-cards/bin/python")) ? path.join(root, ".venv-school-cards/bin/python") : "python3")
const importer = path.join(root, "scripts/add-schools.mjs")

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "school-import-test-"))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const dbPath = path.join(dir, "portal.db")
  const db = new Database(dbPath)
  db.pragma("foreign_keys = ON")
  for (const migration of ["0000_initial.sql", "0001_session_versions.sql", "0002_file_cleanup_jobs.sql", "0003_judging.sql"]) {
    db.exec(readFileSync(path.join(root, "drizzle", migration), "utf8"))
  }
  db.prepare("INSERT INTO schools (id, school_code, name, password_hash, created_at) VALUES ('existing', 'OLD01', 'Existing School', 'unchanged', 1)").run()
  db.prepare("INSERT INTO submissions (id, school_id, file_path, thumb_path, original_name, size_bytes, width, height, sha256, submitted_at) VALUES ('entry', 'existing', 'original', 'thumb', 'art.png', 1, 1, 1, 'hash', 1)").run()
  db.prepare("INSERT INTO scorecards (submission_id, message, updated_at) VALUES ('entry', 500, 1)").run()
  t.after(() => db.close())
  return { dir, dbPath, db }
}

function prepare(dir, csv) {
  const input = path.join(dir, "schools.csv")
  const credentials = path.join(dir, "credentials.csv")
  writeFileSync(input, csv)
  return spawnSync(python, [path.join(root, "scripts/prepare-school-import.py"), input, "--credentials", credentials], { encoding: "utf8" })
}

function runImport(dbPath, input, check = false) {
  return spawnSync(process.execPath, [importer], {
    input, encoding: "utf8", env: { ...process.env, SCHOOL_IMPORT_DATABASE_PATH: dbPath, SCHOOL_IMPORT_CHECK: check ? "1" : "0" },
  })
}

test("CSV import generates verifiable passwords and preserves accounts, submissions, and scores", async (t) => {
  const { dir, dbPath, db } = fixture(t)
  const result = prepare(dir, '\ufeffusername,name\r\n team01 ,"Example School, North"\r\nTEAM02,Second School\r\n\r\n')
  assert.equal(result.status, 0, result.stderr)
  const records = result.stdout.trim().split("\n").map((line) => line.split("\t").map((field) => Buffer.from(field, "base64").toString()))
  assert.equal(records.length, 2)
  assert.equal(records[0][0], "TEAM01")
  assert.equal(records[0][1], "Example School, North")
  assert.notEqual(records[0][2], records[1][2])
  for (const record of records) assert.match(record[2], /^[A-HJ-NP-Z2-9]{20}$/)
  assert.equal(statSync(path.join(dir, "credentials.csv")).mode & 0o777, 0o600)
  const imported = runImport(dbPath, result.stdout)
  assert.equal(imported.status, 0, imported.stderr)
  for (const [code, name, password] of records) {
    const school = db.prepare("SELECT * FROM schools WHERE school_code = ?").get(code)
    assert.equal(school.name, name)
    assert.equal(school.session_version, 0)
    assert.equal(await argon2.verify(school.password_hash, password), true)
    assert.ok(!imported.stdout.includes(password))
  }
  assert.equal(db.prepare("SELECT password_hash FROM schools WHERE id = 'existing'").get().password_hash, "unchanged")
  assert.equal(db.prepare("SELECT count(*) AS n FROM submissions").get().n, 1)
  assert.equal(db.prepare("SELECT message FROM scorecards").get().message, 500)
  assert.equal(db.prepare("SELECT action FROM audit_logs").get().action, "schools_added")
  // Retry rejects the whole batch, even if it contains another new username.
  const collision = runImport(dbPath, result.stdout + ["NEW01", "New School", "A".repeat(20)].map((field) => Buffer.from(field).toString("base64")).join("\t") + "\n")
  assert.notEqual(collision.status, 0)
  assert.match(collision.stderr, /Usernames already exist/)
  assert.equal(db.prepare("SELECT count(*) AS n FROM schools").get().n, 3)
  assert.equal(db.prepare("SELECT count(*) AS n FROM audit_logs").get().n, 1)
})

test("CSV validation rejects malformed input without generating credentials", (t) => {
  for (const csv of ["name,username\nOne,team01\nTwo,TEAM01\n", "name,username\nName,bad id\n", "name,username\n,TEAM01\n", "name,username\n", "name,username\nName,TEAM01,extra\n", 'name,username\n"Broken,TEAM01\n', "school,username\nName,TEAM01\n", "name,username\nLine\u0000Name,TEAM01\n"]) {
    const dir = mkdtempSync(path.join(tmpdir(), "school-csv-test-"))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const result = prepare(dir, csv)
    assert.notEqual(result.status, 0)
    assert.equal(result.stdout, "")
    assert.equal(existsSync(path.join(dir, "credentials.csv")), false)
  }
})

test("missing database is never created; failed audit rolls back all inserted schools", (t) => {
  const { dir, db, dbPath } = fixture(t)
  const absent = path.join(dir, "missing.db")
  assert.notEqual(runImport(absent, "", true).status, 0)
  assert.equal(existsSync(absent), false)
  assert.equal(runImport(dbPath, "", true).status, 0)
  const result = prepare(dir, "name,username\nNew School,NEW01\n")
  assert.equal(result.status, 0, result.stderr)
  db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'test audit failure'); END")
  assert.notEqual(runImport(dbPath, result.stdout).status, 0)
  assert.equal(db.prepare("SELECT count(*) AS n FROM schools").get().n, 1)
  assert.equal(db.prepare("SELECT count(*) AS n FROM audit_logs").get().n, 0)
})

function uploadFixture(t, overrides = {}) {
  const fixtureData = fixture(t)
  const { dir, dbPath } = fixtureData
  const bin = path.join(dir, "bin")
  mkdirSync(bin)
  writeFileSync(path.join(bin, "gum"), '#!/bin/sh\nif [ "$1" = confirm ]; then [ "$MOCK_CANCEL" != 1 ]; else exit 0; fi\n', { mode: 0o700 })
  writeFileSync(path.join(bin, "ssh"), `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const { readFileSync, existsSync, readdirSync } = require("node:fs");
const command = process.argv.at(-1);
const check = command.includes("SCHOOL_IMPORT_CHECK=1");
const input = check ? "" : readFileSync(0, "utf8");
if (!check) {
  const bundle = readdirSync(process.env.SCHOOL_CARDS_DIR)[0];
  if (!existsSync(process.env.SCHOOL_CARDS_DIR + "/" + bundle + "/cards.pdf")) process.exit(99);
  for (const line of input.trim().split("\\n")) {
    const password = Buffer.from(line.split("\\t")[2], "base64").toString();
    if (command.includes(password)) process.exit(98);
  }
}
const result = spawnSync(process.execPath, [${JSON.stringify(importer)}], {
  input, encoding: "utf8", env: { ...process.env, SCHOOL_IMPORT_DATABASE_PATH: process.env.MOCK_DB, SCHOOL_IMPORT_CHECK: check ? "1" : "0" }
});
process.stdout.write(result.stdout); process.stderr.write(result.stderr);
process.exit(!check && process.env.MOCK_LOST_CONNECTION === "1" ? 255 : result.status);
`, { mode: 0o700 })
  const input = path.join(dir, "schools.csv")
  const key = path.join(dir, "key")
  const cards = path.join(dir, "cards")
  writeFileSync(input, "name,username\nExample School,NEW01\n")
  writeFileSync(key, "mock")
  const result = spawnSync("zsh", [path.join(root, "deploy/upload-schools.sh"), "schools.csv"], {
    cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SSH_KEY: key, PYTHON_BIN: python, SCHOOL_CARDS_DIR: cards, MOCK_DB: dbPath, ...overrides },
  })
  return { ...fixtureData, cards, result }
}

test("upload creates matching cards and CSV before committing and clears transport file", (t) => {
  const { db, cards, result } = uploadFixture(t)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(db.prepare("SELECT count(*) AS n FROM schools").get().n, 2)
  const bundle = path.join(cards, readdirSync(cards)[0])
  assert.deepEqual(readdirSync(bundle).sort(), ["cards.pdf", "credentials.csv"])
  assert.equal(statSync(bundle).mode & 0o777, 0o700)
  assert.match(readFileSync(path.join(bundle, "cards.pdf"), "utf8"), /^%PDF/)
})

test("upload cancellation cleans credentials and changes no schools", (t) => {
  const { db, cards, result } = uploadFixture(t, { MOCK_CANCEL: "1" })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(db.prepare("SELECT count(*) AS n FROM schools").get().n, 1)
  assert.deepEqual(readdirSync(cards), [])
})

test("connection failure after commit retains credentials for recovery", (t) => {
  const { db, cards, result } = uploadFixture(t, { MOCK_LOST_CONNECTION: "1" })
  assert.notEqual(result.status, 0)
  assert.equal(db.prepare("SELECT count(*) AS n FROM schools").get().n, 2)
  const bundle = path.join(cards, readdirSync(cards)[0])
  assert.deepEqual(readdirSync(bundle).sort(), ["cards.pdf", "credentials.csv"])
})
