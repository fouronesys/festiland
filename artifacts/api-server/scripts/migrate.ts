import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "@workspace/db";

let releaseConnection = async () => {};
try {
  const client = await pool.connect();
  releaseConnection = async () => {
    await client.query("SELECT pg_advisory_unlock(6879001)").catch(() => undefined);
    client.release();
  };
  // Serialize migration startup across CapRover replicas before reading history.
  await client.query("SELECT pg_advisory_lock(6879001)");
  await migrate(drizzle(client), { migrationsFolder: path.resolve(process.env.MIGRATIONS_DIR ?? "migrations") });
  console.log("Database migrations applied.");
} catch (error) {
  const failure = error as { code?: string; cause?: { code?: string } };
  console.error("Database migration failed. Review database access and migration history; startup was stopped.", failure.cause?.code ?? failure.code ?? "");
  process.exitCode = 1;
} finally {
  await releaseConnection();
  await pool.end();
}
