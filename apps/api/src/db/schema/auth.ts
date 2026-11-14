import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  AVATAR_KINDS,
  AVATAR_PRESETS,
  type AvatarUpload,
} from "../../modules/profile/avatar.ts";
import { NAME_MAX_LENGTH } from "../../modules/profile/name.ts";

// Tables managed by Better Auth. Property names follow its field names; columns use
// snake_case. See https://www.better-auth.com/docs/concepts/database#core-schema.

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const avatarKind = pgEnum("avatar_kind", AVATAR_KINDS);
export const avatarPreset = pgEnum("avatar_preset", AVATAR_PRESETS);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    /** Photo inherited from the identity provider. */
    image: text("image"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    avatarKind: avatarKind("avatar_kind").notNull().default("provider"),
    avatarPreset: avatarPreset("avatar_preset"),
    avatarUpload: jsonb("avatar_upload").$type<AvatarUpload>(),
    ...timestamps,
  },
  (table) => [
    check(
      "users_first_name_length",
      sql`char_length(${table.firstName}) between 1 and ${sql.raw(String(NAME_MAX_LENGTH))}`,
    ),
    check(
      "users_last_name_length",
      sql`char_length(${table.lastName}) between 1 and ${sql.raw(String(NAME_MAX_LENGTH))}`,
    ),
    check(
      "users_avatar_preset_matches_kind",
      sql`(${table.avatarKind} = 'preset') = (${table.avatarPreset} is not null)`,
    ),
    check(
      "users_avatar_upload_matches_kind",
      sql`(${table.avatarKind} = 'upload') = (${table.avatarUpload} is not null)`,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [
    index("accounts_user_id_idx").on(table.userId),
    uniqueIndex("accounts_provider_account_uidx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);
