CREATE TABLE `festiland_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`system_key` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `festiland_accounts_code_unique` ON `festiland_accounts` (`code`);--> statement-breakpoint
CREATE TABLE `festiland_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`details` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `festiland_audit_created_idx` ON `festiland_audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `festiland_auth_bootstrap` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `festiland_cash_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`opening_amount` real NOT NULL,
	`expected_amount` real,
	`counted_amount` real,
	`difference` real,
	`note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `festiland_one_open_cash_session` ON `festiland_cash_sessions` (`user_id`) WHERE "festiland_cash_sessions"."closed_at" IS NULL;--> statement-breakpoint
CREATE TABLE `festiland_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`tax_id` text,
	`address` text,
	`notes` text,
	`opening_balance` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `festiland_contacts_kind_name_idx` ON `festiland_contacts` (`kind`,`name`);--> statement-breakpoint
CREATE TABLE `festiland_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`account_id` text NOT NULL,
	`amount` real NOT NULL,
	`payment_method` text NOT NULL,
	`supplier_id` text,
	`due_date` text,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `festiland_expenses_created_idx` ON `festiland_expenses` (`created_at`);--> statement-breakpoint
CREATE TABLE `festiland_inventory_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`quantity_change` real NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `festiland_inventory_created_idx` ON `festiland_inventory_adjustments` (`created_at`);--> statement-breakpoint
CREATE TABLE `festiland_journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_date` text NOT NULL,
	`description` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `festiland_journal_date_idx` ON `festiland_journal_entries` (`entry_date`);--> statement-breakpoint
CREATE TABLE `festiland_journal_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`account_id` text NOT NULL,
	`debit` real DEFAULT 0 NOT NULL,
	`credit` real DEFAULT 0 NOT NULL,
	`memo` text
);
--> statement-breakpoint
CREATE TABLE `festiland_local_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `festiland_team_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `festiland_local_credentials_email_unique` ON `festiland_local_credentials` (`email`);--> statement-breakpoint
CREATE TABLE `festiland_local_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `festiland_local_credentials`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `festiland_sessions_user` ON `festiland_local_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `festiland_login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `festiland_products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`barcode` text,
	`category` text DEFAULT 'General' NOT NULL,
	`price` real DEFAULT 0 NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`stock` real DEFAULT 0 NOT NULL,
	`min_stock` real DEFAULT 0 NOT NULL,
	`unit` text DEFAULT 'unidad' NOT NULL,
	`product_type` text DEFAULT 'product' NOT NULL,
	`tax_rate_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `festiland_products_sku_unique` ON `festiland_products` (`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `festiland_products_barcode_unique` ON `festiland_products` (`barcode`);--> statement-breakpoint
CREATE INDEX `festiland_products_name_idx` ON `festiland_products` (`name`);--> statement-breakpoint
CREATE TABLE `festiland_purchase_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_cost` real NOT NULL,
	`line_total` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `festiland_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`supplier_name` text NOT NULL,
	`total` real NOT NULL,
	`payment_method` text NOT NULL,
	`due_date` text,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `festiland_purchases_created_idx` ON `festiland_purchases` (`created_at`);--> statement-breakpoint
CREATE TABLE `festiland_sale_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_price` real NOT NULL,
	`unit_cost` real NOT NULL,
	`line_total` real NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `festiland_sale_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`method` text NOT NULL,
	`amount` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `festiland_sales` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_number` text NOT NULL,
	`customer_id` text,
	`customer_name` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`subtotal` real NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`total` real NOT NULL,
	`payment_summary` text NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `festiland_sales_receipt_unique` ON `festiland_sales` (`receipt_number`);--> statement-breakpoint
CREATE INDEX `festiland_sales_created_idx` ON `festiland_sales` (`created_at`);--> statement-breakpoint
CREATE TABLE `festiland_settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`direction` text NOT NULL,
	`contact_id` text NOT NULL,
	`amount` real NOT NULL,
	`payment_method` text NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `festiland_smtp_settings` (
	`id` text PRIMARY KEY DEFAULT 'main' NOT NULL,
	`host` text DEFAULT 'smtppro.zoho.com' NOT NULL,
	`port` integer DEFAULT 465 NOT NULL,
	`from_name` text DEFAULT 'Festiland' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `festiland_store_settings` (
	`id` text PRIMARY KEY DEFAULT 'main' NOT NULL,
	`name` text DEFAULT 'Festiland' NOT NULL,
	`tax_id` text,
	`address` text,
	`phone` text,
	`receipt_footer` text DEFAULT 'Gracias por celebrar con Festiland' NOT NULL,
	`receipt_paper` text DEFAULT '80mm' NOT NULL,
	`locked_through` text
);
--> statement-breakpoint
CREATE TABLE `festiland_tax_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rate` real NOT NULL,
	`inclusive` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `festiland_team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'cashier' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
