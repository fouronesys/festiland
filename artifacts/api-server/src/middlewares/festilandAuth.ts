import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { eq, sql } from "drizzle-orm";
import { db, teamMembersTable } from "@workspace/db";
import { AppError } from "../lib/appError";

export type AppRole =
  | "owner"
  | "manager"
  | "cashier"
  | "inventory"
  | "accountant";

type TeamMember = typeof teamMembersTable.$inferSelect;

async function provisionMember(userId: string): Promise<TeamMember | null> {
  const client = clerkClient;
  const identity = await client.users.getUser(userId);
  const primaryEmail =
    identity.emailAddresses.find((item) => item.id === identity.primaryEmailAddressId)
      ?? identity.emailAddresses[0];
  const email = primaryEmail?.emailAddress;

  if (!email) {
    throw new Error("La cuenta no tiene un correo disponible.");
  }

  const name =
    [identity.firstName, identity.lastName].filter(Boolean).join(" ") ||
    identity.username ||
    email;
  const invitedRole = identity.publicMetadata.role;
  const allowedRoles: AppRole[] = [
    "owner",
    "manager",
    "cashier",
    "inventory",
    "accountant",
  ];
  const ownerEmail = process.env.FESTILAND_OWNER_EMAIL?.trim().toLowerCase();
  const isConfiguredOwner = !!ownerEmail && email.toLowerCase() === ownerEmail;
  const invited = identity.publicMetadata.festilandAccess === "staff"
    && allowedRoles.includes(invitedRole as AppRole);
  if ((!isConfiguredOwner && !invited) || primaryEmail?.verification?.status !== "verified") {
    throw new AppError(403, "Acceso pendiente. El propietario debe autorizar tu correo o enviarte una invitación.");
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(6802419)`);
    const [existing] = await tx
      .select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.id, userId))
      .limit(1);

    if (existing) {
      await tx
        .update(teamMembersTable)
        .set({ email, name })
        .where(eq(teamMembersTable.id, userId));
      return;
    }

    await tx.insert(teamMembersTable).values({
      id: userId,
      email,
      name,
      role: isConfiguredOwner ? "owner" : (invitedRole as AppRole),
      active: true,
    });
  });

  const [member] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.id, userId))
    .limit(1);
  return member ?? null;
}

export const requireMember: RequestHandler = async (req, res, next) => {
  try {
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Inicia sesión para continuar." });
      return;
    }

    let member: TeamMember | undefined = (
      await db
        .select()
        .from(teamMembersTable)
        .where(eq(teamMembersTable.id, userId))
        .limit(1)
    )[0];

    if (!member) {
      member = (await provisionMember(userId)) ?? undefined;
    }

    if (!member || !member.active) {
      res.status(403).json({ error: "Tu acceso al comercio está desactivado." });
      return;
    }

    res.locals.member = member;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(...roles: AppRole[]): RequestHandler {
  return (_req, res, next) => {
    const member = res.locals.member as TeamMember | undefined;
    if (!member) {
      res.status(401).json({ error: "Inicia sesión para continuar." });
      return;
    }
    if (!roles.includes(member.role as AppRole)) {
      res.status(403).json({ error: "No tienes permiso para esta acción." });
      return;
    }
    next();
  };
}

export function getMember(res: Parameters<RequestHandler>[1]): TeamMember {
  const member = res.locals.member as TeamMember | undefined;
  if (!member) throw new Error("No hay una sesión de empleado en la solicitud.");
  return member;
}

export function asTeamUser(member: TeamMember) {
  return {
    id: member.id,
    email: member.email,
    name: member.name,
    role: member.role as AppRole,
    active: member.active,
  };
}
