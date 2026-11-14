import type { TestApp } from "./app.ts";

/** Origin of the web app, trusted by the test configuration. */
export const WEB_ORIGIN = "http://localhost:5173";

export interface RequestOptions {
  method?: string;
  cookie?: string | undefined;
  json?: unknown;
  form?: FormData;
}

/** Sends a request as the web app would: from its origin, with the session cookie. */
export function call(app: TestApp, path: string, options: RequestOptions = {}) {
  const headers = new Headers({ Origin: WEB_ORIGIN });
  if (options.cookie) headers.set("Cookie", options.cookie);

  let body: RequestInit["body"];
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }

  return app.request(path, { method: options.method ?? "GET", headers, body });
}

/** Applies a response's `Set-Cookie` headers to a `Cookie` header value. */
export function withCookies(response: Response, cookie = ""): string {
  const jar = new Map(
    cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => {
        const separator = pair.indexOf("=");
        return [pair.slice(0, separator), pair.slice(separator + 1)] as const;
      }),
  );

  for (const header of response.headers.getSetCookie()) {
    const [pair = "", ...attributes] = header.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    const expired = attributes.some((attribute) =>
      /^\s*max-age=0\s*$/iu.test(attribute),
    );
    if (expired || value === "") jar.delete(name);
    else jar.set(name, value);
  }

  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}
