import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./index";

export async function migrateLocalDatabase() {
  const folder = process.env.MIGRATIONS_DIR ?? path.resolve("lib/db/migrations-sqlite");
  await migrate(db, { migrationsFolder: folder });
}
