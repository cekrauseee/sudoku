import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";

import type { Config } from "../config.ts";
import * as schema from "./schema/index.ts";

export type Schema = typeof schema;
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

export interface DatabaseConnection {
  db: Database;
  close: () => Promise<void>;
}

/**
 * Connects with node-postgres in development and tests, and with Neon's serverless
 * driver (WebSocket pool) in production.
 */
export function createDatabase({
  url,
  driver,
}: Config["database"]): DatabaseConnection {
  if (driver === "neon-serverless") {
    const pool = new NeonPool({ connectionString: url });
    return {
      db: drizzleNeon({ client: pool, schema }),
      close: () => pool.end(),
    };
  }

  const pool = new pg.Pool({ connectionString: url });
  return {
    db: drizzleNodePostgres({ client: pool, schema }),
    close: () => pool.end(),
  };
}
