import express, { type Express, type ErrorRequestHandler } from "express";
import path from "node:path";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { protectLocalWrites } from "./middlewares/csrf";
import router from "./routes";
import { logger } from "./lib/logger";
import { AppError } from "./lib/appError";

const app: Express = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

app.use("/api", protectLocalWrites, router);
app.use("/api", (_req, res) => { res.status(404).json({ error: "Ruta no encontrada." }); });

if (process.env.SERVE_STATIC === "true") {
  const staticDir = path.resolve(process.env.STATIC_DIR ?? "public");
  app.use(express.static(staticDir, { index: false, setHeaders: (res, filePath) => {
    res.setHeader("Cache-Control", filePath.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
  } }));
  app.get("/{*splat}", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

const handleError: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) {
    _next(error);
    return;
  }
  if (error?.type === "entity.parse.failed" || error?.type === "entity.too.large") {
    res.status(error.type === "entity.too.large" ? 413 : 400).json({ error: "El cuerpo de la solicitud no es válido o es demasiado grande." });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error?.code === "23505" || error?.cause?.code === "23505") {
    res.status(409).json({ error: "Ese código o registro ya existe. Usa uno diferente." });
    return;
  }
  req.log.error(req.path.includes("/auth/") || req.path.includes("/team") ? { errorType: error?.name } : { err: error }, "Request failed");
  res.status(500).json({ error: "No pudimos completar la operación. No se guardaron cambios parciales." });
};
app.use(handleError);

export default app;
