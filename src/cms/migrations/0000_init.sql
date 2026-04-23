CREATE TABLE `cms_asset_folders` (
	`_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent` text,
	`_created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cms_assets` (
	`_id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`focal_x` real,
	`focal_y` real,
	`alt` text,
	`folder` text,
	`storage_path` text NOT NULL,
	`_created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cms_audit_log` (
	`_id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`actor_id` text,
	`actor_email` text,
	`actor_role` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_collection` text,
	`resource_id` text,
	`ip_address` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE INDEX `audit_timestamp_idx` ON `cms_audit_log` (`timestamp`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `cms_audit_log` (`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_resource_idx` ON `cms_audit_log` (`resource_type`,`resource_collection`,`resource_id`);--> statement-breakpoint
CREATE TABLE `cms_authors` (
	`_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`slug` text,
	`title` text,
	`avatar` text,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_authors_slug_unique` ON `cms_authors` (`slug`);--> statement-breakpoint
CREATE TABLE `cms_authors_translations` (
	`_id` text PRIMARY KEY NOT NULL,
	`_entity_id` text NOT NULL,
	`_language_code` text NOT NULL,
	`description` text,
	FOREIGN KEY (`_entity_id`) REFERENCES `cms_authors`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_authors_translations__entity_id__language_code_unique` ON `cms_authors_translations` (`_entity_id`,`_language_code`);--> statement-breakpoint
CREATE TABLE `cms_form_submissions` (
	`_id` text PRIMARY KEY NOT NULL,
	`label` text,
	`form` text NOT NULL,
	`status` text DEFAULT 'new',
	`data` text,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cms_forms` (
	`_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`submit_redirect` text,
	`success_message` text DEFAULT 'Thanks — we got your message.',
	`notification_email` text,
	`fields` text,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_forms_slug_unique` ON `cms_forms` (`slug`);--> statement-breakpoint
CREATE TABLE `cms_front_page` (
	`_id` text PRIMARY KEY NOT NULL,
	`seo_description` text,
	`blocks` text,
	`_status` text DEFAULT 'draft' NOT NULL,
	`_published_at` text,
	`_publish_at` text,
	`_unpublish_at` text,
	`_published` text,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cms_front_page_translations` (
	`_id` text PRIMARY KEY NOT NULL,
	`_entity_id` text NOT NULL,
	`_language_code` text NOT NULL,
	`seo_description` text,
	`blocks` text,
	FOREIGN KEY (`_entity_id`) REFERENCES `cms_front_page`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_front_page_translations__entity_id__language_code_unique` ON `cms_front_page_translations` (`_entity_id`,`_language_code`);--> statement-breakpoint
CREATE TABLE `cms_invites` (
	`_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_invites_token_unique` ON `cms_invites` (`token`);--> statement-breakpoint
CREATE TABLE `cms_locks` (
	`_id` text PRIMARY KEY NOT NULL,
	`collection` text NOT NULL,
	`document_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text NOT NULL,
	`locked_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cms_menus` (
	`_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`items` text,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_menus_slug_unique` ON `cms_menus` (`slug`);--> statement-breakpoint
CREATE TABLE `cms_menus_translations` (
	`_id` text PRIMARY KEY NOT NULL,
	`_entity_id` text NOT NULL,
	`_language_code` text NOT NULL,
	`items` text,
	FOREIGN KEY (`_entity_id`) REFERENCES `cms_menus`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_menus_translations__entity_id__language_code_unique` ON `cms_menus_translations` (`_entity_id`,`_language_code`);--> statement-breakpoint
CREATE TABLE `cms_pages` (
	`_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`summary` text,
	`image` text,
	`related_posts` text,
	`seo_description` text,
	`blocks` text,
	`_status` text DEFAULT 'draft' NOT NULL,
	`_published_at` text,
	`_publish_at` text,
	`_unpublish_at` text,
	`_published` text,
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
	`seo_description` text,
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
	`title` text NOT NULL,
	`slug` text,
	`excerpt` text,
	`image` text,
	`body` text,
	`category` text,
	`author` text,
	`seo_description` text,
	`_status` text DEFAULT 'draft' NOT NULL,
	`_published_at` text,
	`_publish_at` text,
	`_unpublish_at` text,
	`_published` text,
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
	`seo_description` text,
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
--> statement-breakpoint
CREATE TABLE `cms_taxonomies` (
	`_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`terms` text,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_taxonomies_slug_unique` ON `cms_taxonomies` (`slug`);--> statement-breakpoint
CREATE TABLE `cms_taxonomies_translations` (
	`_id` text PRIMARY KEY NOT NULL,
	`_entity_id` text NOT NULL,
	`_language_code` text NOT NULL,
	`terms` text,
	FOREIGN KEY (`_entity_id`) REFERENCES `cms_taxonomies`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_taxonomies_translations__entity_id__language_code_unique` ON `cms_taxonomies_translations` (`_entity_id`,`_language_code`);--> statement-breakpoint
CREATE TABLE `cms_users` (
	`_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'editor',
	`password` text,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_users_email_unique` ON `cms_users` (`email`);