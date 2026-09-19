CREATE TABLE `purchase_entitlements` (
	`purchase_id` text PRIMARY KEY NOT NULL,
	`checkout_session_id` text NOT NULL,
	`family_id` text NOT NULL,
	`cache_key` text NOT NULL,
	`request_json` text NOT NULL,
	`status` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`pdf_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_entitlements_checkout_session_id_unique` ON `purchase_entitlements` (`checkout_session_id`);