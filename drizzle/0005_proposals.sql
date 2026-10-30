CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`rationale` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`proposed_by` text DEFAULT 'claude' NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text,
	`result` text
);
--> statement-breakpoint
CREATE INDEX `proposals_status_idx` ON `proposals` (`status`);--> statement-breakpoint
ALTER TABLE `change_log` ADD `via` text;