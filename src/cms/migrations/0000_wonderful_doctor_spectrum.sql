CREATE TABLE `cms_assets` (
	`_id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`alt` text,
	`storage_path` text NOT NULL,
	`_created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cms_authors` (
	`_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`role` text NOT NULL,
	`avatar` text,
	`bio` text,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_authors_slug_unique` ON `cms_authors` (`slug`);--> statement-breakpoint
CREATE TABLE `cms_authors_translations` (
	`_id` text PRIMARY KEY NOT NULL,
	`_entity_id` text NOT NULL,
	`_language_code` text NOT NULL,
	`bio` text,
	FOREIGN KEY (`_entity_id`) REFERENCES `cms_authors`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_authors_translations__entity_id__language_code_unique` ON `cms_authors_translations` (`_entity_id`,`_language_code`);--> statement-breakpoint
CREATE TABLE `cms_pages` (
	`_id` text PRIMARY KEY NOT NULL,
	`layout` text DEFAULT 'landing',
	`hero_image` text,
	`title` text NOT NULL,
	`slug` text,
	`summary` text,
	`blocks` text,
	`_status` text DEFAULT 'draft' NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_pages_slug_unique` ON `cms_pages` (`slug`);--> statement-breakpoint
CREATE TABLE `cms_pages_translations` (
	`_id` text PRIMARY KEY NOT NULL,
	`_entity_id` text NOT NULL,
	`_language_code` text NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`summary` text,
	`blocks` text,
	FOREIGN KEY (`_entity_id`) REFERENCES `cms_pages`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_pages_translations_slug_unique` ON `cms_pages_translations` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `cms_pages_translations__entity_id__language_code_unique` ON `cms_pages_translations` (`_entity_id`,`_language_code`);--> statement-breakpoint
CREATE TABLE `cms_pages_versions` (
	`_id` text PRIMARY KEY NOT NULL,
	`_doc_id` text NOT NULL,
	`_version` integer NOT NULL,
	`_snapshot` text NOT NULL,
	`_created_at` text NOT NULL,
	FOREIGN KEY (`_doc_id`) REFERENCES `cms_pages`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cms_posts` (
	`_id` text PRIMARY KEY NOT NULL,
	`cover` text,
	`category` text DEFAULT 'Product',
	`author` text,
	`tags` text,
	`metadata` text,
	`sort_order` integer DEFAULT 0,
	`title` text NOT NULL,
	`slug` text,
	`excerpt` text,
	`body` text,
	`_status` text DEFAULT 'draft' NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_posts_slug_unique` ON `cms_posts` (`slug`);--> statement-breakpoint
CREATE TABLE `cms_posts_translations` (
	`_id` text PRIMARY KEY NOT NULL,
	`_entity_id` text NOT NULL,
	`_language_code` text NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`excerpt` text,
	`body` text,
	FOREIGN KEY (`_entity_id`) REFERENCES `cms_posts`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_posts_translations_slug_unique` ON `cms_posts_translations` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `cms_posts_translations__entity_id__language_code_unique` ON `cms_posts_translations` (`_entity_id`,`_language_code`);--> statement-breakpoint
CREATE TABLE `cms_posts_versions` (
	`_id` text PRIMARY KEY NOT NULL,
	`_doc_id` text NOT NULL,
	`_version` integer NOT NULL,
	`_snapshot` text NOT NULL,
	`_created_at` text NOT NULL,
	FOREIGN KEY (`_doc_id`) REFERENCES `cms_posts`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cms_sessions` (
	`_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL
);
