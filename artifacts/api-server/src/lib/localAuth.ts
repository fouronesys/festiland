import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  authBootstrapTable, db, localCredentialsTable, localSessionsTable,
  loginAttemptsTable, teamMembersTable,
} from "@workspace/db";
import { AppError } from "./appError";
import { hashPassword } from "./passwords";

export type AuthDb = Pick<typeof db, "select" | "insert" | "update" | "delete" | "run">;
export type LocalMember = typeof teamMembersTable.$inferSelect & {
  hasLocalLogin: boolean; mustChangePassword: boolean; sessionHash?: string;
};
export const SESSION_COOKIE = "festiland_session";
const SESSION_DAYS = 7;
const IDLE_MS = 12 * 60 * 60 * 1000;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function tokenHash(req: Request): string | null {
  const cookie: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof cookie === "string" && /^[a-f0-9]{64}$/.test(cookie) ? digest(cookie) : null;
}

export async function createLocalSession(tx: AuthDb, userId: string) {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await tx.insert(localSessionsTable).values({ tokenHash: digest(rawToken), userId, expiresAt });
  await tx.delete(localSessionsTable).where(lt(localSessionsTable.expiresAt, new Date()));
  return rawToken;
}

const cookieOptions = () => ({
  httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/",
});
export function setSessionCookie(res: Response, rawToken: string) {
  res.cookie(SESSION_COOKIE, rawToken, { ...cookieOptions(), maxAge: SESSION_DAYS * 86400000 });
}
export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

export async function readLocalSession(req: Request): Promise<LocalMember | null> {
  const hash = tokenHash(req);
  if (!hash) return null;
  const [row] = await db.select({
    session: localSessionsTable, member: teamMembersTable, credentials: localCredentialsTable,
  }).from(localSessionsTable)
    .innerJoin(teamMembersTable, eq(teamMembersTable.id, localSessionsTable.userId))
    .innerJoin(localCredentialsTable, eq(localCredentialsTable.userId, localSessionsTable.userId))
    .where(eq(localSessionsTable.tokenHash, hash)).limit(1);
  if (!row) return null;
  const now = Date.now();
  if (!row.member.active || row.session.expiresAt.getTime() <= now || row.session.lastSeenAt.getTime() < now - IDLE_MS) {
    await db.delete(localSessionsTable).where(eq(localSessionsTable.tokenHash, hash));
    return null;
  }
  if (row.session.lastSeenAt.getTime() < now - 300000) {
    await db.update(localSessionsTable).set({ lastSeenAt: new Date() }).where(eq(localSessionsTable.tokenHash, hash));
  }
  return { ...row.member, hasLocalLogin: true, mustChangePassword: row.credentials.mustChangePassword, sessionHash: hash };
}

export async function hasLocalOwner() {
  const [owner] = await db.select({ id: teamMembersTable.id }).from(teamMembersTable)
    .innerJoin(localCredentialsTable, eq(localCredentialsTable.userId, teamMembersTable.id))
    .where(and(eq(teamMembersTable.role, "owner"), eq(teamMembersTable.active, true))).limit(1);
  return !!owner;
}

export async function bootstrapLocalOwner(): Promise<boolean> {
  const email = process.env.FESTILAND_OWNER_EMAIL;
  const password = process.env.FESTILAND_INITIAL_OWNER_PASSWORD;
  if (!email || !password) return false;
  const [done] = await db.select().from(authBootstrapTable).where(eq(authBootstrapTable.id, "owner"));
  if (done) return false; // Never reset a password or re-grant a revoked role on restart.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, "Configura un correo propietario válido.");
  const passwordHash = await hashPassword(password);
  return db.transaction(async tx => {
    const [alreadyDone] = await tx.select().from(authBootstrapTable).where(eq(authBootstrapTable.id, "owner"));
    if (alreadyDone) return false;
    const members = await tx.select().from(teamMembersTable).where(eq(sql<string>`lower(${teamMembersTable.email})`, normalizeEmail(email)));
    if (members.length > 1) throw new AppError(409, "Hay correos duplicados en el equipo; revisa la migración antes de inicializar.");
    let member = members[0];
    if (!member) {
      [member] = await tx.insert(teamMembersTable).values({
        id: `local_${randomUUID()}`, email: normalizeEmail(email), name: "Propietario", role: "owner", active: true,
      }).returning();
    }
    const [credentials] = await tx.select().from(localCredentialsTable).where(eq(localCredentialsTable.userId, member.id));
    if (!credentials) {
      await tx.insert(localCredentialsTable).values({
        userId: member.id, email: normalizeEmail(email), passwordHash, mustChangePassword: false,
      });
      await tx.update(teamMembersTable).set({ role: "owner", active: true }).where(eq(teamMembersTable.id, member.id));
    }
    await tx.insert(authBootstrapTable).values({ id: "owner", userId: member.id });
    return true;
  });
}

/** Local persistent counters keep protection effective across restarts. */
export async function consumeLoginAttempt(req: Request, email: string) {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const buckets = [
    { key: digest(`ip:${ip}`), limit: 40 },
    { key: digest(`account:${normalizeEmail(email)}`), limit: 10 },
  ].sort((a, b) => a.key.localeCompare(b.key));
  const allowed = await db.transaction(async tx => {
    for (const bucket of buckets) {
      const [current] = await tx.select().from(loginAttemptsTable).where(eq(loginAttemptsTable.key, bucket.key));
      if (current && current.resetAt.getTime() > Date.now() && current.attempts >= bucket.limit) return false;
      const expired = !current || current.resetAt.getTime() <= Date.now();
      await tx.insert(loginAttemptsTable).values({
        key: bucket.key, attempts: 1, resetAt: new Date(Date.now() + 900000),
      }).onConflictDoUpdate({ target: loginAttemptsTable.key, set: {
        attempts: expired ? 1 : current.attempts + 1,
        resetAt: expired ? new Date(Date.now() + 900000) : current.resetAt,
      } });
    }
    await tx.delete(loginAttemptsTable).where(lt(loginAttemptsTable.resetAt, new Date()));
    return true;
  });
  if (!allowed) throw new AppError(429, "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.");
}

export async function clearAccountAttempts(email: string) {
  await db.delete(loginAttemptsTable).where(eq(loginAttemptsTable.key, digest(`account:${normalizeEmail(email)}`)));
}
