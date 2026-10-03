CREATE TABLE IF NOT EXISTS `private_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `private_notes_author_project` ON `private_notes` (`project_id`,`author_id`,`updated_at`);