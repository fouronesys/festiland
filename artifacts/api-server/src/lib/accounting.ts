import { and, eq, lte, sql } from "drizzle-orm";
import { db, accountsTable, journalEntriesTable, journalLinesTable, storeSettingsTable, auditLogTable } from "@workspace/db";
import { AppError } from "./appError";
import { isDateInAutomaticallyClosedPeriod } from "./accounting-periods";

export type DbTx = Pick<typeof db, "select" | "insert" | "update" | "run">;

const BASE_ACCOUNTS = [
  { code: "1000", name: "Caja", type: "asset", systemKey: "cash" },
  { code: "1010", name: "Banco y tarjetas", type: "asset", systemKey: "bank" },
  { code: "1100", name: "Cuentas por cobrar", type: "asset", systemKey: "receivable" },
  { code: "1200", name: "Inventario", type: "asset", systemKey: "inventory" },
  { code: "2000", name: "Cuentas por pagar", type: "liability", systemKey: "payable" },
  { code: "2100", name: "Impuestos por pagar", type: "liability", systemKey: "tax" },
  { code: "3000", name: "Capital inicial", type: "equity", systemKey: "equity" },
  { code: "4000", name: "Ventas", type: "revenue", systemKey: "revenue" },
  { code: "5000", name: "Costo de ventas", type: "expense", systemKey: "cogs" },
  { code: "6000", name: "Gastos generales", type: "expense", systemKey: "generalExpense" },
] as const;

export async function ensureSystemAccounts(
  tx: DbTx,
): Promise<(typeof accountsTable.$inferSelect)[]> {
  for (const account of BASE_ACCOUNTS) {
    await tx
      .insert(accountsTable)
      .values(account)
      .onConflictDoNothing({ target: accountsTable.code });
  }
  return tx.select().from(accountsTable);
}

export async function systemAccountId(tx: DbTx, key: string): Promise<string> {
  const [account] = await tx
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.systemKey, key))
    .limit(1);
  if (!account) throw new Error(`Falta la cuenta contable del sistema: ${key}`);
  return account.id;
}

export type JournalLineDraft = {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string | null;
};

export async function postJournalEntry(
  tx: DbTx,
  input: {
    date: string;
    description: string;
    source: string;
    sourceId?: string;
    createdBy: string;
    lines: JournalLineDraft[];
  },
) {
  const [settings] = await tx.select().from(storeSettingsTable)
    .where(eq(storeSettingsTable.id, "main"));
  if (settings?.lockedThrough && input.date <= settings.lockedThrough) {
    throw new AppError(409, `El período está bloqueado hasta ${settings.lockedThrough}. No se modificó la operación.`);
  }
  if (isDateInAutomaticallyClosedPeriod(
    settings?.accountingPeriodStart,
    settings?.accountingPeriodEnd,
    input.date,
  )) {
    throw new AppError(409, `El período contable ${settings?.accountingPeriodStart}–${settings?.accountingPeriodEnd} está cerrado automáticamente. No se admiten asientos dentro de ese rango.`);
  }
  const lines = input.lines.map(line => ({
    ...line, debit: Math.round(line.debit * 100) / 100, credit: Math.round(line.credit * 100) / 100,
  }));
  const debitTotal = lines.reduce((sum, line) => sum + line.debit, 0);
  const creditTotal = lines.reduce((sum, line) => sum + line.credit, 0);
  if (
    lines.length < 2 ||
    Math.round(debitTotal * 100) !== Math.round(creditTotal * 100) ||
    debitTotal <= 0 ||
    lines.some(line => !Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0 || (line.debit > 0 && line.credit > 0))
  ) {
    throw new AppError(400, "El asiento debe tener al menos dos líneas válidas y estar balanceado.");
  }

  const [entry] = await tx
    .insert(journalEntriesTable)
    .values({
      entryDate: input.date,
      description: input.description,
      source: input.source,
      sourceId: input.sourceId,
      createdBy: input.createdBy,
      createdAt: new Date(),
    })
    .returning();
  await tx.insert(journalLinesTable).values(
    lines.map((line) => ({
      entryId: entry.id,
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      memo: line.memo ?? null,
    })),
  );
  await tx.insert(auditLogTable).values({
    actorId: input.createdBy,
    action: "post",
    entity: "journal",
    entityId: entry.id,
    details: `${input.source} · ${debitTotal.toFixed(2)} DOP`,
  });
  return entry;
}

export async function getAccountBalance(tx: DbTx, accountId: string, through?: string): Promise<number> {
  const [totals] = await tx
    .select({
      debit: sql<number>`COALESCE(SUM(${journalLinesTable.debit}), 0)`,
      credit: sql<number>`COALESCE(SUM(${journalLinesTable.credit}), 0)`,
    })
    .from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(and(
      eq(journalLinesTable.accountId, accountId),
      through ? lte(journalEntriesTable.entryDate, through) : undefined,
    ));
  const [account] = await tx
    .select({ type: accountsTable.type })
    .from(accountsTable)
    .where(eq(accountsTable.id, accountId))
    .limit(1);
  if (!account) return 0;
  return ["asset", "expense"].includes(account.type)
    ? totals.debit - totals.credit
    : totals.credit - totals.debit;
}
