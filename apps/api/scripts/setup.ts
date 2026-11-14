import { loadConfig } from "../src/config.ts";
import { migrateDatabase } from "../src/db/migrate.ts";
import { createStorage } from "../src/storage.ts";
import {
  ensureDatabase,
  ensureEnvFile,
  readEnvFiles,
  report,
  SetupError,
  startServices,
} from "./environment.ts";

// Prepares the development environment. Every step is idempotent and keeps existing data.

try {
  const envFile = await ensureEnvFile();
  if (envFile.created) report.ok("Created apps/api/.env from .env.example");
  else if (envFile.added.length > 0)
    report.ok(`Added ${envFile.added.join(", ")} to apps/api/.env`);
  else report.ok("Environment file is up to date");

  let config;
  try {
    config = loadConfig({ ...(await readEnvFiles()), NODE_ENV: "development" });
  } catch (error) {
    throw new SetupError("apps/api/.env is invalid.", {
      details: error instanceof Error ? error.message : String(error),
    });
  }

  await startServices();
  report.ok("Services are running (postgres, storage)");

  if (await ensureDatabase(config.database.url))
    report.ok("Created the database");
  await migrateDatabase(config.database.url);
  report.ok("Database migrations are applied");

  const storage = createStorage(config.storage);
  try {
    const created = await storage.ensureBucket();
    report.ok(
      `Storage bucket "${config.storage.bucket}" is ${created ? "created" : "ready"}`,
    );
  } finally {
    storage.close();
  }

  if (!config.auth.google) {
    report.warn(
      "Google sign-in is disabled until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in apps/api/.env (see apps/api/README.md).",
    );
  }
} catch (error) {
  report.fail(error);
  process.exitCode = 1;
}
