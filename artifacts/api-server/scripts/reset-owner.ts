import { and, eq, sql } from "drizzle-orm";
import { auditLogTable, authBootstrapTable, closeDatabase, db, localCredentialsTable, localSessionsTable, teamMembersTable } from "@workspace/db";
import { hashPassword } from "../src/lib/passwords";
import { normalizeEmail } from "../src/lib/localAuth";
import { AppError } from "../src/lib/appError";

try {
  if (!process.argv.includes("--confirm")) throw new AppError(400, "Run with --confirm after configuring FESTILAND_RECOVERY_PASSWORD securely.");
  const email = process.env.FESTILAND_RECOVERY_EMAIL;
  const password = process.env.FESTILAND_RECOVERY_PASSWORD;
  if (!password) throw new AppError(400, "Set FESTILAND_RECOVERY_PASSWORD securely. FESTILAND_RECOVERY_EMAIL is optional.");
  const passwordHash = await hashPassword(password);
  await db.transaction(async tx => {
    const [bootstrap] = await tx.select().from(authBootstrapTable).where(eq(authBootstrapTable.id, "owner"));
    const [owner] = await tx.select().from(teamMembersTable).where(and(
      email ? eq(sql<string>`lower(${teamMembersTable.email})`, normalizeEmail(email)) : eq(teamMembersTable.id, bootstrap?.userId ?? ""),
      eq(teamMembersTable.role, "owner"), eq(teamMembersTable.active, true),
    ));
    if (!owner) throw new AppError(400, "No active owner matches the configured email. Recovery does not restore revoked roles.");
    await tx.insert(localCredentialsTable).values({
      userId: owner.id, email: normalizeEmail(owner.email), passwordHash, mustChangePassword: true,
    }).onConflictDoUpdate({ target: localCredentialsTable.userId, set: { passwordHash, mustChangePassword: true, updatedAt: new Date() } });
    await tx.delete(localSessionsTable).where(eq(localSessionsTable.userId, owner.id));
    await tx.insert(auditLogTable).values({
      actorId: owner.id, action: "owner_recovery", entity: "auth", entityId: owner.id,
      details: "Recuperación local por consola; sesiones revocadas; cambio de contraseña obligatorio",
    });
  });
  console.log("Owner password recovered. Remove FESTILAND_RECOVERY_PASSWORD from the environment.");
} catch (error) {
  console.error(error instanceof AppError ? error.message : "Owner recovery failed. Review database access and server configuration.");
  process.exitCode = 1;
} finally {
  closeDatabase();
}
