CREATE TABLE `booklet_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`destination` text NOT NULL,
	`age` integer NOT NULL,
	`days` integer NOT NULL,
	`artifact_key` text NOT NULL,
	`pdf_key` text,
	`research_model` text NOT NULL,
	`composer_model` text NOT NULL,
	`cache_version` text NOT NULL,
	`generated_at` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `destination_research_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`destination` text NOT NULL,
	`research_json` text NOT NULL,
	`research_model` text NOT NULL,
	`cache_version` text NOT NULL,
	`generated_at` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generation_locks` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
