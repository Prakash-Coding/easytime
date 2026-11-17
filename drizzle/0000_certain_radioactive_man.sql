CREATE TABLE `easytime_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`trial_end` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `easytime_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `easytime_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_easytime_backups_owner_created` ON `easytime_backups` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `easytime_billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `easytime_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_easytime_sessions_owner` ON `easytime_sessions` (`owner`);--> statement-breakpoint
CREATE TABLE `easytime_states` (
	`owner` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `easytime_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `easytime_subscriptions` (
	`owner` text PRIMARY KEY NOT NULL,
	`customer` text,
	`subscription` text,
	`status` text DEFAULT 'free' NOT NULL,
	`period_end` integer DEFAULT 0 NOT NULL,
	`cancel_at_end` integer DEFAULT 0 NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `easytime_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `easytime_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `easytime_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_easytime_tickets_owner_created` ON `easytime_tickets` (`owner`,`created_at`);