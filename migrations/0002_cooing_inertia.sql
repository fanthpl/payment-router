PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payment_routes` (
	`external_id` text PRIMARY KEY NOT NULL,
	`webhook_url` text NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_payment_routes`("external_id", "webhook_url", "expires_at", "created_at") SELECT "external_id", "webhook_url", "expires_at", "created_at" FROM `payment_routes`;--> statement-breakpoint
DROP TABLE `payment_routes`;--> statement-breakpoint
ALTER TABLE `__new_payment_routes` RENAME TO `payment_routes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `payment_routes_created_at_idx` ON `payment_routes` (`created_at`);