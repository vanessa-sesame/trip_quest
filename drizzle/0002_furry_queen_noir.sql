CREATE TABLE `family_workspaces` (
	`family_id` text PRIMARY KEY NOT NULL,
	`workspace_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
