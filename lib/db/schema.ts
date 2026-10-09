import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" })

export const schools = sqliteTable(
  "schools",
  {
    id: text("id").primaryKey(),
    schoolCode: text("school_code").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    sessionVersion: integer("session_version").notNull().default(0),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [uniqueIndex("schools_school_code_unique").on(table.schoolCode)],
)

export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    thumbPath: text("thumb_path").notNull(),
    originalName: text("original_name").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sha256: text("sha256").notNull(),
    submittedAt: timestamp("submitted_at").notNull(),
    status: text("status", { enum: ["submitted", "approved", "flagged"] })
      .notNull()
      .default("submitted"),
  },
  (table) => [uniqueIndex("submissions_school_id_unique").on(table.schoolId)],
)

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  promptImagePath: text("prompt_image_path"),
  submissionsOpenAt: timestamp("submissions_open_at"),
  submissionsCloseAt: timestamp("submissions_close_at"),
  maxFileSizeMB: integer("max_file_size_mb").notNull().default(50),
  adminSessionVersion: integer("admin_session_version").notNull().default(0),
})

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  ip: text("ip"),
  at: timestamp("at").notNull(),
})

export const fileCleanupJobs = sqliteTable("file_cleanup_jobs", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
  createdAt: timestamp("created_at").notNull(),
})
