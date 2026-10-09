CREATE TABLE `file_cleanup_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `path` text NOT NULL,
  `created_at` integer NOT NULL
);
