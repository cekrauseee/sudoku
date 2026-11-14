import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { defineConfig } from "drizzle-kit";

const env = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {};

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: env.DATABASE_URL ?? "" },
  strict: true,
});
