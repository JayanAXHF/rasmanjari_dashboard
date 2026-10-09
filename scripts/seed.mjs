import crypto from "node:crypto"
import argon2 from "argon2"
import Database from "better-sqlite3"

const [schoolCode = "DEMO01", schoolName = "Demo School", password] = process.argv.slice(2)
const databasePath = process.env.DATABASE_PATH
if (!databasePath) throw new Error("DATABASE_PATH must be set")
const sqlite = new Database(databasePath)
const generatedPassword = password ?? crypto.randomBytes(12).toString("base64url")
const existing = sqlite.prepare("SELECT id FROM schools WHERE school_code = ?").get(schoolCode)

if (existing) {
  console.error(`School code ${schoolCode} already exists; no change made.`)
  process.exitCode = 1
} else {
  sqlite
    .prepare("INSERT INTO schools (id, school_code, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), schoolCode, schoolName, await argon2.hash(generatedPassword), Date.now())
  sqlite.prepare("INSERT OR IGNORE INTO settings (id, max_file_size_mb) VALUES (1, 50)").run()
  console.log(`Created ${schoolCode} (${schoolName})`)
  console.log(`Password: ${generatedPassword}`)
}

sqlite.close()
