import { defineConfig } from "drizzle-kit";
import path from "path";

export default defineConfig({
  out: path.join(__dirname, "./migrations-sqlite"),
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "turso",
  dbCredentials: {
    url: `file:${path.resolve(process.env.SQLITE_PATH ?? "data/festiland.sqlite")}`,
  },
});
