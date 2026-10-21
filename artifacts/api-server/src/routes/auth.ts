import { and, eq, ne, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { ChangeOwnerEmailBody, ChangePasswordBody, GetAuthSessionResponse, LoginBody } from "@workspace/api-zod";
import { auditLogTable, db, localCredentialsTable, localSessionsTable, teamMembersTable } from "@workspace/db";
import {
  clearAccountAttempts, clearSessionCookie, consumeLoginAttempt, createLocalSession,
  hasLocalOwner, normalizeEmail, readLocalSession, setSessionCookie, tokenHash,
} from "../lib/localAuth";
import { hashPassword, verifyPassword } from "../lib/passwords";
import { AppError } from "../lib/appError";
import { asTeamUser, getMember, requireMember, requireRole } from "../middlewares/festilandAuth";
import { getSmtpConfiguration, sendLocalEmail } from "../lib/mailer";

const router: IRouter = Router();
const dummyHash = hashPassword("local-dummy-verification-not-a-login");

router.get("/auth/session", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const user = await readLocalSession(req);
  res.json(GetAuthSessionResponse.parse({ user: user ? asTeamUser(user) : null, setupRequired: !await hasLocalOwner() }));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) throw new AppError(400, "Introduce un correo y una contraseña válidos.");
  if (process.env.NODE_ENV === "production" && !req.secure) throw new AppError(400, "El acceso en producción requiere HTTPS.");
  const email = normalizeEmail(body.data.email);
  await consumeLoginAttempt(req, email);
  const [row] = await db.select({ member: teamMembersTable, credentials: localCredentialsTable })
    .from(localCredentialsTable).innerJoin(teamMembersTable, eq(teamMembersTable.id, localCredentialsTable.userId))
    .where(eq(localCredentialsTable.email, email)).limit(1);
  const valid = await verifyPassword(body.data.password, row?.credentials.passwordHash ?? await dummyHash);
  if (!row || !valid || !row.member.active) throw new AppError(401, "Correo o contraseña incorrectos.");
  const rawToken = await db.transaction(async tx => {
    const [current] = await tx.select().from(localCredentialsTable)
      .where(eq(localCredentialsTable.userId, row.member.id));
    if (!current || current.passwordHash !== row.credentials.passwordHash) throw new AppError(401, "Correo o contraseña incorrectos.");
    const oldHash = tokenHash(req);
    if (oldHash) await tx.delete(localSessionsTable).where(eq(localSessionsTable.tokenHash, oldHash));
    const token = await createLocalSession(tx, row.member.id);
    await tx.insert(auditLogTable).values({
      actorId: row.member.id, action: "login", entity: "auth", entityId: row.member.id, details: "Inicio de sesión local",
    });
    return token;
  });
  await clearAccountAttempts(email);
  setSessionCookie(res, rawToken);
  res.json({ user: asTeamUser({ ...row.member, hasLocalLogin: true, mustChangePassword: row.credentials.mustChangePassword }), setupRequired: false });
});

router.post("/auth/logout", async (req, res) => {
  const hash = tokenHash(req);
  if (hash) await db.delete(localSessionsTable).where(eq(localSessionsTable.tokenHash, hash));
  clearSessionCookie(res);
  res.json({ message: "Sesión cerrada." });
});

router.post("/auth/change-email", requireMember, requireRole("owner"), async (req, res) => {
  const input = ChangeOwnerEmailBody.safeParse(req.body);
  if (!input.success) throw new AppError(400, "Indica el correo nuevo y confirma tu contraseña actual.");
  const member = getMember(res);
  const email = normalizeEmail(input.data.newEmail);
  if (email === normalizeEmail(member.email)) throw new AppError(400, "El correo nuevo es igual al actual.");
  await consumeLoginAttempt(req, member.email);
  const [credential] = await db.select().from(localCredentialsTable).where(eq(localCredentialsTable.userId, member.id));
  if (!credential || !await verifyPassword(input.data.currentPassword, credential.passwordHash)) throw new AppError(401, "La contraseña actual no es correcta.");
  const result = await db.transaction(async tx => {
    const [ownerNow] = await tx.select().from(teamMembersTable).where(eq(teamMembersTable.id, member.id));
    if (!ownerNow?.active || ownerNow.role !== "owner") throw new AppError(403, "La cuenta ya no tiene acceso de propietario.");
    const [current] = await tx.select().from(localCredentialsTable).where(eq(localCredentialsTable.userId, member.id));
    if (!current || current.passwordHash !== credential.passwordHash || current.email !== normalizeEmail(member.email)) throw new AppError(409, "La cuenta cambió en otra sesión. Inicia sesión de nuevo.");
    const duplicate = await tx.select({ id: teamMembersTable.id }).from(teamMembersTable)
      .where(and(eq(sql<string>`lower(${teamMembersTable.email})`, email), ne(teamMembersTable.id, member.id)));
    if (duplicate.length) throw new AppError(409, "Ese correo ya pertenece a otra cuenta del equipo.");
    await tx.update(localCredentialsTable).set({ email, updatedAt: new Date() }).where(eq(localCredentialsTable.userId, member.id));
    const [user] = await tx.update(teamMembersTable).set({ email }).where(eq(teamMembersTable.id, member.id)).returning();
    await tx.delete(localSessionsTable).where(eq(localSessionsTable.userId, member.id));
    const token = await createLocalSession(tx, member.id);
    await tx.insert(auditLogTable).values({
      actorId: member.id, action: "owner_email_change", entity: "team", entityId: member.id,
      details: "Correo propietario actualizado; se conservaron identidad y rol y se revocaron las sesiones anteriores",
    });
    return { user, token };
  });
  setSessionCookie(res, result.token);
  await clearAccountAttempts(member.email);
  let notification: "sent" | "not_configured" | "failed" = "not_configured";
  try {
    const config = await getSmtpConfiguration();
    if (config.enabled && config.credentialsConfigured) {
      await sendLocalEmail({
        to: email, bcc: member.email, subject: "Festiland · Cambio de correo de tu cuenta",
        text: "El correo de tu cuenta propietaria de Festiland ha cambiado. El acceso y el historial se conservan. Si no solicitaste este cambio, revisa el acceso al servidor y recupera la cuenta.",
      });
      notification = "sent";
    }
  } catch { notification = "failed"; }
  res.json({
    user: asTeamUser({ ...result.user, hasLocalLogin: true, mustChangePassword: false }), notification,
    message: "Correo actualizado. A partir de ahora inicia sesión con el nuevo correo y tu misma contraseña.",
  });
});

router.post("/auth/change-password", requireMember, async (req, res): Promise<void> => {
  const body = ChangePasswordBody.safeParse(req.body);
  if (!body.success) throw new AppError(400, "Usa la contraseña actual y una nueva de entre 12 y 128 caracteres.");
  const member = getMember(res);
  await consumeLoginAttempt(req, member.email);
  const [credentials] = await db.select().from(localCredentialsTable).where(eq(localCredentialsTable.userId, member.id));
  if (!credentials || !await verifyPassword(body.data.currentPassword, credentials.passwordHash)) {
    throw new AppError(401, "La contraseña actual no es correcta.");
  }
  if (body.data.currentPassword === body.data.newPassword) throw new AppError(400, "Elige una contraseña nueva, distinta de la actual.");
  const passwordHash = await hashPassword(body.data.newPassword);
  const token = await db.transaction(async tx => {
    // Conditional update prevents a concurrent administrative reset from being overwritten.
    const changed = await tx.update(localCredentialsTable).set({
      passwordHash, mustChangePassword: false, updatedAt: new Date(),
    }).where(and(eq(localCredentialsTable.userId, member.id), eq(localCredentialsTable.passwordHash, credentials.passwordHash))).returning();
    if (!changed.length) throw new AppError(409, "La contraseña cambió en otra sesión. Inicia sesión de nuevo.");
    await tx.delete(localSessionsTable).where(eq(localSessionsTable.userId, member.id));
    const rawToken = await createLocalSession(tx, member.id);
    await tx.insert(auditLogTable).values({
      actorId: member.id, action: "password_change", entity: "auth", entityId: member.id, details: "Contraseña cambiada; sesiones anteriores revocadas",
    });
    return rawToken;
  });
  await clearAccountAttempts(member.email);
  setSessionCookie(res, token);
  res.json({ user: asTeamUser({ ...member, mustChangePassword: false }), setupRequired: false });
});

export default router;
