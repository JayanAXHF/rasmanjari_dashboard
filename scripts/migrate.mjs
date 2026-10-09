import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"

const databasePath = process.env.DATABASE_PATH
if (!databasePath) throw new Error("DATABASE_PATH must be set")
const migrationsFolder = path.resolve("drizzle")
const initialMigrationPath = path.join(migrationsFolder, "0000_initial.sql")

fs.mkdirSync(path.dirname(databasePath), { recursive: true })
const sqlite = new Database(databasePath)
sqlite.pragma("foreign_keys = ON")
const hasTable = (name) => Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))

// Existing installations predate Drizzle's migration journal. Mark their
// already-applied initial schema before handing future migrations to Drizzle.
if (hasTable("schools") && !hasTable("__drizzle_migrations")) {
  const sql = fs.readFileSync(initialMigrationPath, "utf8")
  const { entries } = JSON.parse(fs.readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8"))
  const initial = entries.find((entry) => entry.tag === "0000_initial")
  sqlite.exec('CREATE TABLE "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)')
  sqlite.prepare('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)').run(crypto.createHash("sha256").update(sql).digest("hex"), initial.when)
}
migrate(drizzle({ client: sqlite }), { migrationsFolder })
sqlite.close()

console.log(`Database ready: ${databasePath}`)
