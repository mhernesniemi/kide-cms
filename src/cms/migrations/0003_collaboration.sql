CREATE TABLE `cms_collaboration` (
	`collection` text NOT NULL,
	`document_id` text NOT NULL,
	`review_state` text NOT NULL,
	`editor` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`collection`, `document_id`)
);
--> statement-breakpoint
CREATE TABLE `cms_comments` (
	`_id` text PRIMARY KEY NOT NULL,
	`collection` text NOT NULL,
	`document_id` text NOT NULL,
	`field` text,
	`body` text NOT NULL,
	`author_id` text,
	`author_email` text,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_doc_idx` ON `cms_comments` (`collection`,`document_id`);--> statement-breakpoint
CREATE TABLE `cms_password_resets` (
	`_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_password_resets_token_unique` ON `cms_password_resets` (`token`);