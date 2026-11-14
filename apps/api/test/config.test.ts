import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../src/config.ts";

const env = {
  API_URL: "http://localhost:3000/",
  WEB_URL: "http://localhost:5173/play",
  AUTH_SECRET: "a-secret-that-is-at-least-32-characters",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  DATABASE_URL: "postgres://sudoku:sudoku@localhost:5440/sudoku",
  S3_ENDPOINT: "http://localhost:9010",
  S3_BUCKET: "sudoku",
  S3_ACCESS_KEY_ID: "sudoku",
  S3_SECRET_ACCESS_KEY: "sudoku-secret",
};

describe("loadConfig", () => {
  it.each([
    [undefined, "node-postgres"],
    ["development", "node-postgres"],
    ["test", "node-postgres"],
    ["production", "neon-serverless"],
  ])("selects the database driver for NODE_ENV=%s", (nodeEnv, driver) => {
    const config = loadConfig({ ...env, NODE_ENV: nodeEnv });

    expect(config.database.driver).toBe(driver);
  });

  it("normalizes URLs", () => {
    const config = loadConfig(env);

    expect(config.apiUrl).toBe("http://localhost:3000");
    expect(config.webOrigin).toBe("http://localhost:5173");
  });

  it("disables Google sign-in when its credentials are empty outside production", () => {
    const config = loadConfig({
      ...env,
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    });

    expect(config.auth.google).toBeUndefined();
  });

  it.each([
    [
      "Google credentials in production",
      {
        NODE_ENV: "production",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
      },
    ],
    ["half of the Google credentials", { GOOGLE_CLIENT_SECRET: "" }],
    ["a short auth secret", { AUTH_SECRET: "short" }],
    ["a database URL", { DATABASE_URL: undefined }],
  ])("requires %s", (_case, overrides) => {
    expect(() => loadConfig({ ...env, ...overrides })).toThrow(ConfigError);
  });
});
