CREATE TABLE "festiland_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"system_key" text
);
--> statement-breakpoint
CREATE TABLE "festiland_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_auth_bootstrap" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"opening_amount" numeric(14, 2) NOT NULL,
	"expected_amount" numeric(14, 2),
	"counted_amount" numeric(14, 2),
	"difference" numeric(14, 2),
	"note" text
);
--> statement-breakpoint
CREATE TABLE "festiland_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"tax_id" text,
	"address" text,
	"notes" text,
	"opening_balance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"supplier_id" uuid,
	"due_date" text,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_inventory_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_change" numeric(14, 3) NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_date" text NOT NULL,
	"description" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(14, 2) DEFAULT 0 NOT NULL,
	"credit" numeric(14, 2) DEFAULT 0 NOT NULL,
	"memo" text
);
--> statement-breakpoint
CREATE TABLE "festiland_local_credentials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "festiland_local_credentials_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "festiland_local_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"barcode" text,
	"category" text DEFAULT 'General' NOT NULL,
	"price" numeric(14, 2) DEFAULT 0 NOT NULL,
	"cost" numeric(18, 6) DEFAULT 0 NOT NULL,
	"stock" numeric(14, 3) DEFAULT 0 NOT NULL,
	"min_stock" numeric(14, 3) DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'unidad' NOT NULL,
	"product_type" text DEFAULT 'product' NOT NULL,
	"tax_rate_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_purchase_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_name" text NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"due_date" text,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"unit_cost" numeric(18, 6) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_number" text NOT NULL,
	"customer_id" uuid,
	"customer_name" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"payment_summary" text NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" text NOT NULL,
	"contact_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_store_settings" (
	"id" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"name" text DEFAULT 'Festiland' NOT NULL,
	"tax_id" text,
	"address" text,
	"phone" text,
	"receipt_footer" text DEFAULT 'Gracias por celebrar con Festiland' NOT NULL,
	"receipt_paper" text DEFAULT '80mm' NOT NULL,
	"locked_through" text
);
--> statement-breakpoint
CREATE TABLE "festiland_tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rate" numeric(7, 4) NOT NULL,
	"inclusive" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festiland_team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'cashier' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "festiland_local_credentials" ADD CONSTRAINT "festiland_local_credentials_user_id_festiland_team_members_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."festiland_team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festiland_local_sessions" ADD CONSTRAINT "festiland_local_sessions_user_id_festiland_local_credentials_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."festiland_local_credentials"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "festiland_accounts_code_unique" ON "festiland_accounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "festiland_audit_created_idx" ON "festiland_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "festiland_one_open_cash_session" ON "festiland_cash_sessions" USING btree ("user_id") WHERE "festiland_cash_sessions"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "festiland_contacts_kind_name_idx" ON "festiland_contacts" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "festiland_expenses_created_idx" ON "festiland_expenses" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "festiland_inventory_created_idx" ON "festiland_inventory_adjustments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "festiland_journal_date_idx" ON "festiland_journal_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "festiland_sessions_user" ON "festiland_local_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "festiland_products_sku_unique" ON "festiland_products" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "festiland_products_barcode_unique" ON "festiland_products" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "festiland_products_name_idx" ON "festiland_products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "festiland_purchases_created_idx" ON "festiland_purchases" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "festiland_sales_receipt_unique" ON "festiland_sales" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "festiland_sales_created_idx" ON "festiland_sales" USING btree ("created_at");