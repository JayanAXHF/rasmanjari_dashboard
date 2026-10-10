ALTER TABLE `settings` ADD `judge_password_hash` text;
--> statement-breakpoint
ALTER TABLE `settings` ADD `judge_session_version` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `scorecards` (
  `submission_id` text PRIMARY KEY NOT NULL REFERENCES `submissions` (`id`) ON DELETE CASCADE,
  `message` integer CHECK (`message` IS NULL OR (typeof(`message`) = 'integer' AND `message` BETWEEN 0 AND 500)),
  `originality` integer CHECK (`originality` IS NULL OR (typeof(`originality`) = 'integer' AND `originality` BETWEEN 0 AND 500)),
  `visual_appeal` integer CHECK (`visual_appeal` IS NULL OR (typeof(`visual_appeal`) = 'integer' AND `visual_appeal` BETWEEN 0 AND 500)),
  `creativity` integer CHECK (`creativity` IS NULL OR (typeof(`creativity`) = 'integer' AND `creativity` BETWEEN 0 AND 500)),
  `updated_at` integer NOT NULL
);
