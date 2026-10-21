import { and, eq, sql } from "drizzle-orm";
import {
  contactsTable,
  expensesTable,
  purchasesTable,
  salePaymentsTable,
  salesTable,
  settlementsTable,
} from "@workspace/db";
import type { DbTx } from "./accounting";

export async function contactBalance(
  tx: DbTx,
  contactId: string,
  kind: "customer" | "supplier",
): Promise<number> {
  const [contact] = await tx
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.kind, kind)));
  if (!contact) throw new Error("El contacto no existe.");
  let charges = contact.openingBalance;
  if (kind === "customer") {
    const [total] = await tx
      .select({ amount: sql<number>`COALESCE(SUM(${salePaymentsTable.amount}), 0)::float` })
      .from(salePaymentsTable)
      .innerJoin(salesTable, eq(salesTable.id, salePaymentsTable.saleId))
      .where(and(
        eq(salesTable.customerId, contactId),
        eq(salesTable.status, "completed"),
        eq(salePaymentsTable.method, "credit"),
      ));
    charges += Number(total.amount);
  } else {
    const [purchases] = await tx
      .select({ amount: sql<number>`COALESCE(SUM(${purchasesTable.total}), 0)::float` })
      .from(purchasesTable)
      .where(and(eq(purchasesTable.supplierId, contactId), eq(purchasesTable.paymentMethod, "payable")));
    const [expenses] = await tx
      .select({ amount: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)::float` })
      .from(expensesTable)
      .where(and(eq(expensesTable.supplierId, contactId), eq(expensesTable.paymentMethod, "payable")));
    charges += Number(purchases.amount) + Number(expenses.amount);
  }
  const [paid] = await tx
    .select({ amount: sql<number>`COALESCE(SUM(${settlementsTable.amount}), 0)::float` })
    .from(settlementsTable)
    .where(and(
      eq(settlementsTable.contactId, contactId),
      eq(settlementsTable.direction, kind === "customer" ? "receivable" : "payable"),
    ));
  return Math.round((charges - Number(paid.amount)) * 100) / 100;
}
