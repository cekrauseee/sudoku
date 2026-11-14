import { createMiddleware } from "hono/factory";

import { ApiError } from "../http/errors.ts";
import type { Auth, AuthSession } from "./index.ts";

export interface SessionVariables {
  user: AuthSession["user"];
  session: AuthSession["session"];
}

/** Rejects requests without a valid session and exposes its user and session. */
export function requireSession(auth: Auth) {
  return createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!result)
      throw new ApiError(401, "unauthorized", "Sign in to continue.");
    c.set("user", result.user);
    c.set("session", result.session);
    await next();
  });
}
