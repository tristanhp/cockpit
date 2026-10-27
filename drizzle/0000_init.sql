CREATE TABLE `block_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`block_id` text NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`reason` text
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`task_id` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`origin` text NOT NULL,
	`estimate_min` integer,
	`effort` integer,
	`task_type` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `blocks_start_idx` ON `blocks` (`start`);--> statement-breakpoint
CREATE TABLE `change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`label` text NOT NULL,
	`field` text NOT NULL,
	`before` text,
	`after` text,
	`source` text NOT NULL,
	`response` text,
	`undone` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `change_log_at_idx` ON `change_log` (`at`);--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`label` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`external_ref` text NOT NULL,
	`name` text NOT NULL,
	`detail` text,
	`dismissed` integer DEFAULT false NOT NULL,
	`found_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text,
	`title` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`day` text NOT NULL,
	`is_exam` integer DEFAULT false NOT NULL,
	`description` text,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_day_idx` ON `events` (`day`);--> statement-breakpoint
CREATE TABLE `inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`due_date` text,
	`due_time` text,
	`suggested_source_id` text,
	`suggested_project_id` text,
	`note` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `levels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`weekly_rule` text,
	`max_projects` integer,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `levels_name_unique` ON `levels` (`name`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text,
	`name` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`type` text,
	`approximate` integer DEFAULT false NOT NULL,
	`notes` text,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications_sent` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`sent_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pillars` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pillars_name_unique` ON `pillars` (`name`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`external_id` text,
	`url` text,
	`name` text NOT NULL,
	`pillar_id` text,
	`level_id` text,
	`meteo` text,
	`next_action` text,
	`next_due` text,
	`notes` text,
	`priority` integer,
	`status` text DEFAULT 'actif' NOT NULL,
	`protected` integer DEFAULT false NOT NULL,
	`priority_manual` integer DEFAULT false NOT NULL,
	`remote_updated_at` text,
	`synced_at` text
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`label` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `routing_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`pattern` text NOT NULL,
	`source_id` text NOT NULL,
	`project_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`external_ref` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_sync_at` text,
	`last_sync_error` text,
	`last_sync_count` integer
);
--> statement-breakpoint
CREATE TABLE `task_overrides` (
	`task_id` text PRIMARY KEY NOT NULL,
	`priority` integer,
	`effort` integer,
	`hidden` integer DEFAULT false NOT NULL,
	`mine` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`minutes_per_point` integer,
	`samples` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`identifier` text,
	`url` text,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`status_raw` text,
	`due_date` text,
	`project_id` text,
	`assigned_to_me` integer,
	`assignee_name` text,
	`priority` integer,
	`priority_auto` integer DEFAULT false NOT NULL,
	`effort` integer,
	`task_type` text,
	`remote_updated_at` text,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_source_idx` ON `tasks` (`source_id`);