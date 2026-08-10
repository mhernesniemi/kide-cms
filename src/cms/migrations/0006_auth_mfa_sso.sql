CREATE TABLE `cms_two_factors` (
	`_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`secret` text NOT NULL,
	`backup_codes` text NOT NULL,
	`verified` integer DEFAULT true NOT NULL,
	`failed_verification_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer
);
--> statement-breakpoint
CREATE INDEX `two_factors_user_idx` ON `cms_two_factors` (`user_id`);--> statement-breakpoint
ALTER TABLE `cms_users` ADD `two_factor_enabled` integer DEFAULT false;