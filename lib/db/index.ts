import path from "node:path"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"

import * as schema from "./schema"

export const databasePath = process.env.DATABASE_PATH
if (!databasePath) throw new Error("DATABASE_PATH must be set")

export const dataDirectory = path.dirname(databasePath)

const sqlite = new Database(databasePath)
sqlite.pragma("foreign_keys = ON")
sqlite.pragma("journal_mode = WAL")

export const db = drizzle({ client: sqlite, schema })
