import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import type { Config } from "../config.ts";
import type { Database } from "../db/client.ts";
import {
  accounts,
  sessions,
  users,
  verifications,
} from "../db/schema/index.ts";
import { deleteUserObjects } from "../modules/profile/avatar-storage.ts";
import type { ObjectStorage } from "../storage.ts";
import { mapGoogleProfile } from "./google-profile.ts";

export const AUTH_BASE_PATH = "/api/auth";

interface AuthDependencies {
  config: Config;
  db: Database;
  storage: ObjectStorage;
}

export function createAuth({ config, db, storage }: AuthDependencies) {
  const { google } = config.auth;

  return betterAuth({
    appName: "Sudoku",
    baseURL: config.apiUrl,
    basePath: AUTH_BASE_PATH,
    secret: config.auth.secret,
    trustedOrigins: [config.webOrigin],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { users, sessions, accounts, verifications },
      usePlural: true,
      transaction: true,
    }),
    advanced: { database: { generateId: "uuid" } },
    // Profile changes go through `/api/me`, which validates them. The email is Google's.
    disabledPaths: ["/update-user", "/change-email"],
    socialProviders: google
      ? {
          google: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            prompt: "select_account",
            mapProfileToUser: mapGoogleProfile,
          },
        }
      : {},
    user: {
      // Filled from the Google profile by `mapGoogleProfile`, which Better Auth only
      // accepts for fields open to input. No enabled endpoint takes them from clients:
      // email sign-up is off and `/update-user` is disabled above.
      additionalFields: {
        firstName: { type: "string", required: true },
        lastName: { type: "string", required: false },
      },
      deleteUser: {
        enabled: true,
        afterDelete: async (user) => {
          await deleteUserObjects(storage, user.id);
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"];
