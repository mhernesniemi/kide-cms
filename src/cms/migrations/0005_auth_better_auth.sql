CREATE TABLE `cms_accounts` (
	`_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_provider_account_idx` ON `cms_accounts` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `accounts_user_idx` ON `cms_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `cms_verifications` (
	`_id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verifications_identifier_idx` ON `cms_verifications` (`identifier`);--> statement-breakpoint
-- The legacy cms_sessions (bespoke opaque tokens) is reshaped to Better Auth's session
-- model. Sessions are disposable and migration 0004 already emptied the table, so we
-- drop-and-recreate rather than copy columns that never existed on the old shape.
DROP TABLE `cms_sessions`;--> statement-breakpoint
CREATE TABLE `cms_sessions` (
	`_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_sessions_token_unique` ON `cms_sessions` (`token`);--> statement-breakpoint
ALTER TABLE `cms_users` ADD `email_verified` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `cms_users` ADD `image` text;--> statement-breakpoint
ALTER TABLE `cms_users` ADD `created_at` integer;--> statement-breakpoint
ALTER TABLE `cms_users` ADD `updated_at` integer;