import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { db, smtpSettingsTable } from "@workspace/db";
import { AppError } from "./appError";

export function validateZohoHost(host: string) {
  // No arbitrary destination/SSRF through the owner's settings form.
  if (!/^(smtp|smtppro)\.zoho\.(com|eu|in|com\.au|jp|ca|sa|com\.cn)$/.test(host)) {
    throw new AppError(400, "Usa el servidor SMTP de Zoho que corresponde a tu cuenta y región.");
  }
}
export async function getSmtpConfiguration() {
  await db.insert(smtpSettingsTable).values({ id: "main" }).onConflictDoNothing();
  const [settings] = await db.select().from(smtpSettingsTable).where(eq(smtpSettingsTable.id, "main"));
  const user = process.env.ZOHO_SMTP_USER?.trim();
  const credentialsConfigured = !!user && !!process.env.ZOHO_SMTP_PASSWORD;
  return {
    host: settings.host, port: settings.port as 465 | 587, fromName: settings.fromName, enabled: settings.enabled,
    credentialsConfigured, senderEmail: user || null,
  };
}
export async function sendLocalEmail(input: { to: string; subject: string; text: string; bcc?: string }) {
  const settings = await getSmtpConfiguration();
  if (!settings.enabled || !settings.credentialsConfigured) throw new AppError(503, "El envío SMTP no está habilitado o faltan sus credenciales en el servidor.");
  validateZohoHost(settings.host);
  if (![465, 587].includes(settings.port)) throw new AppError(400, "Zoho requiere el puerto seguro 465 o 587.");
  const transport = nodemailer.createTransport({
    host: settings.host, port: settings.port, secure: settings.port === 465, requireTLS: settings.port === 587,
    auth: { user: process.env.ZOHO_SMTP_USER!.trim(), pass: process.env.ZOHO_SMTP_PASSWORD! },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  try {
    const sent = await transport.sendMail({
      from: { name: settings.fromName, address: settings.senderEmail! }, to: input.to, bcc: input.bcc,
      subject: input.subject, text: input.text,
    });
    if (sent.rejected.length || sent.accepted.length === 0) throw new Error("Recipient rejected");
  } catch {
    throw new AppError(502, "Zoho no confirmó el envío. Revisa servidor, región, puerto y contraseña de aplicación; no se marcó como enviado.");
  } finally { transport.close(); }
}
