// Executed over SSH from the current release, with credentials on stdin.
import crypto from "node:crypto"
import path from "node:path"
import argon2 from "argon2"
import Database from "better-sqlite3"

const databasePath = process.env.SCHOOL_IMPORT_DATABASE_PATH
if (!databasePath || !path.isAbsolute(databasePath)) {
  throw new Error("SCHOOL_IMPORT_DATABASE_PATH must be an absolute existing database path on the server.")
}
const checkOnly = process.env.SCHOOL_IMPORT_CHECK === "1"
const sqlite = new Database(databasePath, { readonly: checkOnly, fileMustExist: true })
sqlite.pragma("foreign_keys = ON")
sqlite.pragma("busy_timeout = 5000")
try {
  // Also check the columns needed by the import, before preparing credentials.
  sqlite.prepare("SELECT id, school_code, name, password_hash, created_at FROM schools LIMIT 0").all()
  sqlite.prepare("SELECT id, actor, action, target, at FROM audit_logs LIMIT 0").all()
  if (checkOnly) {
    console.log(`School import database verified: ${databasePath}`)
  } else {
    let input = ""
    process.stdin.setEncoding("utf8")
    for await (const chunk of process.stdin) input += chunk
    const decode = (value) => {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("Invalid base64 school input.")
      return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(value, "base64"))
    }
    const records = input.trimEnd().split("\n").filter(Boolean).map((line) => {
      const fields = line.split("\t")
      if (fields.length !== 3) throw new Error("Invalid school input.")
      const [schoolCode, name, password] = fields.map(decode)
      if (!/^[A-Z0-9_-]{2,32}$/.test(schoolCode) || !name.trim() || /\p{C}/u.test(name + password) || password.length < 12 || password.length > 256) {
        throw new Error("Invalid school credentials.")
      }
      return { schoolCode, name, password }
    })
    if (!records.length) throw new Error("At least one school is required.")
    if (new Set(records.map((record) => record.schoolCode)).size !== records.length) throw new Error("Duplicate usernames in import.")
    const findExisting = sqlite.prepare("SELECT school_code FROM schools WHERE upper(school_code) = ?")
    const checkConflicts = () => {
      const conflicts = records.filter((record) => findExisting.get(record.schoolCode))
      if (conflicts.length) throw new Error(`Usernames already exist: ${conflicts.map((record) => record.schoolCode).join(", ")}. No schools were added.`)
    }
    checkConflicts()
    const prepared = []
    // Bound Argon2 memory usage for large lists by hashing one password at a time.
    for (const { schoolCode, name, password } of records) {
      prepared.push({ id: crypto.randomUUID(), schoolCode, name, passwordHash: await argon2.hash(password) })
    }
    sqlite.transaction(() => {
      checkConflicts()
      const insert = sqlite.prepare("INSERT INTO schools (id, school_code, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      for (const school of prepared) insert.run(school.id, school.schoolCode, school.name, school.passwordHash, Date.now())
      sqlite.prepare("INSERT INTO audit_logs (id, actor, action, target, at) VALUES (?, ?, ?, ?, ?)")
        .run(crypto.randomUUID(), "deployment", "schools_added", `${prepared.length} schools`, Date.now())
    }).immediate()
    console.log(`Added ${prepared.length} school(s): ${prepared.map((school) => school.schoolCode).join(", ")}`)
  }
} finally {
  sqlite.close()
}
