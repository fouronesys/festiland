import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  closeDatabase, db, contactsTable, salesTable, salePaymentsTable, settlementsTable, expensesTable,
  storeSettingsTable, journalEntriesTable, journalLinesTable,
} from "@workspace/db";
import { calculateSaleLine } from "../src/lib/saleMath";
import { ensureSystemAccounts, getAccountBalance, postJournalEntry, systemAccountId } from "../src/lib/accounting";
import { contactBalance } from "../src/lib/contactBalances";
import { AppError } from "../src/lib/appError";
import { GetFinancialReportQueryParams } from "@workspace/api-zod";

async function main() {
assert.ok(GetFinancialReportQueryParams.safeParse({ from: "2026-01-01", to: "2026-12-31" }).success);
assert.equal(GetFinancialReportQueryParams.safeParse({ from: "not-a-date", to: "2026-12-31" }).success, false);
console.log("PASS: fechas HTTP de informes aceptadas y fechas inválidas rechazadas.");
assert.deepEqual(calculateSaleLine({ price: 100, quantity: 2, subtotal: 200, discount: 0, rate: 18 }), { base: 200, taxAmount: 36, lineTotal: 236 });
assert.deepEqual(calculateSaleLine({ price: 118, quantity: 1, subtotal: 118, discount: 0, rate: 18, inclusive: true }), { base: 118, taxAmount: 18, lineTotal: 118 });
assert.equal(calculateSaleLine({ price: 100, quantity: 1, subtotal: 100, discount: 10, rate: 18 }).lineTotal, 106.2);
assert.equal(calculateSaleLine({ price: 100, quantity: 0.5, subtotal: 50, discount: 0 }).lineTotal, 50);
console.log("PASS: impuesto adicional, incluido, descuentos y cantidades fraccionarias.");

const rollback = new Error("ROLLBACK_VERIFICATION_ONLY");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
let passed = false;
try {
  await db.transaction(async tx => {
    await tx.insert(storeSettingsTable).values({ id: "main" }).onConflictDoNothing();
    await tx.update(storeSettingsTable).set({ lockedThrough: null }).where(eq(storeSettingsTable.id, "main"));
    await ensureSystemAccounts(tx);
    const cash = await systemAccountId(tx, "cash");
    const ar = await systemAccountId(tx, "receivable");
    const ap = await systemAccountId(tx, "payable");
    const revenue = await systemAccountId(tx, "revenue");
    const expense = await systemAccountId(tx, "generalExpense");
    const beforeCash = await getAccountBalance(tx, cash);
    const beforeAr = await getAccountBalance(tx, ar);
    const beforePast = await getAccountBalance(tx, cash, "1999-12-31");
    const actor = "verification-rollback-only";
    const [customer] = await tx.insert(contactsTable).values({ kind: "customer", name: "Verificación temporal" }).returning();
    const [sale] = await tx.insert(salesTable).values({
      receiptNumber: `VERIFY-${randomUUID()}`, customerId: customer.id, subtotal: 100, total: 100,
      paymentSummary: "credit", createdBy: actor,
    }).returning();
    await tx.insert(salePaymentsTable).values({ saleId: sale.id, method: "credit", amount: 100 });
    await postJournalEntry(tx, { date: today, description: "Verificación crédito", source: "verification", createdBy: actor,
      lines: [{ accountId: ar, debit: 100, credit: 0 }, { accountId: revenue, debit: 0, credit: 100 }] });
    assert.equal(await contactBalance(tx, customer.id, "customer"), 100);
    await tx.insert(settlementsTable).values({ direction: "receivable", contactId: customer.id, amount: 40, paymentMethod: "cash", createdBy: actor });
    await postJournalEntry(tx, { date: today, description: "Verificación cobro", source: "verification", createdBy: actor,
      lines: [{ accountId: cash, debit: 40, credit: 0 }, { accountId: ar, debit: 0, credit: 40 }] });
    assert.equal(await contactBalance(tx, customer.id, "customer"), 60);
    assert.equal(Math.round(((await getAccountBalance(tx, ar)) - beforeAr) * 100), 6000);
    assert.equal(Math.round(((await getAccountBalance(tx, cash)) - beforeCash) * 100), 4000);
    assert.equal(await getAccountBalance(tx, cash, "1999-12-31"), beforePast);
    const [supplier] = await tx.insert(contactsTable).values({ kind: "supplier", name: "Proveedor temporal" }).returning();
    await tx.insert(expensesTable).values({ description: "Verificación", accountId: expense, supplierId: supplier.id, amount: 80, paymentMethod: "payable", createdBy: actor });
    await postJournalEntry(tx, { date: today, description: "Verificación gasto", source: "verification", createdBy: actor,
      lines: [{ accountId: expense, debit: 80, credit: 0 }, { accountId: ap, debit: 0, credit: 80 }] });
    await tx.insert(settlementsTable).values({ direction: "payable", contactId: supplier.id, amount: 30, paymentMethod: "cash", createdBy: actor });
    await postJournalEntry(tx, { date: today, description: "Verificación pago", source: "verification", createdBy: actor,
      lines: [{ accountId: ap, debit: 30, credit: 0 }, { accountId: cash, debit: 0, credit: 30 }] });
    assert.equal(await contactBalance(tx, supplier.id, "supplier"), 50);
    await assert.rejects(() => postJournalEntry(tx, { date: today, description: "Desbalance inválido", source: "verification", createdBy: actor,
      lines: [{ accountId: cash, debit: 10, credit: 0 }, { accountId: revenue, debit: 0, credit: 9 }] }), AppError);
    const [totals] = await tx.select({ balance: sql<number>`SUM(${journalLinesTable.debit} - ${journalLinesTable.credit})` })
      .from(journalLinesTable).innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
      .where(eq(journalEntriesTable.createdBy, actor));
    assert.equal(totals.balance, 0);
    await tx.update(storeSettingsTable).set({ lockedThrough: today }).where(eq(storeSettingsTable.id, "main"));
    await assert.rejects(() => postJournalEntry(tx, { date: today, description: "Período cerrado", source: "verification", createdBy: actor,
      lines: [{ accountId: cash, debit: 10, credit: 0 }, { accountId: revenue, debit: 0, credit: 10 }] }), (error: unknown) => error instanceof AppError && error.status === 409);
    passed = true;
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
}
assert.ok(passed);
console.log("PASS: cobro parcial, pago parcial, saldos al corte, partida doble, rechazo de desbalance y bloqueo contable.");
console.log("ROLLBACK completo: no se conservaron los registros de verificación.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(closeDatabase);
