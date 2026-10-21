import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  accountsTable,
  db,
  productsTable,
  saleLinesTable,
  salesTable,
} from "@workspace/db";
import { GetDashboardResponse } from "@workspace/api-zod";
import { ensureSystemAccounts, getAccountBalance } from "../lib/accounting";
import { saleWithLines } from "./sales";

const router: IRouter = Router();

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
  }).format(new Date());
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  const today = localDate();
  const startOfDay = new Date(`${today}T00:00:00-04:00`);
  const startOfTomorrow = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  const [todayRows, recentRows, lowStockRows, accounts] = await Promise.all([
    db
      .select()
      .from(salesTable)
      .where(
        and(
          eq(salesTable.status, "completed"),
          gte(salesTable.createdAt, startOfDay),
          lt(salesTable.createdAt, startOfTomorrow),
        ),
      ),
    db
      .select()
      .from(salesTable)
      .orderBy(desc(salesTable.createdAt))
      .limit(8),
    db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.active, true),
          sql`${productsTable.stock} <= ${productsTable.minStock}`,
        ),
      ),
    ensureSystemAccounts(db),
  ]);
  const recentSales = await Promise.all(recentRows.map(saleWithLines));
  const accountBalances = await Promise.all(
    accounts.map(async (account) => ({
      key: account.systemKey,
      balance: await getAccountBalance(db, account.id),
    })),
  );
  const balanceFor = (key: string) =>
    accountBalances.find((account) => account.key === key)?.balance ?? 0;

  const monthStart = new Date();
  monthStart.setDate(monthStart.getDate() - 30);
  const recentLines = await db
    .select({
      productId: saleLinesTable.productId,
      name: saleLinesTable.name,
      quantity: saleLinesTable.quantity,
      lineTotal: saleLinesTable.lineTotal,
      createdAt: salesTable.createdAt,
    })
    .from(saleLinesTable)
    .innerJoin(salesTable, eq(salesTable.id, saleLinesTable.saleId))
    .where(
      and(
        eq(salesTable.status, "completed"),
        gte(salesTable.createdAt, monthStart),
      ),
    );
  const grouped = new Map<
    string,
    { productId: string; name: string; quantity: number; revenue: number }
  >();
  for (const line of recentLines) {
    const group = grouped.get(line.productId) ?? {
      productId: line.productId,
      name: line.name,
      quantity: 0,
      revenue: 0,
    };
    group.quantity += line.quantity;
    group.revenue += line.lineTotal;
    grouped.set(line.productId, group);
  }
  const topProducts = [...grouped.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  res.json(
    GetDashboardResponse.parse({
      todaySales: todayRows.reduce((sum, sale) => sum + sale.total, 0),
      todayTransactions: todayRows.length,
      lowStockCount: lowStockRows.length,
      cashBalance: balanceFor("cash") + balanceFor("bank"),
      accountsReceivable: balanceFor("receivable"),
      accountsPayable: balanceFor("payable"),
      recentSales,
      topProducts,
    }),
  );
});

export default router;
