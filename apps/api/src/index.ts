import { serve } from "@hono/node-server";

import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createServices } from "./services.ts";

const config = loadConfig();
const services = createServices(config);
const app = createApp(services);

if (!config.auth.google) {
  console.warn(
    "! Google sign-in is disabled: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in apps/api/.env.",
  );
}

const server = serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`✓ API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    void services.close().finally(() => process.exit(0));
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
