import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client/sqlite3";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { serializeLocalClient, transactionContext } from "./local-client";

export const databasePath = path.resolve(process.env.SQLITE_PATH ?? "data/festiland.sqlite");
process.umask(0o077);
mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
// File-only driver: remote URLs, sync endpoints and auth tokens are never used.
export const sqlite = serializeLocalClient(createClient({ url: pathToFileURL(databasePath).href }));
await sqlite.execute("PRAGMA journal_mode = WAL");
await sqlite.execute("PRAGMA foreign_keys = ON");
await sqlite.execute("PRAGMA synchronous = FULL");
await sqlite.execute("PRAGMA busy_timeout = 5000");
export const db = drizzle(sqlite, { schema });
const transaction = db.transaction.bind(db);
db.transaction = ((...args: Parameters<typeof transaction>) => {
  if (transactionContext.getStore()) throw new Error("Use tx.transaction for a nested transaction.");
  return transactionContext.run(true, () => transaction(...args));
}) as typeof db.transaction;
export const closeDatabase = () => sqlite.close();
export * from "./schema";
