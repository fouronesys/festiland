import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapLocalOwner, hasLocalOwner } from "./lib/localAuth";
import { pool } from "@workspace/db";
import { AppError } from "./lib/appError";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  if (process.env.NODE_ENV === "production") {
    let origin: URL;
    try { origin = new URL(process.env.APP_ORIGIN ?? ""); } catch { throw new AppError(400, "Configura APP_ORIGIN con el dominio HTTPS del comercio."); }
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) {
      throw new AppError(400, "APP_ORIGIN debe ser un origen HTTPS, sin rutas ni parámetros.");
    }
  }
  if (await bootstrapLocalOwner()) logger.info("Local owner account initialized");
  if (!await hasLocalOwner()) logger.warn("Local login needs initial owner configuration. Set FESTILAND_OWNER_EMAIL and FESTILAND_INITIAL_OWNER_PASSWORD.");
  const server = app.listen(port, "0.0.0.0", () => logger.info({ port }, "Server listening"));
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      server.close(() => { pool.end().finally(() => process.exit(0)); });
      setTimeout(() => process.exit(1), 10000).unref();
    });
  }
}
start().catch(error => {
  logger.error({ reason: error instanceof AppError ? error.message : "Check database access and server configuration." }, "Startup failed");
  process.exit(1);
});
