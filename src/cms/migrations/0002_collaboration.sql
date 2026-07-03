CREATE TABLE `cms_collaboration` (
	`collection` text NOT NULL,
	`document_id` text NOT NULL,
	`review_state` text NOT NULL,
	`assignee` text,
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
	`resolved` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_doc_idx` ON `cms_comments` (`collection`,`document_id`);
