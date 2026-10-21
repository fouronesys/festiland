import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import {
  accountsTable, auditLogTable, authBootstrapTable, closeDatabase, contactsTable, db,
  localCredentialsTable, productsTable, sqlite, storeSettingsTable, taxRatesTable, teamMembersTable,
} from "@workspace/db";
import { migrateLocalDatabase } from "@workspace/db/migrate";

const source = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  if (!process.argv.includes("--confirm-reset")) throw new Error("Explicit reset confirmation is required.");
  await migrateLocalDatabase();
  const existing = await db.select({ id: teamMembersTable.id }).from(teamMembersTable).limit(1);
  if (existing.length) throw new Error("The SQLite destination is not empty. Refusing to replace it.");
  const client = await source.connect();
  const snapshot: Record<string, Record<string, unknown>[]> = {};
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables = await client.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'festiland_%' ORDER BY table_name");
    for (const { table_name: name } of tables.rows) {
      if (!/^festiland_[a-z_]+$/.test(name)) throw new Error("Unexpected source table.");
      snapshot[name] = (await client.query(`SELECT * FROM "${name}"`)).rows;
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  const backupDir = path.join(path.dirname(process.env.SQLITE_PATH ?? "data/festiland.sqlite"), "backups");
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backup = path.join(backupDir, `postgres-before-sqlite-${new Date().toISOString().replaceAll(":", "-")}.json`);
  await writeFile(backup, JSON.stringify({ format: "festiland-postgres-snapshot", version: 1, createdAt: new Date().toISOString(), tables: snapshot }), { mode: 0o600, flag: "wx" });

  const preserved = [
    teamMembersTable, localCredentialsTable, authBootstrapTable, taxRatesTable,
    productsTable, contactsTable, accountsTable, storeSettingsTable, auditLogTable,
  ];
  await db.transaction(async tx => {
    for (const table of preserved) {
      const columns = getTableColumns(table);
      const rows = snapshot[getTableName(table)] ?? [];
      for (const raw of rows) {
        const value: Record<string, unknown> = {};
        for (const [key, column] of Object.entries(columns)) {
          const input = raw[column.name];
          value[key] = input == null ? null : column.dataType === "date" ? new Date(input as string)
            : column.dataType === "number" ? Number(input) : input;
        }
        if (table === productsTable) value.stock = 0;
        if (table === contactsTable) value.openingBalance = 0;
        if (table === storeSettingsTable) value.lockedThrough = null;
        // Conversion is explicit above; the union of table insert types is not expressible to Drizzle.
        await tx.insert(table).values(value as never);
      }
    }
    await tx.insert(storeSettingsTable).values({
      id: "main", address: "C. Rosario 86, Moca 56000, República Dominicana", phone: "(809) 528-0233",
    }).onConflictDoUpdate({ target: storeSettingsTable.id, set: {
      address: "C. Rosario 86, Moca 56000, República Dominicana", phone: "(809) 528-0233", lockedThrough: null,
    } });
    const [owner] = await tx.select({ id: teamMembersTable.id }).from(teamMembersTable)
      .innerJoin(localCredentialsTable, sql`${localCredentialsTable.userId} = ${teamMembersTable.id}`)
      .where(sql`${teamMembersTable.role} = 'owner' AND ${teamMembersTable.active} = 1`).limit(1);
    if (!owner) throw new Error("No active local owner was preserved. Migration rolled back.");
    await tx.insert(auditLogTable).values({
      actorId: owner.id, action: "accounting_reset", entity: "system", entityId: "sqlite",
      details: "Reinicio autorizado: operaciones, saldos y existencias en cero. Catálogos, usuarios, roles y configuración conservados. Respaldo privado completo previo al cambio.",
    });
  });
  const integrity = await sqlite.execute("PRAGMA integrity_check");
  if (integrity.rows[0]?.integrity_check !== "ok") throw new Error("SQLite integrity check failed.");
  console.log("SQLite migration and authorized reset complete. Source PostgreSQL remains unchanged; private full snapshot saved in data/backups. No operational transactions or sessions were imported.");
} catch {
  console.error("SQLite transfer stopped. No source data was deleted. Check destination, snapshot and preserved owner before retrying.");
  process.exitCode = 1;
} finally {
  await source.end();
  closeDatabase();
}
