CREATE TABLE `cms_rate_limits` (
	`_id` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expiry_idx` ON `cms_rate_limits` (`expires_at`);--> statement-breakpoint
DELETE FROM `cms_sessions`;--> statement-breakpoint
DELETE FROM `cms_invites`;--> statement-breakpoint
DELETE FROM `cms_password_resets`;
