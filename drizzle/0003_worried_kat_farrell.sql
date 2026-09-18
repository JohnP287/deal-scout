CREATE TABLE `alert_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watch_id` integer NOT NULL,
	`product_id` integer,
	`event_type` text NOT NULL,
	`event_key` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`seen_at` text,
	FOREIGN KEY (`watch_id`) REFERENCES `watches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_events_event_key_unique` ON `alert_events` (`event_key`);--> statement-breakpoint
CREATE INDEX `idx_alerts_watch_created` ON `alert_events` (`watch_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `promo_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer,
	`retailer` text NOT NULL,
	`code` text NOT NULL,
	`status` text NOT NULL,
	`eligible_text` text,
	`discount_text` text,
	`minimum_purchase_cents` integer,
	`expires_at` text,
	`requirements` text,
	`stacks` integer,
	`source_url` text NOT NULL,
	`confidence` integer NOT NULL,
	`last_verified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_promos_retailer_status` ON `promo_codes` (`retailer`,`status`);--> statement-breakpoint
CREATE INDEX `idx_promos_product` ON `promo_codes` (`product_id`);--> statement-breakpoint
CREATE TABLE `provider_health` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_name` text NOT NULL,
	`status` text DEFAULT 'UNKNOWN' NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`successful_requests` integer DEFAULT 0 NOT NULL,
	`failed_requests` integer DEFAULT 0 NOT NULL,
	`response_ms_total` integer DEFAULT 0 NOT NULL,
	`products_discovered` integer DEFAULT 0 NOT NULL,
	`products_verified` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`next_retry_at` text,
	`last_error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_provider_health_status` ON `provider_health` (`status`,`next_retry_at`);--> statement-breakpoint
CREATE TABLE `watches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_value` text NOT NULL,
	`max_price_cents` integer,
	`min_discount_percent` integer,
	`retailer` text,
	`event_types` text DEFAULT 'RESTOCK,PRICE_DROP,THRESHOLD,PROMO_CODE' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_watches_client_active` ON `watches` (`client_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_watches_target` ON `watches` (`target_type`,`target_value`);--> statement-breakpoint
ALTER TABLE `observations` ADD `effective_price_cents` integer;--> statement-breakpoint
ALTER TABLE `observations` ADD `stock_status` text;--> statement-breakpoint
ALTER TABLE `observations` ADD `stock_evidence` text;--> statement-breakpoint
ALTER TABLE `observations` ADD `stock_confidence` integer;--> statement-breakpoint
ALTER TABLE `observations` ADD `seller` text;--> statement-breakpoint
ALTER TABLE `products` ADD `canonical_key` text;--> statement-breakpoint
ALTER TABLE `products` ADD `manufacturer` text;--> statement-breakpoint
ALTER TABLE `products` ADD `model` text;--> statement-breakpoint
ALTER TABLE `products` ADD `sku` text;--> statement-breakpoint
ALTER TABLE `products` ADD `gtin` text;--> statement-breakpoint
ALTER TABLE `products` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `products` ADD `msrp_source_url` text;--> statement-breakpoint
ALTER TABLE `products` ADD `resale_source_url` text;--> statement-breakpoint
ALTER TABLE `products` ADD `resale_verified_at` text;--> statement-breakpoint
CREATE INDEX `idx_products_canonical` ON `products` (`canonical_key`);--> statement-breakpoint
CREATE INDEX `idx_products_category_active` ON `products` (`category`,`active`);