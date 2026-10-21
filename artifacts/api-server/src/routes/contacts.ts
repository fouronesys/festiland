import { and, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateCustomerBody,
  CreateCustomerResponse,
  CreateSupplierBody,
  CreateSupplierResponse,
  ListCustomersQueryParams,
  ListCustomersResponse,
  ListSuppliersQueryParams,
  ListSuppliersResponse,
} from "@workspace/api-zod";
import { contactsTable, db } from "@workspace/db";
import { requireRole } from "../middlewares/festilandAuth";
import { contactBalance } from "../lib/contactBalances";

const router: IRouter = Router();

async function listContacts(kind: "customer" | "supplier", search?: string) {
  const trimmed = search?.trim();
  const filters = [eq(contactsTable.kind, kind)];
  if (trimmed) {
    filters.push(
      or(
        ilike(contactsTable.name, `%${trimmed}%`),
        ilike(contactsTable.email, `%${trimmed}%`),
        ilike(contactsTable.phone, `%${trimmed}%`),
      )!,
    );
  }
  const contacts = await db
    .select()
    .from(contactsTable)
    .where(and(...filters))
    .orderBy(contactsTable.name);
  return Promise.all(contacts.map(async (contact) => ({
    ...contact,
    balance: await contactBalance(db, contact.id, kind),
  })));
}

router.get("/customers", async (req, res): Promise<void> => {
  const query = ListCustomersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  res.json(ListCustomersResponse.parse(await listContacts("customer", query.data.search)));
});

router.post(
  "/customers",
  requireRole("owner", "manager", "cashier"),
  async (req, res): Promise<void> => {
    const parsed = CreateCustomerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [contact] = await db
      .insert(contactsTable)
      .values({ ...parsed.data, kind: "customer" })
      .returning();
    res.status(201).json(
      CreateCustomerResponse.parse({ ...contact, balance: contact.openingBalance }),
    );
  },
);

router.get("/suppliers", requireRole("owner", "manager", "inventory", "accountant"), async (req, res): Promise<void> => {
  const query = ListSuppliersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  res.json(ListSuppliersResponse.parse(await listContacts("supplier", query.data.search)));
});

router.post(
  "/suppliers",
  requireRole("owner", "manager", "inventory", "accountant"),
  async (req, res): Promise<void> => {
    const parsed = CreateSupplierBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [contact] = await db
      .insert(contactsTable)
      .values({ ...parsed.data, kind: "supplier" })
      .returning();
    res.status(201).json(
      CreateSupplierResponse.parse({ ...contact, balance: contact.openingBalance }),
    );
  },
);

export default router;
