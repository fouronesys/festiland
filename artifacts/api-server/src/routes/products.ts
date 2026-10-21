import { and, eq, ilike, or } from "drizzle-orm";
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
} from "@workspace/db";
import { getMember, requireRole } from "../middlewares/festilandAuth";

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
    products = products.filter((product) => product.stock <= product.minStock);
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
      const [created] = await tx
        .insert(productsTable)
        .values(parsed.data)
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
    const [product] = await db
      .update(productsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(productsTable.id, params.data.productId))
      .returning();
    if (!product) {
      res.status(404).json({ error: "No encontramos ese producto." });
      return;
    }
    res.json(UpdateProductResponse.parse(product));
  },
);

export default router;
