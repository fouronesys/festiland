import type { RequestHandler } from "express";
import { readLocalSession, type LocalMember } from "../lib/localAuth";

export type AppRole = "owner" | "manager" | "cashier" | "inventory" | "accountant";

export const requireMember: RequestHandler = async (req, res, next) => {
  try {
    const member = await readLocalSession(req);
    if (!member) {
      res.status(401).json({ error: "Inicia sesión para continuar." });
      return;
    }
    res.locals.member = member;
    if (member.mustChangePassword && !["/me", "/auth/change-password"].includes(req.path)) {
      res.status(403).json({ error: "Cambia tu contraseña temporal antes de continuar.", code: "PASSWORD_CHANGE_REQUIRED" });
      return;
    }
    next();
  } catch (error) { next(error); }
};

export function requireRole(...roles: AppRole[]): RequestHandler {
  return (_req, res, next) => {
    const member = res.locals.member as LocalMember | undefined;
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

export function getMember(res: Parameters<RequestHandler>[1]): LocalMember {
  if (!res.locals.member) throw new Error("No hay una sesión de empleado.");
  return res.locals.member as LocalMember;
}

export function asTeamUser(member: typeof import("@workspace/db").teamMembersTable.$inferSelect & {
  hasLocalLogin?: boolean; mustChangePassword?: boolean;
}) {
  return {
    id: member.id, email: member.email, name: member.name, role: member.role as AppRole, active: member.active,
    hasLocalLogin: member.hasLocalLogin ?? false, mustChangePassword: member.mustChangePassword ?? false,
  };
}
