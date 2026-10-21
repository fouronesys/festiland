import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateTeamAccountBody, ListTeamResponse, ResetTeamPasswordBody, ResetTeamPasswordParams,
  UpdateTeamRoleBody, UpdateTeamRoleParams, UpdateTeamRoleResponse,
} from "@workspace/api-zod";
import { db, teamMembersTable, auditLogTable, localCredentialsTable, localSessionsTable } from "@workspace/db";
import { asTeamUser, getMember, requireRole } from "../middlewares/festilandAuth";
import { normalizeEmail } from "../lib/localAuth";
import { hashPassword } from "../lib/passwords";
import { AppError } from "../lib/appError";

const router: IRouter = Router();
const managerRoles = ["cashier", "inventory", "accountant"];

router.get("/me", (_req, res) => { res.json(asTeamUser(getMember(res))); });
router.get("/team", requireRole("owner", "manager"), async (_req, res) => {
  const rows = await db.select({ member: teamMembersTable, localId: localCredentialsTable.userId, mustChange: localCredentialsTable.mustChangePassword })
    .from(teamMembersTable).leftJoin(localCredentialsTable, eq(localCredentialsTable.userId, teamMembersTable.id))
    .orderBy(teamMembersTable.name);
  res.json(ListTeamResponse.parse(rows.map(row => asTeamUser({
    ...row.member, hasLocalLogin: !!row.localId, mustChangePassword: row.mustChange ?? false,
  }))));
});

router.patch("/team/:userId/role", requireRole("owner"), async (req, res): Promise<void> => {
  const params = UpdateTeamRoleParams.safeParse(req.params);
  const body = UpdateTeamRoleBody.safeParse(req.body);
  if (!params.success || !body.success) throw new AppError(400, "Revisa el usuario y el rol.");
  const actor = getMember(res);
  if (params.data.userId === actor.id && body.data.active === false) throw new AppError(400, "No puedes desactivar tu propia cuenta.");
  const updated = await db.transaction(async tx => {
    const [target] = await tx.select().from(teamMembersTable).where(eq(teamMembersTable.id, params.data.userId));
    if (!target) throw new AppError(404, "No encontramos a esa persona del equipo.");
    const [credentials] = await tx.select().from(localCredentialsTable).where(eq(localCredentialsTable.userId, target.id));
    if (credentials && target.role === "owner" && target.active && (body.data.role !== "owner" || body.data.active === false)) {
      const owners = await tx.select({ id: teamMembersTable.id }).from(teamMembersTable)
        .innerJoin(localCredentialsTable, eq(localCredentialsTable.userId, teamMembersTable.id))
        .where(and(eq(teamMembersTable.role, "owner"), eq(teamMembersTable.active, true)));
      if (owners.length <= 1) throw new AppError(400, "Debe quedar al menos un propietario activo.");
    }
    const [row] = await tx.update(teamMembersTable).set(body.data).where(eq(teamMembersTable.id, target.id)).returning();
    await tx.delete(localSessionsTable).where(eq(localSessionsTable.userId, target.id));
    await tx.insert(auditLogTable).values({
      actorId: actor.id, action: "change_role", entity: "team", entityId: target.id,
      details: `${row.role} · ${row.active ? "activo" : "inactivo"}; sesiones revocadas`,
    });
    return asTeamUser({ ...row, hasLocalLogin: !!credentials, mustChangePassword: credentials?.mustChangePassword ?? false });
  });
  res.json(UpdateTeamRoleResponse.parse(updated));
});

router.post("/team/accounts", requireRole("owner", "manager"), async (req, res): Promise<void> => {
  const body = CreateTeamAccountBody.safeParse(req.body);
  if (!body.success) throw new AppError(400, "Completa nombre, correo, rol y contraseña temporal de al menos 12 caracteres.");
  const actor = getMember(res);
  if (actor.role !== "owner" && !managerRoles.includes(body.data.role)) throw new AppError(403, "El gerente sólo puede crear cajeros, inventario y contables.");
  if (!body.data.name.trim()) throw new AppError(400, "Escribe el nombre del integrante.");
  const email = normalizeEmail(body.data.email);
  const passwordHash = await hashPassword(body.data.temporaryPassword);
  const member = await db.transaction(async tx => {
    const [existing] = await tx.select().from(teamMembersTable).where(eq(sql<string>`lower(${teamMembersTable.email})`, email));
    if (existing) throw new AppError(409, "Este correo ya pertenece al equipo. Usa Restablecer contraseña.");
    const [created] = await tx.insert(teamMembersTable).values({
      id: `local_${randomUUID()}`, email, name: body.data.name.trim(), role: body.data.role, active: true,
    }).returning();
    await tx.insert(localCredentialsTable).values({ userId: created.id, email, passwordHash, mustChangePassword: true });
    await tx.insert(auditLogTable).values({
      actorId: actor.id, action: "create_account", entity: "team", entityId: created.id, details: `Cuenta local · ${created.role}`,
    });
    return created;
  });
  res.status(201).json(asTeamUser({ ...member, hasLocalLogin: true, mustChangePassword: true }));
});

router.post("/team/:userId/password", requireRole("owner", "manager"), async (req, res): Promise<void> => {
  const params = ResetTeamPasswordParams.safeParse(req.params);
  const body = ResetTeamPasswordBody.safeParse(req.body);
  if (!params.success || !body.success) throw new AppError(400, "Indica un usuario y una contraseña temporal de al menos 12 caracteres.");
  const actor = getMember(res);
  if (params.data.userId === actor.id) throw new AppError(400, "Cambia tu propia contraseña desde Preferencias.");
  const passwordHash = await hashPassword(body.data.temporaryPassword);
  await db.transaction(async tx => {
    const [target] = await tx.select().from(teamMembersTable).where(eq(teamMembersTable.id, params.data.userId));
    if (!target) throw new AppError(404, "No encontramos ese usuario.");
    if (actor.role !== "owner" && !managerRoles.includes(target.role)) throw new AppError(403, "No puedes restablecer la contraseña de un propietario o gerente.");
    await tx.insert(localCredentialsTable).values({
      userId: target.id, email: normalizeEmail(target.email), passwordHash, mustChangePassword: true,
    }).onConflictDoUpdate({ target: localCredentialsTable.userId, set: { passwordHash, mustChangePassword: true, updatedAt: new Date() } });
    await tx.delete(localSessionsTable).where(eq(localSessionsTable.userId, target.id));
    await tx.insert(auditLogTable).values({
      actorId: actor.id, action: "password_reset", entity: "team", entityId: target.id,
      details: "Contraseña temporal asignada; sesiones revocadas",
    });
  });
  res.json({ message: "Contraseña temporal asignada. El usuario deberá cambiarla al entrar." });
});

export default router;
