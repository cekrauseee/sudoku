import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import { parseEnv, promisify } from "node:util";

import pg from "pg";

// Preparation steps shared by `pnpm dev` (development) and the test suite (test).

const run = promisify(execFile);

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
const envExampleFile = fileURLToPath(
  new URL("../.env.example", import.meta.url),
);
const composeFile = fileURLToPath(
  new URL("../../../compose.yaml", import.meta.url),
);

/** A failed preparation step, with the next action for the developer. */
export class SetupError extends Error {
  override name = "SetupError";
  readonly hint: string | undefined;
  readonly details: string | undefined;

  constructor(
    message: string,
    { hint, details }: { hint?: string; details?: string } = {},
  ) {
    super(message);
    this.hint = hint;
    this.details = details;
  }
}

export const report = {
  ok: (message: string) => {
    console.log(`✓ ${message}`);
  },
  warn: (message: string) => {
    console.log(`! ${message}`);
  },
  fail: (error: unknown) => {
    if (error instanceof SetupError) {
      console.error(`✗ ${error.message}`);
      if (error.hint) console.error(`  ${error.hint}`);
      if (error.details) console.error(`\n${error.details.trim()}`);
    } else {
      console.error("✗ Setup failed unexpectedly.");
      console.error(error);
    }
  },
};

const generateSecret = () => randomBytes(32).toString("base64url");

/**
 * Creates `.env` from `.env.example`, or adds the keys missing from an existing one.
 * Existing values are kept; an empty `AUTH_SECRET` receives a generated secret.
 */
export async function ensureEnvFile(): Promise<{
  created: boolean;
  added: string[];
}> {
  const example = await readFile(envExampleFile, "utf8");

  if (!existsSync(envFile)) {
    await writeFile(
      envFile,
      example.replace(/^AUTH_SECRET=$/mu, `AUTH_SECRET=${generateSecret()}`),
    );
    return { created: true, added: [] };
  }

  let content = await readFile(envFile, "utf8");
  const current = parseEnv(content);
  const missing = Object.entries(parseEnv(example)).filter(
    ([key]) => !(key in current),
  );

  if (current.AUTH_SECRET === "") {
    content = content.replace(
      /^AUTH_SECRET=.*$/mu,
      `AUTH_SECRET=${generateSecret()}`,
    );
  }
  if (missing.length > 0) {
    const lines = missing.map(([key, value]) =>
      key === "AUTH_SECRET" && !value
        ? `${key}=${generateSecret()}`
        : `${key}=${value}`,
    );
    content = `${content.trimEnd()}\n\n# Added by setup\n${lines.join("\n")}\n`;
  }
  if (current.AUTH_SECRET === "" || missing.length > 0)
    await writeFile(envFile, content);

  return { created: false, added: missing.map(([key]) => key) };
}

/** Variables from `.env.example`, overridden by `.env` when it exists. */
export async function readEnvFiles(): Promise<Record<string, string>> {
  const example = parseEnv(await readFile(envExampleFile, "utf8"));
  const local = existsSync(envFile)
    ? parseEnv(await readFile(envFile, "utf8"))
    : {};
  return { ...example, ...local } as Record<string, string>;
}

/**
 * Starts the Compose services and waits until their health checks pass. Images are
 * downloaded on the first run, which can take a few minutes.
 */
export async function startServices(): Promise<void> {
  try {
    await run("docker", ["info", "--format", "{{.ServerVersion}}"], {
      timeout: 15_000,
    });
  } catch (error) {
    throw new SetupError("Docker is not available.", {
      hint: "Start Docker (or restart it if it is unresponsive) and run the command again.",
      details: commandOutput(error),
    });
  }

  await assertPortsAvailable();

  try {
    await run(
      "docker",
      [
        "compose",
        "--file",
        composeFile,
        "up",
        "--detach",
        "--quiet-pull",
        "--wait",
        "--wait-timeout",
        "120",
      ],
      { timeout: 15 * 60_000 },
    );
  } catch (error) {
    throw new SetupError(
      "The local services (postgres, storage) did not start.",
      {
        hint: "Run `docker compose logs` for details.",
        details: commandOutput(error),
      },
    );
  }
}

/**
 * Fails when a port published by `compose.yaml` is already taken, naming the Docker
 * container that holds it when there is one. Ports held by this project's running
 * services are expected.
 */
async function assertPortsAvailable(): Promise<void> {
  const compose = ["compose", "--file", composeFile];
  const [config, running] = await Promise.all([
    run("docker", [...compose, "config", "--format", "json"]),
    run("docker", [...compose, "ps", "--format", "json"]),
  ]);

  const { services } = JSON.parse(config.stdout) as {
    services: Record<string, { ports?: { published?: string }[] }>;
  };
  const ownPorts = new Set(
    running.stdout
      .split("\n")
      .filter(Boolean)
      .flatMap(
        (line) =>
          (JSON.parse(line) as { Publishers?: { PublishedPort: number }[] })
            .Publishers ?? [],
      )
      .map(({ PublishedPort }) => PublishedPort),
  );

  const required = Object.entries(services).flatMap(([service, { ports }]) =>
    (ports ?? []).flatMap(({ published }) =>
      published ? [{ service, port: Number(published) }] : [],
    ),
  );
  const conflicts = [];
  for (const { service, port } of required) {
    if (ownPorts.has(port) || !(await isPortInUse(port))) continue;
    const { stdout } = await run("docker", [
      "ps",
      "--filter",
      `publish=${port}`,
      "--format",
      "{{.Names}}",
    ]);
    const container = stdout.trim().split("\n")[0];
    conflicts.push(
      `port ${port} (${service}) is used by ${container ? `container ${container}` : "another process"}`,
    );
  }

  if (conflicts.length > 0) {
    throw new SetupError(`Required ports are taken: ${conflicts.join("; ")}.`, {
      hint: "Stop what is using them (for a container, `docker stop <name>`) and run the command again.",
    });
  }
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}

/** Creates the database named in `url` when it does not exist. Returns whether it was created. */
export async function ensureDatabase(url: string): Promise<boolean> {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";

  return withClient(maintenanceUrl.href, async (client) => {
    const { rowCount } = await client.query(
      "select 1 from pg_database where datname = $1",
      [name],
    );
    if (rowCount) return false;
    await client.query(`create database ${client.escapeIdentifier(name)}`);
    return true;
  });
}

/** Drops every object of the database, so migrations run from scratch. */
export async function resetDatabase(url: string): Promise<void> {
  await withClient(url, async (client) => {
    await client.query("drop schema if exists drizzle cascade");
    await client.query("drop schema public cascade");
    await client.query("create schema public");
  });
}

async function withClient<T>(
  url: string,
  action: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (error) {
    throw new SetupError("Could not connect to PostgreSQL.", {
      hint: "Check DATABASE_URL in apps/api/.env and that the postgres service is running.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

function commandOutput(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const { stderr, stdout, message } = error as {
    stderr?: string;
    stdout?: string;
    message?: string;
  };
  const output = [stderr, stdout].filter(Boolean).join("\n");
  return output.length > 0 ? output : (message ?? "");
}
