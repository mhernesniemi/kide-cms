CREATE TABLE `cms_outbox` (
	`_id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`dedupe_key` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outbox_due_idx` ON `cms_outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `outbox_dedupe_idx` ON `cms_outbox` (`dedupe_key`);--> statement-breakpoint
ALTER TABLE `cms_assets` ADD `hash` text;