import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

import { AUTH_BASE_PATH } from "./auth/index.ts";
import { ApiError } from "./http/errors.ts";
import { meRoutes, userRoutes } from "./modules/profile/profile.routes.ts";
import type { Services } from "./services.ts";

export function createApp(services: Services) {
  const { auth, config, db, storage } = services;
  const app = new Hono();

  if (config.environment === "development") app.use(logger());

  app.use(
    "/api/*",
    cors({
      origin: config.webOrigin,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 600,
    }),
  );

  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json(error.toBody(), error.status);
    if (error instanceof HTTPException) return error.getResponse();
    console.error(error);
    return c.json(
      new ApiError(500, "internal_error", "Something went wrong.").toBody(),
      500,
    );
  });

  app.notFound((c) =>
    c.json(new ApiError(404, "not_found", "Not found.").toBody(), 404),
  );

  const routes = app
    .get("/health", async (c) => {
      const [database, objectStorage] = await Promise.allSettled([
        db.execute(sql`select 1`),
        storage.check(),
      ]);
      const checks = {
        database: database.status === "fulfilled" ? "ok" : "unavailable",
        storage: objectStorage.status === "fulfilled" ? "ok" : "unavailable",
      } as const;
      const healthy = checks.database === "ok" && checks.storage === "ok";
      return c.json(
        { status: healthy ? "ok" : "unavailable", checks },
        healthy ? 200 : 503,
      );
    })
    .on(["GET", "POST"], `${AUTH_BASE_PATH}/*`, (c) => auth.handler(c.req.raw))
    .route("/api/me", meRoutes(services))
    .route("/api/users", userRoutes(services));

  return routes;
}

/** Route types for a typed client (`hono/client`). */
export type AppType = ReturnType<typeof createApp>;
