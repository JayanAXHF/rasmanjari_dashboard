import { defineConfig } from "drizzle-kit"

const databasePath = process.env.DATABASE_PATH
if (!databasePath) throw new Error("DATABASE_PATH must be set")

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: databasePath,
  },
})
