CREATE TABLE `awards` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `awards_season_kind_idx` ON `awards` (`season_id`,`kind`);--> statement-breakpoint
CREATE TABLE `goal_snapshots` (
	`goal_id` text NOT NULL,
	`week_start` text NOT NULL,
	`pct` integer NOT NULL,
	PRIMARY KEY(`goal_id`, `week_start`)
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`day` text PRIMARY KEY NOT NULL,
	`season_id` text,
	`planned_points` integer NOT NULL,
	`done_points` integer NOT NULL,
	`blocks_planned` integer NOT NULL,
	`blocks_kept` integer NOT NULL,
	`rituals_planned` integer NOT NULL,
	`rituals_done` integer NOT NULL,
	`mandatory_missed` integer NOT NULL,
	`goals_for` integer NOT NULL,
	`goals_against` integer NOT NULL,
	`ratio` real NOT NULL,
	`result` text NOT NULL,
	`points` integer NOT NULL,
	`cup` integer DEFAULT false NOT NULL,
	`cup_title` text,
	`computed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `matches_season_idx` ON `matches` (`season_id`);--> statement-breakpoint
CREATE TABLE `ratings` (
	`pillar_id` text NOT NULL,
	`week_start` text NOT NULL,
	`rating` integer NOT NULL,
	PRIMARY KEY(`pillar_id`, `week_start`)
);
--> statement-breakpoint
CREATE TABLE `season_table` (
	`season_id` text PRIMARY KEY NOT NULL,
	`played` integer DEFAULT 0 NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`draws` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`goals_for` integer DEFAULT 0 NOT NULL,
	`goals_against` integer DEFAULT 0 NOT NULL
);
