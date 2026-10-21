import type { RequestHandler } from "express";

/** Browser cross-origin writes are rejected; CLI clients must explicitly opt in. */
export const protectLocalWrites: RequestHandler = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const origin = req.get("origin");
  if (origin) {
    const host = req.get("x-forwarded-host")?.split(",")[0].trim() ?? req.get("host");
    try {
      const expected = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : undefined;
      const parsed = new URL(origin);
      if (parsed.origin === "null" || (expected ? parsed.origin !== expected : parsed.host !== host)) {
        res.status(403).json({ error: "Origen de solicitud no permitido." });
        return;
      }
    } catch {
      res.status(403).json({ error: "Origen de solicitud no válido." });
      return;
    }
  } else if (req.get("x-festiland-request") !== "1") {
    res.status(403).json({ error: "Falta la protección de solicitud local." });
    return;
  }
  if (req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "Solicitud externa bloqueada." });
    return;
  }
  next();
};
