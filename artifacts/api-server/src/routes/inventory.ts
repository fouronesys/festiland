import { and, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateInventoryAdjustmentBody,
  CreateInventoryAdjustmentResponse,
  CreatePurchaseBody,
  CreatePurchaseResponse,
  ListInventoryAdjustmentsResponse,
  ListPurchasesResponse,
} from "@workspace/api-zod";
import {
  accountsTable,
  contactsTable,
  db,
  inventoryAdjustmentsTable,
  productsTable,
  purchaseLinesTable,
  purchasesTable,
} from "@workspace/db";
import { getMember, requireRole } from "../middlewares/festilandAuth";
import {
  ensureSystemAccounts,
  postJournalEntry,
  systemAccountId,
} from "../lib/accounting";

const router: IRouter = Router();

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
  }).format(new Date());
}

router.get("/inventory/adjustments", requireRole("owner", "manager", "inventory", "accountant"), async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: inventoryAdjustmentsTable.id,
      productId: inventoryAdjustmentsTable.productId,
      productName: productsTable.name,
      quantityChange: inventoryAdjustmentsTable.quantityChange,
      reason: inventoryAdjustmentsTable.reason,
      note: inventoryAdjustmentsTable.note,
      createdAt: inventoryAdjustmentsTable.createdAt,
    })
    .from(inventoryAdjustmentsTable)
    .innerJoin(productsTable, eq(productsTable.id, inventoryAdjustmentsTable.productId))
    .orderBy(desc(inventoryAdjustmentsTable.createdAt))
    .limit(250);
  res.json(ListInventoryAdjustmentsResponse.parse(rows));
});

router.post(
  "/inventory/adjustments",
  requireRole("owner", "manager", "inventory"),
  async (req, res): Promise<void> => {
    const parsed = CreateInventoryAdjustmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (parsed.data.quantityChange === 0) {
      res.status(400).json({ error: "El ajuste debe cambiar la existencia." });
      return;
    }
    const member = getMember(res);
    const result = await db.transaction(async (tx) => {
      const [product] = await tx
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, parsed.data.productId))
        .limit(1);
      if (!product) return { error: "No encontramos ese producto." as const };
      if (product.stock + parsed.data.quantityChange < product.reservedStock) {
        return { error: `El ajuste dejaría menos unidades físicas que las reservadas (${product.reservedStock}).` as const };
      }
      const [updatedProduct] = await tx
        .update(productsTable)
        .set({
          stock: product.stock + parsed.data.quantityChange,
          updatedAt: new Date(),
        })
        .where(and(
          eq(productsTable.id, product.id),
          sql`${productsTable.stock} + ${parsed.data.quantityChange} >= ${productsTable.reservedStock}`,
        ))
        .returning();
      if (!updatedProduct) {
        return { error: "La disponibilidad cambió y el ajuste habría afectado unidades reservadas." as const };
      }
      const [adjustment] = await tx
        .insert(inventoryAdjustmentsTable)
        .values({ ...parsed.data, createdBy: member.id })
        .returning();

      const value = Math.abs(parsed.data.quantityChange * product.cost);
      if (value > 0) {
        await ensureSystemAccounts(tx);
        const inventoryId = await systemAccountId(tx, "inventory");
        const counterpartId =
          parsed.data.quantityChange > 0
            ? await systemAccountId(tx, "equity")
            : await systemAccountId(tx, "cogs");
        await postJournalEntry(tx, {
          date: localDate(),
          description: `Ajuste de inventario · ${product.name}`,
          source: "inventory_adjustment",
          sourceId: adjustment.id,
          createdBy: member.id,
          lines:
            parsed.data.quantityChange > 0
              ? [
                  { accountId: inventoryId, debit: value, credit: 0 },
                  { accountId: counterpartId, debit: 0, credit: value },
                ]
              : [
                  { accountId: counterpartId, debit: value, credit: 0 },
                  { accountId: inventoryId, debit: 0, credit: value },
                ],
        });
      }
      return {
        adjustment: {
          ...adjustment,
          productName: updatedProduct.name,
        },
      };
    });
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(
      CreateInventoryAdjustmentResponse.parse(result.adjustment),
    );
  },
);

router.get(
  "/purchases",
  requireRole("owner", "manager", "inventory", "accountant"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(purchasesTable)
      .orderBy(desc(purchasesTable.createdAt))
      .limit(200);
    const purchases = await Promise.all(
      rows.map(async (purchase) => {
        const lines = await db
          .select()
          .from(purchaseLinesTable)
          .where(eq(purchaseLinesTable.purchaseId, purchase.id));
        return {
          id: purchase.id,
          supplierName: purchase.supplierName,
          total: purchase.total,
          status: purchase.paymentMethod === "payable" ? "unpaid" : "paid",
          itemCount: lines.length,
          createdAt: purchase.createdAt,
        };
      }),
    );
    res.json(ListPurchasesResponse.parse(purchases));
  },
);

router.post(
  "/purchases",
  requireRole("owner", "manager", "inventory", "accountant"),
  async (req, res): Promise<void> => {
    const parsed = CreatePurchaseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const member = getMember(res);
    if (new Set(parsed.data.items.map(item => item.productId)).size !== parsed.data.items.length) {
      res.status(400).json({ error: "Agrega cada producto una sola vez." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [supplier] = await tx
        .select()
        .from(contactsTable)
        .where(
          and(
            eq(contactsTable.id, parsed.data.supplierId),
            eq(contactsTable.kind, "supplier"),
          ),
        )
        .limit(1);
      if (!supplier) return { error: "Selecciona un proveedor válido." as const };

      const products = await Promise.all(
        [...parsed.data.items].sort((a, b) => a.productId.localeCompare(b.productId)).map(async (item) => {
          const [product] = await tx
            .select()
            .from(productsTable)
            .where(eq(productsTable.id, item.productId))
            .limit(1);
          return product ? { item, product } : null;
        }),
      );
      if (products.some((entry) => entry === null)) {
        return { error: "Uno de los productos ya no existe." as const };
      }
      const validProducts = products.filter(
        (entry): entry is NonNullable<typeof entry> => entry !== null,
      );
      if (validProducts.some(row => row.product.productType === "service")) {
        return { error: "Las compras de inventario sólo admiten productos físicos. Registra los servicios como gastos." as const };
      }
      const total = Math.round(validProducts.reduce(
        (sum, entry) => sum + Math.round(entry.item.quantity * entry.item.unitCost * 100) / 100,
        0,
      ) * 100) / 100;
      if (total <= 0) return { error: "La compra debe tener un costo mayor que cero." as const };
      const [purchase] = await tx
        .insert(purchasesTable)
        .values({
          supplierId: supplier.id,
          supplierName: supplier.name,
          total,
          paymentMethod: parsed.data.paymentMethod,
          dueDate: parsed.data.dueDate?.toISOString().slice(0, 10) ?? null,
          note: parsed.data.note ?? null,
          createdBy: member.id,
        })
        .returning();

      for (const { item, product } of validProducts) {
        await tx.insert(purchaseLinesTable).values({
          purchaseId: purchase.id,
          productId: product.id,
          name: product.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          lineTotal: item.quantity * item.unitCost,
        });
        await tx
          .update(productsTable)
          .set({
            stock: product.stock + item.quantity,
            cost: Math.round(((product.stock * product.cost + item.quantity * item.unitCost) / (product.stock + item.quantity)) * 1e6) / 1e6,
            updatedAt: new Date(),
          })
          .where(eq(productsTable.id, product.id));
        await tx.insert(inventoryAdjustmentsTable).values({
          productId: product.id,
          quantityChange: item.quantity,
          reason: "correction",
          note: `Compra ${purchase.id.slice(0, 8)}`,
          createdBy: member.id,
        });
      }

      await ensureSystemAccounts(tx);
      const inventoryId = await systemAccountId(tx, "inventory");
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
        description: `Compra a proveedor · ${supplier.name}`,
        source: "purchase",
        sourceId: purchase.id,
        createdBy: member.id,
        lines: [
          { accountId: inventoryId, debit: total, credit: 0 },
          { accountId: creditId, debit: 0, credit: total },
        ],
      });
      return {
        purchase: {
          id: purchase.id,
          supplierName: supplier.name,
          total,
          status: parsed.data.paymentMethod === "payable" ? "unpaid" : "paid",
          itemCount: validProducts.length,
          createdAt: purchase.createdAt,
        },
      };
    });
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json(CreatePurchaseResponse.parse(result.purchase));
  },
);

export default router;
