import { clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  InviteTeamMemberBody,
  InviteTeamMemberResponse,
  ListTeamResponse,
  UpdateTeamRoleBody,
  UpdateTeamRoleParams,
  UpdateTeamRoleResponse,
} from "@workspace/api-zod";
import { db, teamMembersTable } from "@workspace/db";
import { asTeamUser, getMember, requireRole } from "../middlewares/festilandAuth";

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
    if (body.data.role !== "owner") {
      const [target] = await db
        .select()
        .from(teamMembersTable)
        .where(eq(teamMembersTable.id, params.data.userId))
        .limit(1);
      if (target?.role === "owner" && target.active) {
        const otherOwners = await db
          .select({ id: teamMembersTable.id })
          .from(teamMembersTable)
          .where(eq(teamMembersTable.role, "owner"));
        if (otherOwners.length <= 1 && target.id === actor.id) {
          res.status(400).json({ error: "Debe quedar al menos un usuario con rol propietario." });
          return;
        }
      }
    }

    const [updated] = await db
      .update(teamMembersTable)
      .set({
        role: body.data.role,
        ...(body.data.active === undefined ? {} : { active: body.data.active }),
      })
      .where(eq(teamMembersTable.id, params.data.userId))
      .returning();
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
      publicMetadata: { role: parsed.data.role },
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
