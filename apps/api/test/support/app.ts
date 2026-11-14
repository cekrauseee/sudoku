import { sql } from "drizzle-orm";
import { afterAll, beforeEach, inject } from "vitest";

import { createApp } from "../../src/app.ts";
import { loadConfig } from "../../src/config.ts";
import { createServices } from "../../src/services.ts";

export type TestApp = ReturnType<typeof createApp>;

/** Builds the app against the test services and resets their data before each test. */
export function useTestApp() {
  const config = loadConfig(inject("env"));
  const services = createServices(config);
  const app = createApp(services);

  beforeEach(async () => {
    await services.db.execute(
      sql`truncate table users, sessions, accounts, verifications restart identity cascade`,
    );
    await services.storage.deletePrefix("");
  });

  afterAll(() => services.close());

  return { app, services, config };
}
