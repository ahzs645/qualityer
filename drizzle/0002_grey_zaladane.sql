CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`revision` integer NOT NULL,
	`object_key` text NOT NULL,
	`checksum` text NOT NULL,
	`bytes` integer NOT NULL,
	`label` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `backups_project_revision` ON `backups` (`project_id`,`revision`);--> statement-breakpoint
CREATE TABLE `embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_id` text NOT NULL,
	`revision` integer NOT NULL,
	`model` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`vector` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `embeddings_scope` ON `embeddings` (`project_id`,`source_id`,`revision`,`model`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_id` text NOT NULL,
	`remote_id` text,
	`status` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`result_key` text,
	`error` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jobs_project` ON `jobs` (`project_id`,`created_at`);