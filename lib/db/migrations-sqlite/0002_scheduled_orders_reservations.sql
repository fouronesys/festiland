CREATE TABLE `festiland_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`line_number` integer NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`product_type` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_price` real NOT NULL,
	`unit_cost` real NOT NULL,
	`line_total` real NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `festiland_order_lines_order_idx` ON `festiland_order_lines` (`order_id`,`line_number`);--> statement-breakpoint
CREATE TABLE `festiland_order_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`method` text NOT NULL,
	`amount` real NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `festiland_order_payments_order_idx` ON `festiland_order_payments` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `festiland_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`customer_id` text,
	`customer_name` text,
	`pickup_date` text NOT NULL,
	`pickup_time` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`subtotal` real NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`total` real NOT NULL,
	`deposit_amount` real DEFAULT 0 NOT NULL,
	`deposit_refunded` integer DEFAULT false NOT NULL,
	`sale_id` text,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `festiland_orders_number_unique` ON `festiland_orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `festiland_orders_pickup_idx` ON `festiland_orders` (`pickup_date`,`status`);--> statement-breakpoint
CREATE INDEX `festiland_orders_customer_idx` ON `festiland_orders` (`customer_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `festiland_products` ADD `reserved_stock` real DEFAULT 0 NOT NULL;