CREATE TABLE `cms_shared_sections` (
	`_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`block_type` text NOT NULL,
	`block` text NOT NULL,
	`_status` text DEFAULT 'draft' NOT NULL,
	`_published_at` text,
	`_publish_at` text,
	`_unpublish_at` text,
	`_published` text,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cms_shared_sections_versions` (
	`_id` text PRIMARY KEY NOT NULL,
	`_doc_id` text NOT NULL,
	`_version` integer NOT NULL,
	`_snapshot` text NOT NULL,
	`_created_at` text NOT NULL,
	FOREIGN KEY (`_doc_id`) REFERENCES `cms_shared_sections`(`_id`) ON UPDATE no action ON DELETE cascade
);
