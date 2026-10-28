CREATE TABLE `day_plans` (
	`day` text PRIMARY KEY NOT NULL,
	`first_action_task_id` text,
	`top3` text DEFAULT '[]' NOT NULL,
	`closed_at` text,
	`snapshot` text,
	`started_at` text,
	`catch_up_at` text
);
--> statement-breakpoint
CREATE TABLE `habit_logs` (
	`habit_id` text NOT NULL,
	`day` text NOT NULL,
	`done` integer NOT NULL,
	PRIMARY KEY(`habit_id`, `day`)
);
--> statement-breakpoint
CREATE INDEX `habit_logs_day_idx` ON `habit_logs` (`day`);--> statement-breakpoint
CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target_pct` integer DEFAULT 80 NOT NULL,
	`protected` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
