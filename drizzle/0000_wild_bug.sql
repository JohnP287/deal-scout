CREATE TABLE `observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`price_cents` integer,
	`currency` text,
	`availability` text,
	`condition` text,
	`confidence` integer,
	`error` text,
	`checked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_observations_product_checked` ON `observations` (`product_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`retailer` text NOT NULL,
	`url` text NOT NULL,
	`category` text DEFAULT 'Other' NOT NULL,
	`msrp_cents` integer NOT NULL,
	`expected_resale_cents` integer,
	`active` integer DEFAULT 1 NOT NULL,
	`last_checked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_url_unique` ON `products` (`url`);