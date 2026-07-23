CREATE TABLE `payment_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook_url` text NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_routes_created_at_idx` ON `payment_routes` (`created_at`);