import { migrateLocalDatabase } from "@workspace/db/migrate";
import { closeDatabase } from "@workspace/db";
try {
  await migrateLocalDatabase();
  console.log("Local SQLite migrations applied.");
} catch {
  console.error("SQLite migration failed. Check the persistent volume, permissions and migration history. Startup stopped.");
  process.exitCode = 1;
} finally { closeDatabase(); }
