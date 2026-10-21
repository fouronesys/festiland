import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  authBootstrapTable, closeDatabase, db, localSessionsTable, teamMembersTable,
} from "@workspace/db";
import { createLocalSession, SESSION_COOKIE } from "../src/lib/localAuth";

// Server-console check. Never print credentials, session cookies or sender values.
let token: string | undefined;
try {
  if (!process.argv.includes("--send-confirmed")) throw new Error("Explicit confirmation is required to send a real test email.");
  const position = process.argv.indexOf("--port");
  const port = Number(position >= 0 ? process.argv[position + 1] : process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local server port.");
  const [initial] = await db.select().from(authBootstrapTable).where(eq(authBootstrapTable.id, "owner"));
  if (!initial) throw new Error("No initialized owner was found.");
  const [owner] = await db.select().from(teamMembersTable).where(and(
    eq(teamMembersTable.id, initial.userId), eq(teamMembersTable.role, "owner"), eq(teamMembersTable.active, true),
  ));
  if (!owner) throw new Error("The initialized owner is not active. Choose an active owner through the application.");
  token = await db.transaction(tx => createLocalSession(tx, owner.id));
  const headers = { cookie: `${SESSION_COOKIE}=${token}`, "x-festiland-request": "1" };
  const base = `http://127.0.0.1:${port}/api`;
  const statusResponse = await fetch(`${base}/smtp-settings`, { headers });
  const settings = await statusResponse.json();
  if (!statusResponse.ok) throw new Error(settings.error ?? "SMTP status unavailable.");
  console.log({ credentialsConfigured: settings.credentialsConfigured, enabled: settings.enabled, host: settings.host, port: settings.port });
  if (!settings.credentialsConfigured || !settings.enabled) throw new Error("SMTP is not configured or enabled.");
  const sent = await fetch(`${base}/smtp-settings/test`, { method: "POST", headers });
  const result = await sent.json();
  if (!sent.ok) throw new Error(result.error ?? "SMTP test failed.");
  console.log(result.message);
} catch (error) {
  console.error(error instanceof Error ? error.message : "SMTP test failed.");
  process.exitCode = 1;
} finally {
  if (token) await db.delete(localSessionsTable).where(eq(localSessionsTable.tokenHash, createHash("sha256").update(token).digest("hex")));
  closeDatabase();
}
