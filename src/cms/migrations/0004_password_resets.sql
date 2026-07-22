CREATE TABLE `cms_password_resets` (
	`_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_password_resets_token_unique` ON `cms_password_resets` (`token`);
