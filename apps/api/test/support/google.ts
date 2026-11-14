import { vi } from "vitest";

import type { TestApp } from "./app.ts";
import { call, WEB_ORIGIN, withCookies } from "./http.ts";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Claims of the Google ID token returned to the API after consent. */
export interface GoogleIdentity {
  email: string;
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

/**
 * Signs in through the real OAuth flow (`/sign-in/social`, then `/callback/google`),
 * replacing only Google's token endpoint. Returns the session cookie.
 */
export async function signInWithGoogle(
  app: TestApp,
  identity: GoogleIdentity,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const idToken = unsignedJwt({
    iss: "https://accounts.google.com",
    aud: "test-google-client-id",
    sub: identity.sub ?? `google-${identity.email}`,
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...identity,
  });

  const fetch = globalThis.fetch;
  const tokenEndpoint = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (!url.startsWith(TOKEN_ENDPOINT)) return fetch(input, init);
      return Promise.resolve(
        Response.json({
          access_token: "google-access-token",
          id_token: idToken,
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid email profile",
        }),
      );
    });

  try {
    const start = await call(app, "/api/auth/sign-in/social", {
      method: "POST",
      json: { provider: "google", callbackURL: `${WEB_ORIGIN}/` },
    });
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get("state") ?? "";
    const stateCookie = withCookies(start);

    const callback = await call(
      app,
      `/api/auth/callback/google?${new URLSearchParams({ code: "google-code", state }).toString()}`,
      { cookie: stateCookie },
    );
    const location = callback.headers.get("Location");
    if (callback.status !== 302 || location !== `${WEB_ORIGIN}/`) {
      throw new Error(
        `Google sign-in failed with ${callback.status} → ${location}`,
      );
    }
    return withCookies(callback, stateCookie);
  } finally {
    tokenEndpoint.mockRestore();
  }
}

function unsignedJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}.signature`;
}
