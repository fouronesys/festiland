import { randomUUID } from "node:crypto";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(randomUUID);
const money = (name: string) => real(name);
const quantity = (name: string) => real(name);
const bool = (name: string) => integer(name, { mode: "boolean" });
const time = (name: string) => integer(name, { mode: "timestamp_ms" });
const created = () => time("created_at").notNull().$defaultFn(() => new Date());

export const teamMembersTable = sqliteTable("festiland_team_members", {
  id: text("id").primaryKey(), email: text("email").notNull(), name: text("name").notNull(),
  role: text("role").notNull().default("cashier"), active: bool("active").notNull().default(true),
  createdAt: created(),
});
export const localCredentialsTable = sqliteTable("festiland_local_credentials", {
  userId: text("user_id").primaryKey().references(() => teamMembersTable.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(), passwordHash: text("password_hash").notNull(),
  mustChangePassword: bool("must_change_password").notNull().default(true),
  updatedAt: time("updated_at").notNull().$defaultFn(() => new Date()),
});
export const localSessionsTable = sqliteTable("festiland_local_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => localCredentialsTable.userId, { onDelete: "cascade" }),
  createdAt: created(), lastSeenAt: time("last_seen_at").notNull().$defaultFn(() => new Date()),
  expiresAt: time("expires_at").notNull(),
}, table => [index("festiland_sessions_user").on(table.userId)]);
export const loginAttemptsTable = sqliteTable("festiland_login_attempts", {
  key: text("key").primaryKey(), attempts: integer("attempts").notNull().default(0), resetAt: time("reset_at").notNull(),
});
export const authBootstrapTable = sqliteTable("festiland_auth_bootstrap", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), createdAt: created(),
});
export const taxRatesTable = sqliteTable("festiland_tax_rates", {
  id: id(), name: text("name").notNull(), rate: real("rate").notNull(),
  inclusive: bool("inclusive").notNull().default(false), active: bool("active").notNull().default(true), createdAt: created(),
});
export const productsTable = sqliteTable("festiland_products", {
  id: id(), name: text("name").notNull(), sku: text("sku"), barcode: text("barcode"),
  category: text("category").notNull().default("General"),
  price: money("price").notNull().default(0), cost: real("cost").notNull().default(0),
  stock: quantity("stock").notNull().default(0), minStock: quantity("min_stock").notNull().default(0),
  unit: text("unit").notNull().default("unidad"), productType: text("product_type").notNull().default("product"),
  taxRateId: text("tax_rate_id"), active: bool("active").notNull().default(true),
  createdAt: created(), updatedAt: time("updated_at").notNull().$defaultFn(() => new Date()),
}, table => [
  uniqueIndex("festiland_products_sku_unique").on(table.sku),
  uniqueIndex("festiland_products_barcode_unique").on(table.barcode), index("festiland_products_name_idx").on(table.name),
]);
export const contactsTable = sqliteTable("festiland_contacts", {
  id: id(), kind: text("kind").notNull(), name: text("name").notNull(),
  email: text("email"), phone: text("phone"), taxId: text("tax_id"), address: text("address"), notes: text("notes"),
  openingBalance: money("opening_balance").notNull().default(0), createdAt: created(),
}, table => [index("festiland_contacts_kind_name_idx").on(table.kind, table.name)]);
export const salesTable = sqliteTable("festiland_sales", {
  id: id(), receiptNumber: text("receipt_number").notNull(), customerId: text("customer_id"), customerName: text("customer_name"),
  status: text("status").notNull().default("completed"), subtotal: money("subtotal").notNull(),
  discountAmount: money("discount_amount").notNull().default(0), taxAmount: money("tax_amount").notNull().default(0),
  total: money("total").notNull(), paymentSummary: text("payment_summary").notNull(), note: text("note"),
  createdBy: text("created_by").notNull(), createdAt: created(),
}, table => [uniqueIndex("festiland_sales_receipt_unique").on(table.receiptNumber), index("festiland_sales_created_idx").on(table.createdAt)]);
export const saleLinesTable = sqliteTable("festiland_sale_lines", {
  id: id(), saleId: text("sale_id").notNull(), productId: text("product_id").notNull(), name: text("name").notNull(),
  quantity: quantity("quantity").notNull(), unitPrice: money("unit_price").notNull(),
  unitCost: real("unit_cost").notNull(), lineTotal: money("line_total").notNull(), taxAmount: money("tax_amount").notNull().default(0),
});
export const salePaymentsTable = sqliteTable("festiland_sale_payments", {
  id: id(), saleId: text("sale_id").notNull(), method: text("method").notNull(), amount: money("amount").notNull(), createdAt: created(),
});
export const inventoryAdjustmentsTable = sqliteTable("festiland_inventory_adjustments", {
  id: id(), productId: text("product_id").notNull(), quantityChange: quantity("quantity_change").notNull(),
  reason: text("reason").notNull(), note: text("note"), createdBy: text("created_by").notNull(), createdAt: created(),
}, table => [index("festiland_inventory_created_idx").on(table.createdAt)]);
export const accountsTable = sqliteTable("festiland_accounts", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), type: text("type").notNull(),
  active: bool("active").notNull().default(true), systemKey: text("system_key"),
}, table => [uniqueIndex("festiland_accounts_code_unique").on(table.code)]);
export const journalEntriesTable = sqliteTable("festiland_journal_entries", {
  id: id(), entryDate: text("entry_date").notNull(), description: text("description").notNull(),
  source: text("source").notNull().default("manual"), sourceId: text("source_id"), createdBy: text("created_by").notNull(), createdAt: created(),
}, table => [index("festiland_journal_date_idx").on(table.entryDate)]);
export const journalLinesTable = sqliteTable("festiland_journal_lines", {
  id: id(), entryId: text("entry_id").notNull(), accountId: text("account_id").notNull(),
  debit: money("debit").notNull().default(0), credit: money("credit").notNull().default(0), memo: text("memo"),
});
export const expensesTable = sqliteTable("festiland_expenses", {
  id: id(), description: text("description").notNull(), accountId: text("account_id").notNull(), amount: money("amount").notNull(),
  paymentMethod: text("payment_method").notNull(), supplierId: text("supplier_id"), dueDate: text("due_date"), note: text("note"),
  createdBy: text("created_by").notNull(), createdAt: created(),
}, table => [index("festiland_expenses_created_idx").on(table.createdAt)]);
export const purchasesTable = sqliteTable("festiland_purchases", {
  id: id(), supplierId: text("supplier_id").notNull(), supplierName: text("supplier_name").notNull(),
  total: money("total").notNull(), paymentMethod: text("payment_method").notNull(), dueDate: text("due_date"), note: text("note"),
  createdBy: text("created_by").notNull(), createdAt: created(),
}, table => [index("festiland_purchases_created_idx").on(table.createdAt)]);
export const purchaseLinesTable = sqliteTable("festiland_purchase_lines", {
  id: id(), purchaseId: text("purchase_id").notNull(), productId: text("product_id").notNull(), name: text("name").notNull(),
  quantity: quantity("quantity").notNull(), unitCost: money("unit_cost").notNull(), lineTotal: money("line_total").notNull(),
});
export const settlementsTable = sqliteTable("festiland_settlements", {
  id: id(), direction: text("direction").notNull(), contactId: text("contact_id").notNull(),
  amount: money("amount").notNull(), paymentMethod: text("payment_method").notNull(), note: text("note"),
  createdBy: text("created_by").notNull(), createdAt: created(),
});
export const storeSettingsTable = sqliteTable("festiland_store_settings", {
  id: text("id").primaryKey().default("main"), name: text("name").notNull().default("Festiland"),
  taxId: text("tax_id"), address: text("address"), phone: text("phone"),
  receiptFooter: text("receipt_footer").notNull().default("Gracias por celebrar con Festiland"),
  receiptPaper: text("receipt_paper").notNull().default("80mm"), lockedThrough: text("locked_through"),
  accountingPeriodStart: text("accounting_period_start"), accountingPeriodEnd: text("accounting_period_end"),
});
export const cashSessionsTable = sqliteTable("festiland_cash_sessions", {
  id: id(), userId: text("user_id").notNull(), openedAt: time("opened_at").notNull().$defaultFn(() => new Date()),
  closedAt: time("closed_at"), openingAmount: money("opening_amount").notNull(), expectedAmount: money("expected_amount"),
  countedAmount: money("counted_amount"), difference: money("difference"), note: text("note"),
}, table => [uniqueIndex("festiland_one_open_cash_session").on(table.userId).where(sql`${table.closedAt} IS NULL`)]);
export const auditLogTable = sqliteTable("festiland_audit_log", {
  id: id(), actorId: text("actor_id").notNull(), action: text("action").notNull(), entity: text("entity").notNull(),
  entityId: text("entity_id"), details: text("details"), createdAt: created(),
}, table => [index("festiland_audit_created_idx").on(table.createdAt)]);
export const smtpSettingsTable = sqliteTable("festiland_smtp_settings", {
  id: text("id").primaryKey().default("main"), host: text("host").notNull().default("smtppro.zoho.com"),
  port: integer("port").notNull().default(465), fromName: text("from_name").notNull().default("Festiland"),
  enabled: bool("enabled").notNull().default(true),
});
