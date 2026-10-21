import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateSettlementBody,
  CreateSettlementResponse,
  ListSettlementsQueryParams,
  ListSettlementsResponse,
} from "@workspace/api-zod";
import { auditLogTable, contactsTable, db, settlementsTable } from "@workspace/db";
import { contactBalance } from "../lib/contactBalances";
import { ensureSystemAccounts, postJournalEntry, systemAccountId } from "../lib/accounting";
import { getMember, requireRole } from "../middlewares/festilandAuth";

const router: IRouter = Router();

router.get("/settlements", requireRole("owner", "manager", "accountant"), async (req, res): Promise<void> => {
  const params = ListSettlementsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db.select({
    id: settlementsTable.id,
    direction: settlementsTable.direction,
    contactId: settlementsTable.contactId,
    contactName: contactsTable.name,
    amount: settlementsTable.amount,
    paymentMethod: settlementsTable.paymentMethod,
    note: settlementsTable.note,
    createdAt: settlementsTable.createdAt,
  }).from(settlementsTable)
    .innerJoin(contactsTable, eq(contactsTable.id, settlementsTable.contactId))
    .where(params.data.direction ? eq(settlementsTable.direction, params.data.direction) : undefined)
    .orderBy(desc(settlementsTable.createdAt)).limit(200);
  res.json(ListSettlementsResponse.parse(rows));
});

router.post("/settlements", requireRole("owner", "manager", "accountant"), async (req, res): Promise<void> => {
  const parsed = CreateSettlementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const actor = getMember(res);
  const result = await db.transaction(async (tx) => {
    const kind = input.direction === "receivable" ? "customer" : "supplier";
    const [contact] = await tx.select().from(contactsTable)
      .where(and(eq(contactsTable.id, input.contactId), eq(contactsTable.kind, kind)))
      .for("update");
    if (!contact) return { error: "Selecciona un contacto válido." };
    const balance = await contactBalance(tx, contact.id, kind);
    const amount = Math.round(input.amount * 100) / 100;
    if (amount <= 0 || amount > balance) {
      return { error: `El importe debe ser positivo y no superar el saldo pendiente (${balance.toFixed(2)} DOP).` };
    }
    const [settlement] = await tx.insert(settlementsTable).values({
      ...input, amount, createdBy: actor.id,
    }).returning();
    await ensureSystemAccounts(tx);
    const paymentAccount = await systemAccountId(tx, input.paymentMethod === "cash" ? "cash" : "bank");
    const balanceAccount = await systemAccountId(tx, input.direction);
    const incoming = input.direction === "receivable";
    await postJournalEntry(tx, {
      date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date()),
      description: `${incoming ? "Cobro a cliente" : "Pago a proveedor"} · ${contact.name}`,
      source: "settlement", sourceId: settlement.id, createdBy: actor.id,
      lines: [
        { accountId: incoming ? paymentAccount : balanceAccount, debit: amount, credit: 0 },
        { accountId: incoming ? balanceAccount : paymentAccount, debit: 0, credit: amount },
      ],
    });
    await tx.insert(auditLogTable).values({
      actorId: actor.id, action: "create", entity: "settlement", entityId: settlement.id,
      details: `${input.direction}: ${amount.toFixed(2)} DOP`,
    });
    return { settlement: { ...settlement, contactName: contact.name } };
  });
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json(CreateSettlementResponse.parse(result.settlement));
});

export default router;
