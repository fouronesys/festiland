import { clerkClient } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  InviteTeamMemberBody,
  InviteTeamMemberResponse,
  ListTeamResponse,
  UpdateTeamRoleBody,
  UpdateTeamRoleParams,
  UpdateTeamRoleResponse,
} from "@workspace/api-zod";
import { db, teamMembersTable, auditLogTable } from "@workspace/db";
import { asTeamUser, getMember, requireRole } from "../middlewares/festilandAuth";
import { AppError } from "../lib/appError";

const router: IRouter = Router();

router.get("/me", (_req, res): void => {
  res.json(asTeamUser(getMember(res)));
});

router.get(
  "/team",
  requireRole("owner", "manager"),
  async (_req, res): Promise<void> => {
    const members = await db
      .select()
      .from(teamMembersTable)
      .orderBy(teamMembersTable.name);
    res.json(ListTeamResponse.parse(members.map(asTeamUser)));
  },
);

router.patch(
  "/team/:userId/role",
  requireRole("owner"),
  async (req, res): Promise<void> => {
    const params = UpdateTeamRoleParams.safeParse(req.params);
    const body = UpdateTeamRoleBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const actor = getMember(res);
    if (params.data.userId === actor.id && body.data.active === false) {
      res.status(400).json({ error: "No puedes desactivar tu propia cuenta." });
      return;
    }
    const updated = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(6802419)`);
      const [target] = await tx
        .select()
        .from(teamMembersTable)
        .where(eq(teamMembersTable.id, params.data.userId))
        .limit(1);
      if (target?.role === "owner" && target.active &&
        (body.data.role !== "owner" || body.data.active === false)) {
        const otherOwners = await tx
          .select({ id: teamMembersTable.id })
          .from(teamMembersTable)
          .where(and(eq(teamMembersTable.role, "owner"), eq(teamMembersTable.active, true)));
        if (otherOwners.length <= 1) {
          throw new AppError(400, "Debe quedar al menos un usuario activo con rol propietario.");
        }
      }

    const [row] = await tx
      .update(teamMembersTable)
      .set({
        role: body.data.role,
        ...(body.data.active === undefined ? {} : { active: body.data.active }),
      })
      .where(eq(teamMembersTable.id, params.data.userId))
      .returning();
    if (row) await tx.insert(auditLogTable).values({
      actorId: actor.id, action: "change_role", entity: "team", entityId: row.id,
      details: `${row.role} · ${row.active ? "activo" : "inactivo"}`,
    });
    return row;
    });
    if (!updated) {
      res.status(404).json({ error: "No encontramos a esa persona del equipo." });
      return;
    }
    res.json(UpdateTeamRoleResponse.parse(asTeamUser(updated)));
  },
);

router.post(
  "/team/invitations",
  requireRole("owner", "manager"),
  async (req, res): Promise<void> => {
    const parsed = InviteTeamMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actor = getMember(res);
    if (parsed.data.role === "owner" && actor.role !== "owner") {
      res.status(403).json({ error: "Sólo un propietario puede invitar a otro propietario." });
      return;
    }
    const client = clerkClient;
    await client.invitations.createInvitation({
      emailAddress: parsed.data.email,
      publicMetadata: { role: parsed.data.role, festilandAccess: "staff" },
    });
    res.status(201).json(
      InviteTeamMemberResponse.parse({
        email: parsed.data.email,
        role: parsed.data.role,
        status: "invitation_sent",
      }),
    );
  },
);

export default router;
