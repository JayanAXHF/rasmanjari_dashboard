CREATE TABLE `schools` (
  `id` text PRIMARY KEY NOT NULL,
  `school_code` text NOT NULL,
  `name` text NOT NULL,
  `password_hash` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schools_school_code_unique` ON `schools` (`school_code`);
--> statement-breakpoint
CREATE TABLE `submissions` (
  `id` text PRIMARY KEY NOT NULL,
  `school_id` text NOT NULL REFERENCES `schools`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  `file_path` text NOT NULL,
  `thumb_path` text NOT NULL,
  `original_name` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `width` integer NOT NULL,
  `height` integer NOT NULL,
  `sha256` text NOT NULL,
  `submitted_at` integer NOT NULL,
  `status` text DEFAULT 'submitted' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_school_id_unique` ON `submissions` (`school_id`);
--> statement-breakpoint
CREATE TABLE `settings` (
  `id` integer PRIMARY KEY NOT NULL,
  `prompt_image_path` text,
  `submissions_open_at` integer,
  `submissions_close_at` integer,
  `max_file_size_mb` integer DEFAULT 50 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `actor` text NOT NULL,
  `action` text NOT NULL,
  `target` text NOT NULL,
  `ip` text,
  `at` integer NOT NULL
);
