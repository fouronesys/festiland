import { and, eq, sql } from "drizzle-orm";
import { auditLogTable, db, localCredentialsTable, localSessionsTable, pool, teamMembersTable } from "@workspace/db";
import { hashPassword } from "../src/lib/passwords";
import { normalizeEmail } from "../src/lib/localAuth";
import { AppError } from "../src/lib/appError";

try {
  if (!process.argv.includes("--confirm")) throw new AppError(400, "Run with --confirm after configuring FESTILAND_RECOVERY_PASSWORD securely.");
  const email = process.env.FESTILAND_OWNER_EMAIL;
  const password = process.env.FESTILAND_RECOVERY_PASSWORD;
  if (!email || !password) throw new AppError(400, "Set FESTILAND_OWNER_EMAIL and FESTILAND_RECOVERY_PASSWORD in the server's secure environment.");
  const passwordHash = await hashPassword(password);
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(6802419)`);
    const [owner] = await tx.select().from(teamMembersTable).where(and(
      eq(sql<string>`lower(${teamMembersTable.email})`, normalizeEmail(email)), eq(teamMembersTable.role, "owner"), eq(teamMembersTable.active, true),
    )).for("update");
    if (!owner) throw new AppError(400, "No active owner matches the configured email. Recovery does not restore revoked roles.");
    await tx.insert(localCredentialsTable).values({
      userId: owner.id, email: normalizeEmail(email), passwordHash, mustChangePassword: true,
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
  await pool.end();
}
