CREATE TABLE `goal_exemptions` (
	`project_id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goal_links` (
	`goal_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text NOT NULL,
	PRIMARY KEY(`goal_id`, `kind`, `ref_id`)
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`horizon` text NOT NULL,
	`year_id` text,
	`season_id` text,
	`parent_goal_id` text,
	`pillar_id` text,
	`measure` text NOT NULL,
	`target` real,
	`current` real,
	`unit` text,
	`status` text DEFAULT 'active' NOT NULL,
	`due_date` text,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `goals_season_idx` ON `goals` (`season_id`);--> statement-breakpoint
CREATE TABLE `vision` (
	`id` text PRIMARY KEY NOT NULL,
	`identity` text DEFAULT '[]' NOT NULL,
	`horizon` text DEFAULT '' NOT NULL,
	`rules` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `years` (
	`id` text PRIMARY KEY NOT NULL,
	`theme` text NOT NULL,
	`motto` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL
);
