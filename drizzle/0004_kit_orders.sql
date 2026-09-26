ALTER TABLE `purchase_entitlements` ADD `product` text DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_entitlements` ADD `shipping_json` text;--> statement-breakpoint
ALTER TABLE `purchase_entitlements` ADD `fulfilment_status` text;