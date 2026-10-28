CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'weekly' NOT NULL,
	`week_start` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_week_idx` ON `reviews` (`kind`,`week_start`);--> statement-breakpoint
CREATE TABLE `weekly_metrics` (
	`week_start` text PRIMARY KEY NOT NULL,
	`points_done` integer DEFAULT 0 NOT NULL,
	`points_planned` integer DEFAULT 0 NOT NULL,
	`blocks_kept` integer DEFAULT 0 NOT NULL,
	`blocks_planned` integer DEFAULT 0 NOT NULL,
	`rituals_done` integer DEFAULT 0 NOT NULL,
	`sport_done` integer DEFAULT 0 NOT NULL,
	`sport_planned` integer DEFAULT 0 NOT NULL,
	`computed_at` text NOT NULL
);
