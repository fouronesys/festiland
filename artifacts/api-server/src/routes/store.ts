import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetStoreSettingsResponse, UpdateStoreSettingsBody, UpdateStoreSettingsResponse,
  ListCashSessionsResponse, OpenCashSessionBody, OpenCashSessionResponse,
  CloseCashSessionBody, CloseCashSessionParams, CloseCashSessionResponse,
  ListAuditLogResponse,
} from "@workspace/api-zod";
import {
  auditLogTable, cashSessionsTable, db, journalEntriesTable, journalLinesTable,
  storeSettingsTable, teamMembersTable,
} from "@workspace/db";
import { getMember, requireRole } from "../middlewares/festilandAuth";
import { ensureSystemAccounts, systemAccountId, type DbTx } from "../lib/accounting";
import { automaticLockedThrough, localAccountingDate } from "../lib/accounting-periods";
import { AppError } from "../lib/appError";

const router: IRouter = Router();
const round = (amount: number) => Math.round(amount * 100) / 100;
const accountingPeriodKeys = ["accountingPeriodStart", "accountingPeriodEnd"] as const;
const isCalendarDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

function storeSettingsResponse(row: typeof storeSettingsTable.$inferSelect) {
  const today = localAccountingDate();
  return {
    ...row,
    automaticLockedThrough: automaticLockedThrough(row.accountingPeriodStart, row.accountingPeriodEnd, today),
  };
}

async function settings(tx: DbTx) {
  await tx.insert(storeSettingsTable).values({ id: "main" }).onConflictDoNothing();
  const [row] = await tx.select().from(storeSettingsTable).where(eq(storeSettingsTable.id, "main"));
  return row;
}

router.get("/store-settings", async (_req, res) => {
  res.json(GetStoreSettingsResponse.parse(storeSettingsResponse(await settings(db))));
});

router.patch("/store-settings", requireRole("owner", "manager", "accountant"), async (req, res): Promise<void> => {
  const body = UpdateStoreSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const actor = getMember(res);
  const today = localAccountingDate();
  const updatesPeriod = accountingPeriodKeys.some(key => key in body.data);
  const updatesLock = "lockedThrough" in body.data;
  const accountingKeys = new Set<string>(["lockedThrough", ...accountingPeriodKeys]);
  if (actor.role === "accountant" && Object.keys(body.data).some(key => !accountingKeys.has(key))) {
    throw new AppError(403, "El contable sólo puede modificar el cierre de períodos.");
  }
  if ((updatesLock || updatesPeriod) && !["owner", "accountant"].includes(actor.role)) {
    throw new AppError(403, "Sólo el propietario o contable puede cerrar períodos.");
  }
  const date = body.data.lockedThrough;
  if (date && (date > today || !isCalendarDate(date))) {
    throw new AppError(400, "El cierre debe ser una fecha válida, no posterior a hoy.");
  }
  const saved = await db.transaction(async tx => {
    const current = await settings(tx);
    let updateValues = { ...body.data };
    let archivedEnd: string | null = null;
    if (updatesPeriod) {
      const start = "accountingPeriodStart" in body.data
        ? body.data.accountingPeriodStart ?? null
        : current.accountingPeriodStart;
      const end = "accountingPeriodEnd" in body.data
        ? body.data.accountingPeriodEnd ?? null
        : current.accountingPeriodEnd;
      if ((start === null) !== (end === null)) {
        throw new AppError(400, "Define el inicio y el fin del período, o deja ambos vacíos.");
      }
      if ((start && !isCalendarDate(start)) || (end && !isCalendarDate(end))) {
        throw new AppError(400, "Las fechas del período no son válidas.");
      }
      if (start && end && start > end) {
        throw new AppError(400, "El inicio del período debe ser anterior o igual al cierre.");
      }

      const changed = start !== current.accountingPeriodStart || end !== current.accountingPeriodEnd;
      const currentPeriodEnded = current.accountingPeriodEnd && current.accountingPeriodEnd < today;
      if (changed && currentPeriodEnded) {
        if (actor.role !== "owner") {
          throw new AppError(403, "Sólo el propietario puede cambiar un período ya cerrado.");
        }
        archivedEnd = current.accountingPeriodEnd;
        const preservedLock = [current.lockedThrough, archivedEnd]
          .filter((value): value is string => !!value)
          .sort()
          .at(-1);
        if (preservedLock) updateValues = { ...updateValues, lockedThrough: preservedLock };
      }
    }
    if (current.lockedThrough && "lockedThrough" in body.data
      && (!date || date < current.lockedThrough) && actor.role !== "owner") {
      throw new AppError(403, "Sólo el propietario puede reabrir un período.");
    }
    const [row] = await tx.update(storeSettingsTable).set(updateValues)
      .where(eq(storeSettingsTable.id, "main")).returning();
    await tx.insert(auditLogTable).values({
      actorId: actor.id, action: "update", entity: "settings", entityId: "main",
      details: updatesPeriod
        ? `Período contable ${row.accountingPeriodStart ?? "sin inicio"} a ${row.accountingPeriodEnd ?? "sin fin"}${archivedEnd ? `; rango anterior ${current.accountingPeriodStart ?? "sin inicio"} a ${archivedEnd} preservado como cerrado` : ""}`
        : updatesLock ? `Cierre hasta ${date ?? "sin bloqueo"}` : "Datos del comercio actualizados",
    });
    return row;
  });
  res.json(UpdateStoreSettingsResponse.parse(storeSettingsResponse(saved)));
});

async function expectedCash(tx: DbTx, session: typeof cashSessionsTable.$inferSelect) {
  if (session.closedAt && session.expectedAmount !== null) return session.expectedAmount;
  await ensureSystemAccounts(tx);
  const cashId = await systemAccountId(tx, "cash");
  const [movement] = await tx.select({
    net: sql<number>`COALESCE(SUM(${journalLinesTable.debit} - ${journalLinesTable.credit}), 0)`,
  }).from(journalLinesTable)
    .innerJoin(journalEntriesTable, eq(journalEntriesTable.id, journalLinesTable.entryId))
    .where(and(
      eq(journalLinesTable.accountId, cashId),
      eq(journalEntriesTable.createdBy, session.userId),
      gte(journalEntriesTable.createdAt, session.openedAt),
    ));
  return round(session.openingAmount + Number(movement.net));
}

router.get("/cash-sessions", requireRole("owner", "manager", "cashier"), async (_req, res) => {
  const rows = await db.select().from(cashSessionsTable)
    .where(eq(cashSessionsTable.userId, getMember(res).id))
    .orderBy(desc(cashSessionsTable.openedAt)).limit(30);
  res.json(ListCashSessionsResponse.parse(await Promise.all(rows.map(async row => ({
    ...row, expectedAmount: await expectedCash(db, row),
  })))));
});

router.post("/cash-sessions", requireRole("owner", "manager", "cashier"), async (req, res): Promise<void> => {
  const body = OpenCashSessionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const actor = getMember(res);
  const row = await db.transaction(async tx => {
    const [active] = await tx.select().from(cashSessionsTable)
      .where(and(eq(cashSessionsTable.userId, actor.id), isNull(cashSessionsTable.closedAt)));
    if (active) throw new AppError(409, "Ya tienes una caja abierta. Ciérrala antes de abrir otra.");
    const [created] = await tx.insert(cashSessionsTable).values({
      userId: actor.id, openingAmount: round(body.data.openingAmount), openedAt: new Date(),
    }).returning();
    await tx.insert(auditLogTable).values({
      actorId: actor.id, action: "open", entity: "cash_session", entityId: created.id,
      details: `Apertura: ${created.openingAmount.toFixed(2)} DOP`,
    });
    return created;
  });
  res.status(201).json(OpenCashSessionResponse.parse({ ...row, expectedAmount: row.openingAmount }));
});

router.post("/cash-sessions/:sessionId/close", requireRole("owner", "manager", "cashier"), async (req, res): Promise<void> => {
  const params = CloseCashSessionParams.safeParse(req.params);
  const body = CloseCashSessionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Revisa el conteo y el identificador de caja." });
    return;
  }
  const actor = getMember(res);
  const saved = await db.transaction(async tx => {
    const [session] = await tx.select().from(cashSessionsTable)
      .where(and(eq(cashSessionsTable.id, params.data.sessionId), eq(cashSessionsTable.userId, actor.id)));
    if (!session) throw new AppError(404, "No encontramos tu caja.");
    if (session.closedAt) throw new AppError(409, "Esta caja ya está cerrada.");
    const expectedAmount = await expectedCash(tx, session);
    const countedAmount = round(body.data.countedAmount);
    const [closed] = await tx.update(cashSessionsTable).set({
      closedAt: new Date(), expectedAmount, countedAmount,
      difference: round(countedAmount - expectedAmount), note: body.data.note ?? null,
    }).where(eq(cashSessionsTable.id, session.id)).returning();
    await tx.insert(auditLogTable).values({
      actorId: actor.id, action: "close", entity: "cash_session", entityId: session.id,
      details: `Esperado ${expectedAmount.toFixed(2)}, contado ${countedAmount.toFixed(2)}, diferencia ${closed.difference?.toFixed(2)} DOP`,
    });
    return closed;
  });
  res.json(CloseCashSessionResponse.parse(saved));
});

router.get("/audit-log", requireRole("owner", "manager", "accountant"), async (_req, res) => {
  const events = await db.select({
    id: auditLogTable.id, actorName: teamMembersTable.name, action: auditLogTable.action,
    entity: auditLogTable.entity, details: auditLogTable.details, createdAt: auditLogTable.createdAt,
  }).from(auditLogTable).innerJoin(teamMembersTable, eq(teamMembersTable.id, auditLogTable.actorId))
    .orderBy(desc(auditLogTable.createdAt)).limit(200);
  res.json(ListAuditLogResponse.parse(events));
});

export default router;
