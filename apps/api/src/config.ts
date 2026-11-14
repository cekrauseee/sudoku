import { z } from "zod";

const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    API_URL: z.url(),
    WEB_URL: z.url(),
    AUTH_SECRET: z.string().min(32, "must have at least 32 characters"),
    GOOGLE_CLIENT_ID: z.preprocess(emptyAsUndefined, z.string().optional()),
    GOOGLE_CLIENT_SECRET: z.preprocess(emptyAsUndefined, z.string().optional()),
    DATABASE_URL: z.url(),
    S3_ENDPOINT: z.preprocess(emptyAsUndefined, z.url().optional()),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
  })
  .refine(
    (env) =>
      (env.GOOGLE_CLIENT_ID === undefined) ===
      (env.GOOGLE_CLIENT_SECRET === undefined),
    {
      message: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together",
    },
  )
  .refine(
    (env) =>
      env.NODE_ENV !== "production" || env.GOOGLE_CLIENT_ID !== undefined,
    {
      message: "Google OAuth credentials are required in production",
    },
  );

/** The production runtime uses Neon's serverless driver; other environments use node-postgres. */
export type DatabaseDriver = "node-postgres" | "neon-serverless";

export interface Config {
  environment: "development" | "test" | "production";
  port: number;
  apiUrl: string;
  webOrigin: string;
  auth: {
    secret: string;
    google: { clientId: string; clientSecret: string } | undefined;
  };
  database: { url: string; driver: DatabaseDriver };
  storage: StorageConfig;
}

export interface StorageConfig {
  endpoint: string | undefined;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

export function loadConfig(
  source: Record<string, string | undefined> = process.env,
): Config {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }

  const env = result.data;
  return {
    environment: env.NODE_ENV,
    port: env.PORT,
    apiUrl: env.API_URL.replace(/\/+$/, ""),
    webOrigin: new URL(env.WEB_URL).origin,
    auth: {
      secret: env.AUTH_SECRET,
      google:
        env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
          ? {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            }
          : undefined,
    },
    database: {
      url: env.DATABASE_URL,
      driver:
        env.NODE_ENV === "production" ? "neon-serverless" : "node-postgres",
    },
    storage: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  };
}
