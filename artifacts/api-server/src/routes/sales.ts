import { randomUUID } from "node:crypto";
import { and, desc, eq, like as ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateSaleBody,
  CreateSaleResponse,
  ListSalesQueryParams,
  ListSalesResponse,
  RefundSaleBody,
  RefundSaleParams,
  RefundSaleResponse,
} from "@workspace/api-zod";
import {
  contactsTable,
  settlementsTable,
  db,
  journalEntriesTable,
  journalLinesTable,
  productsTable,
  saleLinesTable,
  salePaymentsTable,
  salesTable,
  taxRatesTable,
  inventoryAdjustmentsTable,
} from "@workspace/db";
import { getMember, requireRole } from "../middlewares/festilandAuth";
import { ensureSystemAccounts, postJournalEntry, systemAccountId } from "../lib/accounting";
import { calculateSaleLine } from "../lib/saleMath";

const router: IRouter = Router();
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
  }).format(new Date());
}

export async function saleWithLines(sale: typeof salesTable.$inferSelect) {
  const lines = await db
    .select()
    .from(saleLinesTable)
    .where(eq(saleLinesTable.saleId, sale.id));
  return {
    ...sale,
    items: lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      taxAmount: line.taxAmount,
    })),
  };
}

router.get("/sales", async (req, res): Promise<void> => {
  const query = ListSalesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const search = query.data.search?.trim();
  const sales = await db
    .select()
    .from(salesTable)
    .where(
      search
        ? or(
            ilike(salesTable.receiptNumber, `%${search}%`),
            ilike(salesTable.customerName, `%${search}%`),
          )
        : undefined,
    )
    .orderBy(desc(salesTable.createdAt))
    .limit(100);
  const result = await Promise.all(sales.map(saleWithLines));
  res.json(ListSalesResponse.parse(result));
});

router.post(
  "/sales",
  requireRole("owner", "manager", "cashier"),
  async (req, res): Promise<void> => {
    const parsed = CreateSaleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const member = getMember(res);
    const saleId = randomUUID();
    if (
      new Set(parsed.data.items.map((item) => item.productId)).size !==
      parsed.data.items.length
    ) {
      res.status(400).json({ error: "Agrega cada producto una sola vez y ajusta su cantidad." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const productRows = await Promise.all(
        [...parsed.data.items].sort((a, b) => a.productId.localeCompare(b.productId)).map(async (item) => {
          const [product] = await tx
            .select()
            .from(productsTable)
            .where(eq(productsTable.id, item.productId))
            .limit(1);
          return product ? { item, product } : null;
        }),
      );
      if (productRows.some((row) => row === null)) {
        return { error: "Uno de los artículos ya no está en el catálogo." as const };
      }
      const rows = productRows.filter(
        (row): row is NonNullable<typeof row> => row !== null,
      );
      for (const { item, product } of rows) {
        if (!product.active) return { error: `${product.name} está desactivado.` as const };
        if (
          product.productType !== "service" &&
          item.quantity > product.stock
        ) {
          return {
            error: `Existencia insuficiente para ${product.name}. Disponible: ${product.stock}.` as const,
          };
        }
      }

      const customerId = parsed.data.customerId ?? null;
      const customerName = customerId
        ? (
            await tx
              .select({ name: contactsTable.name })
              .from(contactsTable)
              .where(and(eq(contactsTable.id, customerId), eq(contactsTable.kind, "customer")))
              .limit(1)
          )[0]?.name ?? null
        : null;
      if (customerId && !customerName) return { error: "Selecciona un cliente válido." as const };

      const subtotal = roundMoney(
        rows.reduce((sum, row) => sum + row.product.price * row.item.quantity, 0),
      );
      if (parsed.data.discountAmount > subtotal) {
        return { error: "El descuento no puede superar el subtotal." as const };
      }
      const paymentsTotal = roundMoney(
        parsed.data.payments.reduce((sum, payment) => sum + payment.amount, 0),
      );
      const taxableLines = await Promise.all(
        rows.map(async (row) => {
          const [rate] = row.product.taxRateId
            ? await tx
                .select()
                .from(taxRatesTable)
                .where(
                  and(
                    eq(taxRatesTable.id, row.product.taxRateId),
                    eq(taxRatesTable.active, true),
                  ),
                )
                .limit(1)
            : [];
          return { ...row, rate };
        }),
      );
      const computedLines = taxableLines.map(({ item, product, rate }) => {
        return {
          product,
          item,
          ...calculateSaleLine({
            price: product.price, quantity: item.quantity, subtotal,
            discount: parsed.data.discountAmount, rate: rate?.rate, inclusive: rate?.inclusive,
          }),
        };
      });
      const taxAmount = roundMoney(
        computedLines.reduce((sum, line) => sum + line.taxAmount, 0),
      );
      const total = roundMoney(
        computedLines.reduce((sum, line) => sum + line.lineTotal, 0),
      );
      if (total <= 0 || Math.round(paymentsTotal * 100) !== Math.round(total * 100)) {
        return {
          error: "Los pagos deben sumar exactamente el total de la venta." as const,
        };
      }
      if (
        parsed.data.payments.some((payment) => payment.method === "credit") &&
        !customerId
      ) {
        return {
          error: "Selecciona un cliente para registrar una venta a crédito." as const,
        };
      }

      const today = localDate();
      const receiptNumber = `FL-${today.replaceAll("-", "")}-${saleId.slice(0, 6).toUpperCase()}`;
      const [sale] = await tx
        .insert(salesTable)
        .values({
          id: saleId,
          receiptNumber,
          customerId,
          customerName,
          status: "completed",
          subtotal,
          discountAmount: parsed.data.discountAmount,
          taxAmount,
          total,
          paymentSummary: parsed.data.payments
            .map((payment) => `${payment.method}:${roundMoney(payment.amount).toFixed(2)}`)
            .join(" · "),
          note: parsed.data.note ?? null,
          createdBy: member.id,
        })
        .returning();

      let costOfGoods = 0;
      for (const line of computedLines) {
        await tx.insert(saleLinesTable).values({
          saleId: sale.id,
          productId: line.product.id,
          name: line.product.name,
          quantity: line.item.quantity,
          unitPrice: line.product.price,
          unitCost: line.product.cost,
          lineTotal: line.lineTotal,
          taxAmount: line.taxAmount,
        });
        if (line.product.productType !== "service") {
          await tx
            .update(productsTable)
            .set({
              stock: line.product.stock - line.item.quantity,
              updatedAt: new Date(),
            })
            .where(eq(productsTable.id, line.product.id));
          await tx.insert(inventoryAdjustmentsTable).values({
            productId: line.product.id, quantityChange: -line.item.quantity,
            reason: "sale", note: `Venta ${receiptNumber}`, createdBy: member.id,
          });
          costOfGoods += line.product.cost * line.item.quantity;
        }
      }
      for (const payment of parsed.data.payments) {
        await tx.insert(salePaymentsTable).values({
          saleId: sale.id,
          method: payment.method,
          amount: payment.amount,
        });
      }

      await ensureSystemAccounts(tx);
      const cashLines: { accountId: string; debit: number; credit: number }[] = [];
      const cashTotal = parsed.data.payments
        .filter((payment) => payment.method === "cash")
        .reduce((sum, payment) => sum + payment.amount, 0);
      const bankTotal = parsed.data.payments
        .filter((payment) => ["card", "transfer"].includes(payment.method))
        .reduce((sum, payment) => sum + payment.amount, 0);
      const creditTotal = parsed.data.payments
        .filter((payment) => payment.method === "credit")
        .reduce((sum, payment) => sum + payment.amount, 0);
      if (cashTotal) {
        cashLines.push({
          accountId: await systemAccountId(tx, "cash"),
          debit: cashTotal,
          credit: 0,
        });
      }
      if (bankTotal) {
        cashLines.push({
          accountId: await systemAccountId(tx, "bank"),
          debit: bankTotal,
          credit: 0,
        });
      }
      if (creditTotal) {
        cashLines.push({
          accountId: await systemAccountId(tx, "receivable"),
          debit: creditTotal,
          credit: 0,
        });
      }
      const revenue = roundMoney(total - taxAmount);
      const journalLines = [
        ...cashLines,
        { accountId: await systemAccountId(tx, "revenue"), debit: 0, credit: revenue },
        ...(taxAmount
          ? [{ accountId: await systemAccountId(tx, "tax"), debit: 0, credit: taxAmount }]
          : []),
      ];
      if (costOfGoods > 0) {
        journalLines.push(
          { accountId: await systemAccountId(tx, "cogs"), debit: roundMoney(costOfGoods), credit: 0 },
          { accountId: await systemAccountId(tx, "inventory"), debit: 0, credit: roundMoney(costOfGoods) },
        );
      }
      await postJournalEntry(tx, {
        date: today,
        description: `Venta ${receiptNumber}`,
        source: "sale",
        sourceId: sale.id,
        createdBy: member.id,
        lines: journalLines,
      });
      return {
        sale: {
          ...sale,
          items: computedLines.map((line) => ({
            productId: line.product.id,
            name: line.product.name,
            quantity: line.item.quantity,
            unitPrice: line.product.price,
            lineTotal: line.lineTotal,
            taxAmount: line.taxAmount,
          })),
        },
      };
    });
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(CreateSaleResponse.parse(result.sale));
  },
);

router.post(
  "/sales/:saleId/refund",
  requireRole("owner", "manager"),
  async (req, res): Promise<void> => {
    const params = RefundSaleParams.safeParse(req.params);
    const body = RefundSaleBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const member = getMember(res);
    const result = await db.transaction(async (tx) => {
      const [sale] = await tx
        .select()
        .from(salesTable)
        .where(eq(salesTable.id, params.data.saleId))
        .limit(1);
      if (!sale) return { error: "No encontramos esa venta." as const };
      if (sale.status !== "completed") {
        return { error: "Esta venta ya fue devuelta o ajustada." as const };
      }
      if (sale.customerId) {
        await tx.select().from(contactsTable).where(eq(contactsTable.id, sale.customerId));
        const [credit] = await tx.select().from(salePaymentsTable)
          .where(and(eq(salePaymentsTable.saleId, sale.id), eq(salePaymentsTable.method, "credit"))).limit(1);
        const [collected] = await tx.select().from(settlementsTable)
          .where(and(eq(settlementsTable.contactId, sale.customerId), eq(settlementsTable.direction, "receivable"))).limit(1);
        if (credit && collected) {
          return { error: "Esta venta a crédito pertenece a un cliente con cobros registrados. El contable debe conciliar el reembolso antes de devolverla; no se modificó la venta." as const };
        }
      }
      const lines = await tx
        .select()
        .from(saleLinesTable)
        .where(eq(saleLinesTable.saleId, sale.id)).orderBy(saleLinesTable.productId);
      for (const line of lines) {
        const [product] = await tx
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, line.productId))
          .limit(1);
        if (product && product.productType !== "service") {
          await tx
            .update(productsTable)
            .set({
              stock: product.stock + line.quantity,
              cost: Math.round(((product.stock * product.cost + line.quantity * line.unitCost) / (product.stock + line.quantity)) * 1e6) / 1e6,
              updatedAt: new Date(),
            })
            .where(eq(productsTable.id, product.id));
          await tx.insert(inventoryAdjustmentsTable).values({
            productId: product.id,
            quantityChange: line.quantity,
            reason: "return",
            note: `Devolución ${sale.receiptNumber}`,
            createdBy: member.id,
          });
        }
      }

      const [original] = await tx
        .select()
        .from(journalEntriesTable)
        .where(
          and(
            eq(journalEntriesTable.source, "sale"),
            eq(journalEntriesTable.sourceId, sale.id),
          ),
        )
        .limit(1);
      if (original) {
        const originalLines = await tx
          .select()
          .from(journalLinesTable)
          .where(eq(journalLinesTable.entryId, original.id));
        await postJournalEntry(tx, {
          date: localDate(),
          description: `Devolución ${sale.receiptNumber} · ${body.data.reason}`,
          source: "refund",
          sourceId: sale.id,
          createdBy: member.id,
          lines: originalLines.map((line) => ({
            accountId: line.accountId,
            debit: line.credit,
            credit: line.debit,
            memo: body.data.reason,
          })),
        });
      }
      const [updated] = await tx
        .update(salesTable)
        .set({ status: "refunded" })
        .where(eq(salesTable.id, sale.id))
        .returning();
      return {
        sale: {
          ...updated,
          items: lines.map((line) => ({
            productId: line.productId,
            name: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            taxAmount: line.taxAmount,
          })),
        },
      };
    });
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(RefundSaleResponse.parse(result.sale));
  },
);

export default router;
