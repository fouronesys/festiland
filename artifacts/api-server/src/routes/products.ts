import { and, eq, like as ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateProductBody,
  CreateProductResponse,
  ListProductsQueryParams,
  ListProductsResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import {
  db,
  inventoryAdjustmentsTable,
  productsTable,
  taxRatesTable,
  auditLogTable,
} from "@workspace/db";
import { getMember, requireRole } from "../middlewares/festilandAuth";
import { ensureSystemAccounts, systemAccountId, postJournalEntry } from "../lib/accounting";
import { AppError } from "../lib/appError";

const router: IRouter = Router();

router.get("/products", async (req, res): Promise<void> => {
  const query = ListProductsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const conditions = [];
  const search = query.data.search?.trim();
  if (search) {
    conditions.push(
      or(
        ilike(productsTable.name, `%${search}%`),
        ilike(productsTable.sku, `%${search}%`),
        ilike(productsTable.barcode, `%${search}%`),
      ),
    );
  }
  if (query.data.category) {
    conditions.push(eq(productsTable.category, query.data.category));
  }
  if (query.data.lowStock) {
    conditions.push(eq(productsTable.active, true));
  }

  let products = await db
    .select()
    .from(productsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(productsTable.name);
  if (query.data.lowStock) {
    products = products.filter((product) => product.stock - product.reservedStock <= product.minStock);
  }
  res.json(ListProductsResponse.parse(products));
});

router.post(
  "/products",
  requireRole("owner", "manager", "inventory"),
  async (req, res): Promise<void> => {
    const parsed = CreateProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const member = getMember(res);
    const [product] = await db.transaction(async (tx) => {
      if (parsed.data.taxRateId) {
        const [rate] = await tx.select().from(taxRatesTable).where(eq(taxRatesTable.id, parsed.data.taxRateId));
        if (!rate) throw new AppError(400, "El impuesto seleccionado no existe.");
      }
      if (parsed.data.productType === "service" && parsed.data.stock !== 0) {
        throw new AppError(400, "Los servicios no llevan existencia física.");
      }
      const [created] = await tx
        .insert(productsTable)
        .values({ ...parsed.data, sku: parsed.data.sku?.trim() || null, barcode: parsed.data.barcode?.trim() || null })
        .returning();
      if (created.stock !== 0) {
        await tx.insert(inventoryAdjustmentsTable).values({
          productId: created.id,
          quantityChange: created.stock,
          reason: "correction",
          note: "Existencia inicial",
          createdBy: member.id,
        });
      }
      const value = Math.round(created.cost * created.stock * 100) / 100;
      if (created.productType !== "service" && value > 0) {
        await ensureSystemAccounts(tx);
        await postJournalEntry(tx, {
          date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date()),
          description: `Inventario inicial · ${created.name}`, source: "opening_inventory",
          sourceId: created.id, createdBy: member.id,
          lines: [
            { accountId: await systemAccountId(tx, "inventory"), debit: value, credit: 0 },
            { accountId: await systemAccountId(tx, "equity"), debit: 0, credit: value },
          ],
        });
      }
      await tx.insert(auditLogTable).values({
        actorId: member.id, action: "create", entity: "product", entityId: created.id,
        details: created.name,
      });
      return [created];
    });
    res.status(201).json(CreateProductResponse.parse(product));
  },
);

router.patch(
  "/products/:productId",
  requireRole("owner", "manager", "inventory"),
  async (req, res): Promise<void> => {
    const params = UpdateProductParams.safeParse(req.params);
    const parsed = UpdateProductBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const product = await db.transaction(async tx => {
      const [previous] = await tx.select().from(productsTable)
        .where(eq(productsTable.id, params.data.productId));
      if (!previous) return undefined;
      if (parsed.data.productType && parsed.data.productType !== previous.productType && previous.stock !== 0) {
        throw new AppError(400, "No se puede cambiar el tipo de un artículo con existencia.");
      }
      if (parsed.data.taxRateId) {
        const [rate] = await tx.select().from(taxRatesTable).where(eq(taxRatesTable.id, parsed.data.taxRateId));
        if (!rate) throw new AppError(400, "El impuesto seleccionado no existe.");
      }
      const delta = Math.round(((parsed.data.cost ?? previous.cost) - previous.cost) * previous.stock * 100) / 100;
      if (delta !== 0 && previous.productType !== "service") {
        await ensureSystemAccounts(tx);
        await postJournalEntry(tx, {
          date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date()),
          description: `Revaluación de costo · ${previous.name}`, source: "revaluation",
          sourceId: previous.id, createdBy: getMember(res).id,
          lines: [
            { accountId: await systemAccountId(tx, "inventory"), debit: Math.max(delta, 0), credit: Math.max(-delta, 0) },
            { accountId: await systemAccountId(tx, "generalExpense"), debit: Math.max(-delta, 0), credit: Math.max(delta, 0) },
          ],
        });
      }
      const [updated] = await tx.update(productsTable)
        .set({ ...parsed.data,
          ...(parsed.data.sku !== undefined ? { sku: parsed.data.sku?.trim() || null } : {}),
          ...(parsed.data.barcode !== undefined ? { barcode: parsed.data.barcode?.trim() || null } : {}),
          updatedAt: new Date(),
        }).where(eq(productsTable.id, previous.id)).returning();
      await tx.insert(auditLogTable).values({
        actorId: getMember(res).id, action: "update", entity: "product", entityId: previous.id,
        details: previous.name,
      });
      return updated;
    });
    if (!product) {
      res.status(404).json({ error: "No encontramos ese producto." });
      return;
    }
    res.json(UpdateProductResponse.parse(product));
  },
);

export default router;
