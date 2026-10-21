import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { once } from "node:events";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  auditLogTable, db, localCredentialsTable, localSessionsTable,
  loginAttemptsTable, pool, teamMembersTable,
} from "@workspace/db";
import { hashPassword } from "../src/lib/passwords";

// Isolated HTTP integration test: only generated fixture identities are changed.
const run = randomUUID().replaceAll("-", "");
const prefix = `auth-test-${run}`;
const ids = ["owner", "manager", "legacy"].map(role => `${prefix}-${role}`);
const emails = ["owner", "manager", "legacy", "staff", "blocked"].map(role => `${prefix}-${role}@example.invalid`);
const password = `Prueba-${randomBytes(20).toString("base64url")}`;
const nextPassword = `Nueva-${randomBytes(20).toString("base64url")}`;
const temporaryPassword = `Temporal-${randomBytes(20).toString("base64url")}`;
const ip = `2001:db8:${run.slice(0, 4)}:${run.slice(4, 8)}::1`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
let server: import("node:http").Server | undefined;
let checks = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; };

async function verifyFreshMigration() {
  const schema = `verify_auth_${run}`;
  const rollback = new Error("rollback migration fixture");
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`CREATE SCHEMA ${sql.identifier(schema)}`);
      await tx.execute(sql`SET LOCAL search_path TO ${sql.identifier(schema)}`);
      for (const migration of readMigrationFiles({ migrationsFolder: path.resolve("lib/db/migrations") })) {
        for (const statement of migration.sql) {
          // Isolate default-schema FK references without touching the application schema.
          await tx.execute(sql.raw(statement.replaceAll('"public".', `"${schema}".`)));
        }
      }
      const rows = await tx.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema}`);
      check(rows.rows.length === 22, "Fresh database migration must create the complete schema");
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}

async function main() {
  await verifyFreshMigration();
  const passwordHash = await hashPassword(password);
  await db.transaction(async tx => {
    await tx.insert(teamMembersTable).values(ids.map((id, i) => ({
      id, email: emails[i], name: `Prueba local ${i}`, role: ["owner", "manager", "inventory"][i], active: true,
    })));
    await tx.insert(localCredentialsTable).values(ids.slice(0, 2).map((userId, i) => ({
      userId, email: emails[i], passwordHash, mustChangePassword: false,
    })));
  });
  process.env.NODE_ENV = "production";
  process.env.LOG_LEVEL = "silent";
  process.env.APP_ORIGIN = "https://local-auth.example.invalid";
  process.env.SERVE_STATIC = "true";
  process.env.STATIC_DIR = path.resolve("artifacts/festiland-gestion/dist/public");
  const { default: app } = await import("../src/app");
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as import("node:net").AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  const request = async (route: string, method = "GET", body?: unknown, cookie?: string, extra: Record<string, string> = {}) => {
    const res = await fetch(`${base}/api${route}`, {
      method, headers: {
        "content-type": "application/json", "x-festiland-request": "1",
        "x-forwarded-proto": "https", "x-forwarded-for": ip, origin: process.env.APP_ORIGIN!,
        ...(cookie ? { cookie } : {}), ...extra,
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json(), cookie: res.headers.get("set-cookie")?.split(";")[0], cookieHeader: res.headers.get("set-cookie") ?? "" };
  };
  const login = (email: string, value = password) => request("/auth/login", "POST", { email, password: value });
  check((await request("/healthz")).status === 200, "Database readiness");
  check((await request("/products")).status === 401, "Anonymous POS requests are denied");
  const anonymous = await request("/auth/session");
  check(anonymous.status === 200 && anonymous.body.user === null, "Anonymous session has no user");
  check((await request("/auth/login", "POST", { email: emails[0], password }, undefined, { origin: "https://external.example.invalid" })).status === 403, "Cross-origin writes are denied");
  check((await request("/auth/logout", "POST", undefined, undefined, { origin: "", "x-festiland-request": "" })).status === 403, "Headerless non-browser writes are denied");
  check((await request("/auth/login", "POST", { email: emails[0], password }, undefined, { "x-forwarded-proto": "http" })).status === 400, "Production rejects insecure login");
  check((await login(emails[0], "incorrect-password")).status === 401, "Wrong password is denied");
  const owner = await login(emails[0]);
  check(owner.status === 200 && owner.body.user.role === "owner" && !!owner.cookie, "Local owner login");
  check(/httponly/i.test(owner.cookieHeader) && /secure/i.test(owner.cookieHeader) && /samesite=lax/i.test(owner.cookieHeader), "Cookie security attributes");
  check((await request("/me", "GET", undefined, owner.cookie)).body.id === ids[0], "Session identifies original member");
  const team = await request("/team", "GET", undefined, owner.cookie);
  check(team.status === 200 && team.body.find((u: { id: string }) => u.id === ids[2]).hasLocalLogin === false, "Migrated member is retained without invented credentials");
  const created = await request("/team/accounts", "POST", {
    name: "Prueba cajero", email: emails[3], role: "cashier", temporaryPassword,
  }, owner.cookie);
  check(created.status === 201 && created.body.mustChangePassword && !("passwordHash" in created.body), "Staff creation returns no credentials");
  const staffId = created.body.id as string;
  const initialStaff = await login(emails[3], temporaryPassword);
  check(initialStaff.status === 200 && initialStaff.body.user.mustChangePassword, "Temporary password login");
  const blocked = await request("/products", "GET", undefined, initialStaff.cookie);
  check(blocked.status === 403 && blocked.body.code === "PASSWORD_CHANGE_REQUIRED", "Temporary credentials cannot operate POS");
  check((await request("/auth/change-password", "POST", { currentPassword: "incorrect-password", newPassword: nextPassword }, initialStaff.cookie)).status === 401, "Wrong current password cannot change access");
  const changed = await request("/auth/change-password", "POST", { currentPassword: temporaryPassword, newPassword: nextPassword }, initialStaff.cookie);
  check(changed.status === 200 && changed.body.user.mustChangePassword === false && !!changed.cookie, "Forced password change renews session");
  check((await request("/me", "GET", undefined, initialStaff.cookie)).status === 401, "Password change revokes old cookie");
  check((await request("/me", "GET", undefined, changed.cookie)).status === 200, "Renewed session works");
  check((await request("/team", "GET", undefined, changed.cookie)).status === 403, "Cashier cannot inspect or administer team");
  const manager = await login(emails[1]);
  check((await request("/team/accounts", "POST", {
    name: "No permitido", email: emails[4], role: "owner", temporaryPassword,
  }, manager.cookie)).status === 403, "Manager cannot grant owner access");
  check((await request(`/team/${ids[0]}/password`, "POST", { temporaryPassword }, manager.cookie)).status === 403, "Manager cannot reset owner credentials");
  check((await request(`/team/${staffId}/password`, "POST", { temporaryPassword }, owner.cookie)).status === 200, "Administrative password reset");
  check((await request("/me", "GET", undefined, changed.cookie)).status === 401, "Reset revokes prior staff sessions");
  check((await login(emails[3], nextPassword)).status === 401, "Old password fails after reset");
  const resetStaff = await login(emails[3], temporaryPassword);
  check(resetStaff.body.user.mustChangePassword === true, "Reset forces another personal password");
  check((await request(`/team/${ids[2]}/password`, "POST", { temporaryPassword }, owner.cookie)).status === 200, "Migrated identity can receive local access");
  const legacy = await login(emails[2], temporaryPassword);
  check(legacy.body.user.id === ids[2] && legacy.body.user.role === "inventory", "Migration preserves member identifier and role");
  check((await request(`/team/${staffId}/role`, "PATCH", { role: "cashier", active: false }, owner.cookie)).status === 200, "Owner can deactivate staff");
  check((await request("/me", "GET", undefined, resetStaff.cookie)).status === 401, "Deactivation revokes current access");
  check((await login(emails[3], temporaryPassword)).status === 401, "Inactive account cannot log in");
  check((await request(`/team/${staffId}/role`, "PATCH", { role: "cashier", active: true }, owner.cookie)).status === 200, "Owner can reactivate staff");
  const managerHash = hash(manager.cookie!.split("=")[1]);
  await db.update(localSessionsTable).set({ lastSeenAt: new Date(Date.now() - 13 * 3600000) }).where(eq(localSessionsTable.tokenHash, managerHash));
  check((await request("/me", "GET", undefined, manager.cookie)).status === 401, "Idle session expiry");
  const stored = await db.select().from(localSessionsTable).where(eq(localSessionsTable.userId, ids[0]));
  check(stored.length > 0 && stored.every(s => s.tokenHash !== owner.cookie!.split("=")[1]), "No raw session token is stored");
  const logout = await request("/auth/logout", "POST", undefined, owner.cookie);
  check(logout.status === 200 && /1970/.test(logout.cookieHeader), "Logout clears cookie");
  check((await request("/me", "GET", undefined, owner.cookie)).status === 401, "Logged-out cookie is unusable");
  const ownerAgain = await login(emails[0]);
  await db.update(localSessionsTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(localSessionsTable.tokenHash, hash(ownerAgain.cookie!.split("=")[1])));
  check((await request("/me", "GET", undefined, ownerAgain.cookie)).status === 401, "Absolute expiry is enforced");
  let limited = 0;
  for (let i = 0; i < 11; i++) limited = (await login(emails[4], "not-a-real-password")).status;
  check(limited === 429, "Persistent per-account brute force limit");
  const html = await fetch(`${base}/sign-in`);
  check(html.status === 200 && (await html.text()).includes("<html"), "Production serves SPA route without Replit routing");
  check((await fetch(`${base}/brand/festiland-logo.png`)).status === 200, "Production serves brand assets");
  console.log(`Local auth verified: ${checks} checks, complete migration, HTTPS cookies, roles, reset, expiry, logout and static routing.`);
}

try { await main(); } finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  const members = await db.select({ id: teamMembersTable.id }).from(teamMembersTable).where(inArray(teamMembersTable.email, emails));
  const fixtureIds = members.map(member => member.id);
  if (fixtureIds.length) {
    await db.delete(auditLogTable).where(or(inArray(auditLogTable.actorId, fixtureIds), inArray(auditLogTable.entityId, fixtureIds)));
    await db.delete(teamMembersTable).where(inArray(teamMembersTable.id, fixtureIds));
  }
  await db.delete(loginAttemptsTable).where(inArray(loginAttemptsTable.key, [
    hash(`ip:${ip}`), ...emails.map(email => hash(`account:${email}`)),
  ]));
  await pool.end();
}
