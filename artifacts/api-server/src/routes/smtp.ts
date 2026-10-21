import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { UpdateSmtpSettingsBody } from "@workspace/api-zod";
import { auditLogTable, db, loginAttemptsTable, smtpSettingsTable } from "@workspace/db";
import { getMember, requireRole } from "../middlewares/festilandAuth";
import { getSmtpConfiguration, sendLocalEmail, validateZohoHost } from "../lib/mailer";
import { AppError } from "../lib/appError";

const router: IRouter = Router();
router.get("/smtp-settings", requireRole("owner"), async (_req, res) => {
  res.json(await getSmtpConfiguration());
});
router.patch("/smtp-settings", requireRole("owner"), async (req, res) => {
  const input = UpdateSmtpSettingsBody.safeParse(req.body);
  if (!input.success) throw new AppError(400, "Revisa el servidor SMTP, puerto 465/587 y nombre del remitente.");
  const settings = { ...input.data, host: input.data.host.trim().toLowerCase(), fromName: input.data.fromName.trim() };
  validateZohoHost(settings.host);
  if (!settings.fromName || /[\r\n]/.test(settings.fromName)) throw new AppError(400, "El nombre del remitente no es válido.");
  await db.transaction(async tx => {
    await tx.insert(smtpSettingsTable).values({ id: "main", ...settings })
      .onConflictDoUpdate({ target: smtpSettingsTable.id, set: settings });
    await tx.insert(auditLogTable).values({
      actorId: getMember(res).id, action: "smtp_update", entity: "settings", entityId: "smtp",
      details: `Zoho SMTP · ${settings.port === 465 ? "SSL" : "STARTTLS"} · ${settings.enabled ? "habilitado" : "deshabilitado"}`,
    });
  });
  res.json(await getSmtpConfiguration());
});
router.post("/smtp-settings/test", requireRole("owner"), async (_req, res) => {
  const member = getMember(res);
  const key = createHash("sha256").update(`smtp-test:${member.id}`).digest("hex");
  await db.transaction(async tx => {
    const [counter] = await tx.select().from(loginAttemptsTable).where(eq(loginAttemptsTable.key, key));
    const active = counter && counter.resetAt.getTime() > Date.now();
    if (active && counter.attempts >= 5) throw new AppError(429, "Máximo cinco pruebas cada 15 minutos.");
    await tx.insert(loginAttemptsTable).values({ key, attempts: 1, resetAt: new Date(Date.now() + 900000) })
      .onConflictDoUpdate({ target: loginAttemptsTable.key, set: { attempts: active ? counter.attempts + 1 : 1, resetAt: active ? counter.resetAt : new Date(Date.now() + 900000) } });
  });
  await sendLocalEmail({
    to: member.email, subject: "Festiland · Prueba de correo",
    text: "La configuración SMTP de Zoho de Festiland funciona. Este es un mensaje de prueba solicitado desde Preferencias.",
  });
  await db.insert(auditLogTable).values({
    actorId: member.id, action: "smtp_test", entity: "settings", entityId: "smtp", details: "Zoho aceptó el correo de prueba",
  });
  res.json({ message: "Zoho aceptó el correo de prueba. Revisa tu bandeja de entrada y correo no deseado." });
});
export default router;
