ALTER TABLE `schools` ADD `session_version` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD `admin_session_version` integer DEFAULT 0 NOT NULL;
