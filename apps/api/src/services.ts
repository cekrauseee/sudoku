import { createAuth } from "./auth/index.ts";
import type { Config } from "./config.ts";
import { createDatabase } from "./db/client.ts";
import { createProfileService } from "./modules/profile/profile.service.ts";
import { createStorage } from "./storage.ts";

/** Builds the application's long-lived dependencies from its configuration. */
export function createServices(config: Config) {
  const database = createDatabase(config.database);
  const storage = createStorage(config.storage);
  const auth = createAuth({ config, db: database.db, storage });
  const profiles = createProfileService({ config, db: database.db, storage });

  return {
    config,
    db: database.db,
    storage,
    auth,
    profiles,
    async close() {
      storage.close();
      await database.close();
    },
  };
}

export type Services = ReturnType<typeof createServices>;
