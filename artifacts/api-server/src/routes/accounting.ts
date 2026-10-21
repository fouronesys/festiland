import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateAccountBody,
  CreateAccountResponse,
  CreateExpenseBody,
  CreateExpenseResponse,
  CreateJournalEntryBody,
  CreateJournalEntryResponse,
  CreateTaxRateBody,
  CreateTaxRateResponse,
  GetFinancialReportQueryParams,
  GetFinancialReportResponse,
  ListAccountsResponse,
  ListExpensesResponse,
  ListJournalEntriesResponse,
  ListTaxRatesResponse,
  UpdateTaxRateBody,
  UpdateTaxRateParams,
  UpdateTaxRateResponse,
} from "@workspace/api-zod";
import {
  accountsTable,
  contactsTable,
  db,
  expensesTable,
  journalEntriesTable,
  journalLinesTable,
  taxRatesTable,
} from "@workspace/db";
import { getMember, requireRole } from "../middlewares/festilandAuth";
import {
  ensureSystemAccounts,
  getAccountBalance,
  postJournalEntry,
  systemAccountId,
} from "../lib/accounting";
import { AppError } from "../lib/appError";

const router: IRouter = Router();

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
  }).format(new Date());
}

router.get("/tax-rates", async (_req, res): Promise<void> => {
  const rates = await db.select().from(taxRatesTable).orderBy(taxRatesTable.name);
  res.json(ListTaxRatesResponse.parse(rates));
});

router.post(
  "/tax-rates",
  requireRole("owner", "manager", "accountant"),
  async (req, res): Promise<void> => {
    const parsed = CreateTaxRateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [rate] = await db
      .insert(taxRatesTable)
      .values({ ...parsed.data, active: parsed.data.active ?? false })
      .returning();
    res.status(201).json(CreateTaxRateResponse.parse(rate));
  },
);

router.patch(
  "/tax-rates/:taxRateId",
  requireRole("owner", "manager", "accountant"),
  async (req, res): Promise<void> => {
    const params = UpdateTaxRateParams.safeParse(req.params);
    const body = UpdateTaxRateBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [rate] = await db
      .update(taxRatesTable)
      .set(body.data)
      .where(eq(taxRatesTable.id, params.data.taxRateId))
      .returning();
    if (!rate) {
      res.status(404).json({ error: "No encontramos ese impuesto." });
      return;
    }
    res.json(UpdateTaxRateResponse.parse(rate));
  },
);

router.get(
  "/accounts",
  requireRole("owner", "manager", "accountant"),
  async (_req, res): Promise<void> => {
    const accounts = await ensureSystemAccounts(db);
    const response = await Promise.all(
      accounts.map(async (account) => ({
        ...account,
        balance: await getAccountBalance(db, account.id),
      })),
    );
    res.json(ListAccountsResponse.parse(response));
  },
);

router.post(
  "/accounts",
  requireRole("owner", "accountant"),
  async (req, res): Promise<void> => {
    const parsed = CreateAccountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [account] = await db.insert(accountsTable).values(parsed.data).returning();
    res.status(201).json(CreateAccountResponse.parse({
      ...account,
      balance: 0,
    }));
  },
);

router.get(
  "/journal-entries",
  requireRole("owner", "manager", "accountant"),
  async (_req, res): Promise<void> => {
    const entries = await db
      .select()
      .from(journalEntriesTable)
      .orderBy(desc(journalEntriesTable.entryDate), desc(journalEntriesTable.createdAt))
      .limit(200);
    const response = await Promise.all(
      entries.map(async (entry) => {
        const lines = await db
          .select({
            accountId: journalLinesTable.accountId,
            accountName: accountsTable.name,
            debit: journalLinesTable.debit,
            credit: journalLinesTable.credit,
            memo: journalLinesTable.memo,
          })
          .from(journalLinesTable)
          .innerJoin(accountsTable, eq(accountsTable.id, journalLinesTable.accountId))
          .where(eq(journalLinesTable.entryId, entry.id));
        return {
          id: entry.id,
          date: entry.entryDate,
          description: entry.description,
          source: entry.source,
          total: lines.reduce((sum, line) => sum + line.debit, 0),
          lines,
        };
      }),
    );
    res.json(ListJournalEntriesResponse.parse(response));
  },
);

router.post(
  "/journal-entries",
  requireRole("owner", "accountant"),
  async (req, res): Promise<void> => {
    const parsed = CreateJournalEntryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const totalDebit = parsed.data.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = parsed.data.lines.reduce((sum, line) => sum + line.credit, 0);
    if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
      res.status(400).json({ error: "El asiento debe quedar balanceado: débitos = créditos." });
      return;
    }
    if (parsed.data.lines.some((line) => line.debit > 0 && line.credit > 0)) {
      res.status(400).json({ error: "Cada línea debe ser débito o crédito, no ambos." });
      return;
    }
    const member = getMember(res);
    const entry = await db.transaction(async (tx) => {
      const accounts = await tx.select({ id: accountsTable.id }).from(accountsTable);
      const available = new Set(accounts.map((account) => account.id));
      if (parsed.data.lines.some((line) => !available.has(line.accountId))) {
        throw new AppError(400, "Uno de los renglones usa una cuenta inexistente.");
      }
      const created = await postJournalEntry(tx, {
        date: parsed.data.date.toISOString().slice(0, 10),
        description: parsed.data.description,
        source: "manual",
        createdBy: member.id,
        lines: parsed.data.lines,
      });
      return created;
    });
    const lines = await db
      .select({
        accountId: journalLinesTable.accountId,
        accountName: accountsTable.name,
        debit: journalLinesTable.debit,
        credit: journalLinesTable.credit,
        memo: journalLinesTable.memo,
      })
      .from(journalLinesTable)
      .innerJoin(accountsTable, eq(accountsTable.id, journalLinesTable.accountId))
      .where(eq(journalLinesTable.entryId, entry.id));
    res.status(201).json(
      CreateJournalEntryResponse.parse({
        id: entry.id,
        date: entry.entryDate,
        description: entry.description,
        source: entry.source,
        total: totalDebit,
        lines,
      }),
    );
  },
);

router.get(
  "/expenses",
  requireRole("owner", "manager", "accountant"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select({
        id: expensesTable.id,
        description: expensesTable.description,
        accountId: expensesTable.accountId,
        amount: expensesTable.amount,
        paymentMethod: expensesTable.paymentMethod,
        supplierName: contactsTable.name,
        status: expensesTable.paymentMethod,
        createdAt: expensesTable.createdAt,
      })
      .from(expensesTable)
      .leftJoin(contactsTable, eq(contactsTable.id, expensesTable.supplierId))
      .orderBy(desc(expensesTable.createdAt))
      .limit(200);
    res.json(
      ListExpensesResponse.parse(
        rows.map((row) => ({
          ...row,
          status: row.status === "payable" ? "unpaid" : "paid",
        })),
      ),
    );
  },
);

router.post(
  "/expenses",
  requireRole("owner", "manager", "accountant"),
  async (req, res): Promise<void> => {
    const parsed = CreateExpenseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const member = getMember(res);
    const result = await db.transaction(async (tx) => {
      if (parsed.data.paymentMethod === "payable" && !parsed.data.supplierId) {
        return { error: "Selecciona un proveedor para registrar una cuenta por pagar." as const };
      }
      if (parsed.data.supplierId) {
        const [supplier] = await tx.select().from(contactsTable).where(and(
          eq(contactsTable.id, parsed.data.supplierId), eq(contactsTable.kind, "supplier"),
        ));
        if (!supplier) return { error: "Selecciona un proveedor válido." as const };
      }
      const [account] = await tx
        .select()
        .from(accountsTable)
        .where(eq(accountsTable.id, parsed.data.accountId))
        .limit(1);
      if (!account || account.type !== "expense") {
        return { error: "Elige una cuenta de gastos válida." as const };
      }
      const [expense] = await tx
        .insert(expensesTable)
        .values({
          ...parsed.data,
          supplierId: parsed.data.supplierId ?? null,
          dueDate: parsed.data.dueDate?.toISOString().slice(0, 10) ?? null,
          note: parsed.data.note ?? null,
          createdBy: member.id,
        })
        .returning();
      await ensureSystemAccounts(tx);
      const creditId = await systemAccountId(
        tx,
        parsed.data.paymentMethod === "payable"
          ? "payable"
          : parsed.data.paymentMethod === "cash"
            ? "cash"
            : "bank",
      );
      await postJournalEntry(tx, {
        date: localDate(),
        description: expense.description,
        source: "expense",
        sourceId: expense.id,
        createdBy: member.id,
        lines: [
          { accountId: account.id, debit: expense.amount, credit: 0 },
          { accountId: creditId, debit: 0, credit: expense.amount },
        ],
      });
      const [supplier] = expense.supplierId
        ? await tx
            .select({ name: contactsTable.name })
            .from(contactsTable)
            .where(eq(contactsTable.id, expense.supplierId))
            .limit(1)
        : [];
      return {
        expense: {
          id: expense.id,
          description: expense.description,
          accountId: expense.accountId,
          amount: expense.amount,
          paymentMethod: expense.paymentMethod,
          supplierName: supplier?.name ?? null,
          status: expense.paymentMethod === "payable" ? "unpaid" : "paid",
          createdAt: expense.createdAt,
        },
      };
    });
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(CreateExpenseResponse.parse(result.expense));
  },
);

router.get(
  "/reports/financial",
  requireRole("owner", "manager", "accountant"),
  async (req, res): Promise<void> => {
    const query = GetFinancialReportQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const from = query.data.from.toISOString().slice(0, 10);
    const to = query.data.to.toISOString().slice(0, 10);
    if (from > to) {
      res.status(400).json({ error: "La fecha inicial debe ser anterior a la fecha final." });
      return;
    }
    const entries = await db
      .select({
        type: accountsTable.type,
        systemKey: accountsTable.systemKey,
        debit: journalLinesTable.debit,
        credit: journalLinesTable.credit,
      })
      .from(journalEntriesTable)
      .innerJoin(journalLinesTable, eq(journalLinesTable.entryId, journalEntriesTable.id))
      .innerJoin(accountsTable, eq(accountsTable.id, journalLinesTable.accountId))
      .where(
        and(
          gte(journalEntriesTable.entryDate, from),
          lte(journalEntriesTable.entryDate, to),
        ),
      );
    const revenue = entries
      .filter((line) => line.type === "revenue")
      .reduce((sum, line) => sum + line.credit - line.debit, 0);
    const expenses = entries
      .filter((line) => line.type === "expense" && line.systemKey !== "cogs")
      .reduce((sum, line) => sum + line.debit - line.credit, 0);
    const costOfGoods = entries
      .filter((line) => line.systemKey === "cogs")
      .reduce((sum, line) => sum + line.debit - line.credit, 0);
    const accounts = await ensureSystemAccounts(db);
    const accountBalances = await Promise.all(
      accounts.map(async (account) => ({
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        balance: await getAccountBalance(db, account.id, to),
      })),
    );
    const balanceFor = (key: string) =>
      accountBalances.find((account) => accounts.find(
        (candidate) => candidate.id === account.accountId && candidate.systemKey === key,
      ))?.balance ?? 0;
    const report = {
      from,
      to,
      revenue,
      expenses,
      costOfGoods,
      grossProfit: revenue - costOfGoods,
      netIncome: revenue - expenses - costOfGoods,
      cashBalance: balanceFor("cash") + balanceFor("bank"),
      accountsReceivable: balanceFor("receivable"),
      accountsPayable: balanceFor("payable"),
      accountBalances,
    };
    res.json(GetFinancialReportResponse.parse(report));
  },
);

export default router;
