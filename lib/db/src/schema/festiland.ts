import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const money = (name: string) =>
  numeric(name, { precision: 14, scale: 2, mode: "number" });
const quantity = (name: string) =>
  numeric(name, { precision: 14, scale: 3, mode: "number" });

export const teamMembersTable = pgTable("festiland_team_members", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("cashier"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const localCredentialsTable = pgTable("festiland_local_credentials", {
  userId: text("user_id").primaryKey().references(() => teamMembersTable.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const localSessionsTable = pgTable("festiland_local_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => localCredentialsTable.userId, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [index("festiland_sessions_user").on(table.userId)]);

export const loginAttemptsTable = pgTable("festiland_login_attempts", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export const authBootstrapTable = pgTable("festiland_auth_bootstrap", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxRatesTable = pgTable("festiland_tax_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  rate: numeric("rate", { precision: 7, scale: 4, mode: "number" }).notNull(),
  inclusive: boolean("inclusive").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productsTable = pgTable(
  "festiland_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sku: text("sku"),
    barcode: text("barcode"),
    category: text("category").notNull().default("General"),
    price: money("price").notNull().default(0),
    cost: numeric("cost", { precision: 18, scale: 6, mode: "number" }).notNull().default(0),
    stock: quantity("stock").notNull().default(0),
    minStock: quantity("min_stock").notNull().default(0),
    unit: text("unit").notNull().default("unidad"),
    productType: text("product_type").notNull().default("product"),
    taxRateId: uuid("tax_rate_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("festiland_products_sku_unique").on(table.sku),
    uniqueIndex("festiland_products_barcode_unique").on(table.barcode),
    index("festiland_products_name_idx").on(table.name),
  ],
);

export const contactsTable = pgTable(
  "festiland_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    taxId: text("tax_id"),
    address: text("address"),
    notes: text("notes"),
    openingBalance: money("opening_balance").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("festiland_contacts_kind_name_idx").on(table.kind, table.name)],
);

export const salesTable = pgTable(
  "festiland_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptNumber: text("receipt_number").notNull(),
    customerId: uuid("customer_id"),
    customerName: text("customer_name"),
    status: text("status").notNull().default("completed"),
    subtotal: money("subtotal").notNull(),
    discountAmount: money("discount_amount").notNull().default(0),
    taxAmount: money("tax_amount").notNull().default(0),
    total: money("total").notNull(),
    paymentSummary: text("payment_summary").notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("festiland_sales_receipt_unique").on(table.receiptNumber),
    index("festiland_sales_created_idx").on(table.createdAt),
  ],
);

export const saleLinesTable = pgTable("festiland_sale_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id").notNull(),
  productId: uuid("product_id").notNull(),
  name: text("name").notNull(),
  quantity: quantity("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  unitCost: numeric("unit_cost", { precision: 18, scale: 6, mode: "number" }).notNull(),
  lineTotal: money("line_total").notNull(),
  taxAmount: money("tax_amount").notNull().default(0),
});

export const salePaymentsTable = pgTable("festiland_sale_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id").notNull(),
  method: text("method").notNull(),
  amount: money("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryAdjustmentsTable = pgTable(
  "festiland_inventory_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull(),
    quantityChange: quantity("quantity_change").notNull(),
    reason: text("reason").notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("festiland_inventory_created_idx").on(table.createdAt)],
);

export const accountsTable = pgTable(
  "festiland_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    active: boolean("active").notNull().default(true),
    systemKey: text("system_key"),
  },
  (table) => [uniqueIndex("festiland_accounts_code_unique").on(table.code)],
);

export const journalEntriesTable = pgTable(
  "festiland_journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryDate: text("entry_date").notNull(),
    description: text("description").notNull(),
    source: text("source").notNull().default("manual"),
    sourceId: text("source_id"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("festiland_journal_date_idx").on(table.entryDate)],
);

export const journalLinesTable = pgTable("festiland_journal_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryId: uuid("entry_id").notNull(),
  accountId: uuid("account_id").notNull(),
  debit: money("debit").notNull().default(0),
  credit: money("credit").notNull().default(0),
  memo: text("memo"),
});

export const expensesTable = pgTable(
  "festiland_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    description: text("description").notNull(),
    accountId: uuid("account_id").notNull(),
    amount: money("amount").notNull(),
    paymentMethod: text("payment_method").notNull(),
    supplierId: uuid("supplier_id"),
    dueDate: text("due_date"),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("festiland_expenses_created_idx").on(table.createdAt)],
);

export const purchasesTable = pgTable(
  "festiland_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id").notNull(),
    supplierName: text("supplier_name").notNull(),
    total: money("total").notNull(),
    paymentMethod: text("payment_method").notNull(),
    dueDate: text("due_date"),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("festiland_purchases_created_idx").on(table.createdAt)],
);

export const purchaseLinesTable = pgTable("festiland_purchase_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  purchaseId: uuid("purchase_id").notNull(),
  productId: uuid("product_id").notNull(),
  name: text("name").notNull(),
  quantity: quantity("quantity").notNull(),
  unitCost: money("unit_cost").notNull(),
  lineTotal: money("line_total").notNull(),
});

export const settlementsTable = pgTable("festiland_settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  direction: text("direction").notNull(),
  contactId: uuid("contact_id").notNull(),
  amount: money("amount").notNull(),
  paymentMethod: text("payment_method").notNull(),
  note: text("note"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storeSettingsTable = pgTable("festiland_store_settings", {
  id: text("id").primaryKey().default("main"),
  name: text("name").notNull().default("Festiland"),
  taxId: text("tax_id"),
  address: text("address"),
  phone: text("phone"),
  receiptFooter: text("receipt_footer").notNull().default("Gracias por celebrar con Festiland"),
  receiptPaper: text("receipt_paper").notNull().default("80mm"),
  lockedThrough: text("locked_through"),
});

export const cashSessionsTable = pgTable("festiland_cash_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  openingAmount: money("opening_amount").notNull(),
  expectedAmount: money("expected_amount"),
  countedAmount: money("counted_amount"),
  difference: money("difference"),
  note: text("note"),
}, (table) => [
  uniqueIndex("festiland_one_open_cash_session").on(table.userId).where(sql`${table.closedAt} IS NULL`),
]);

export const auditLogTable = pgTable(
  "festiland_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("festiland_audit_created_idx").on(table.createdAt)],
);
