import type { TestProject } from "vitest/node";

import { loadConfig } from "../src/config.ts";
import { migrateDatabase } from "../src/db/migrate.ts";
import { createStorage } from "../src/storage.ts";
import {
  ensureDatabase,
  readEnvFiles,
  report,
  resetDatabase,
  startServices,
} from "../scripts/environment.ts";

declare module "vitest" {
  export interface ProvidedContext {
    env: Record<string, string>;
  }
}

/**
 * Prepares an isolated test environment on the development services: a `<name>_test`
 * database migrated from scratch and an empty `<bucket>-test` bucket.
 */
export default async function setup(project: TestProject) {
  const base = await readEnvFiles();
  const databaseUrl = new URL(base.DATABASE_URL ?? "");
  databaseUrl.pathname = `${databaseUrl.pathname}_test`;

  const env = {
    ...base,
    NODE_ENV: "test",
    API_URL: "http://localhost:3000",
    WEB_URL: "http://localhost:5173",
    AUTH_SECRET: "test-secret-that-is-long-enough-for-better-auth",
    GOOGLE_CLIENT_ID: "test-google-client-id",
    GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    DATABASE_URL: databaseUrl.href,
    S3_BUCKET: `${base.S3_BUCKET ?? "sudoku"}-test`,
  };
  const config = loadConfig(env);

  try {
    await startServices();
    await ensureDatabase(config.database.url);
    await resetDatabase(config.database.url);
    await migrateDatabase(config.database.url);

    const storage = createStorage(config.storage);
    try {
      await storage.ensureBucket();
      await storage.deletePrefix("");
    } finally {
      storage.close();
    }
  } catch (error) {
    report.fail(error);
    throw error;
  }

  project.provide("env", env);
}
