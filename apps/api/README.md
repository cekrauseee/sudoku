# API

HTTP API for Sudoku: Google sign-in, sessions and the player profile. Built with [Hono](https://hono.dev) on Node.js, [Better Auth](https://www.better-auth.com), [Drizzle ORM](https://orm.drizzle.team) over PostgreSQL, and S3-compatible object storage for profile photos.

## Development

From the repository root:

```sh
pnpm dev     # prepares the environment, then starts the API on http://localhost:3000
pnpm test    # prepares an isolated test environment, then runs the suites
```

Both commands prepare what they need, and repeating them keeps existing data and configuration:

1. Create `apps/api/.env` from [`.env.example`](.env.example), or add the keys missing from an existing file. An empty `AUTH_SECRET` receives a generated secret.
2. Check that the services' ports (5432, 9000 and 9001) are free, naming the container or process that holds one, then start the services in [`compose.yaml`](../../compose.yaml) with Docker and wait until they are healthy.
3. Create the database when missing and apply pending migrations.
4. Create the storage bucket when missing.

Run only the preparation with `pnpm turbo run setup`. Each failed step prints the cause and the next action.

| Command (in `apps/api`) | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `pnpm dev`              | Start the API in watch mode (run `setup` first)     |
| `pnpm run setup`        | Prepare the development environment                 |
| `pnpm test`             | Run the tests once                                  |
| `pnpm test:watch`       | Run the tests in watch mode                         |
| `pnpm lint`             | Lint with type-aware rules                          |
| `pnpm check-types`      | Type-check with TypeScript 7                        |
| `pnpm db:generate`      | Generate a migration after changing `src/db/schema` |
| `pnpm db:studio`        | Prepare the environment and open Drizzle Studio     |

### Google sign-in

Sign-in is disabled until a Google OAuth client is configured; the rest of the API works without it.

1. Create an OAuth client of type _Web application_ in the [Google Cloud console](https://console.cloud.google.com/apis/credentials).
2. Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `apps/api/.env`.

### Services

| Service    | Image                 | Address                                                  |
| ---------- | --------------------- | -------------------------------------------------------- |
| PostgreSQL | `postgres:18-alpine`  | `localhost:5432`, user `sudoku`, password `sudoku`       |
| Storage    | `rustfs/rustfs:1.0.5` | S3 API `localhost:9000`, console `http://localhost:9001` |

[RustFS](https://rustfs.com) is an S3-compatible server; sign in to its console with `sudoku` / `sudoku-secret`. Stop the services with `pnpm services:down` from the root; `docker compose down --volumes` also deletes their data.

## Configuration

The API reads its configuration from environment variables, validated at startup by [`src/config.ts`](src/config.ts). `pnpm dev` loads them from `apps/api/.env`.

| Variable                                   | Description                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `NODE_ENV`                                 | `development` (default), `test` or `production`. Selects the database driver.         |
| `PORT`                                     | HTTP port. Default `3000`.                                                            |
| `API_URL`                                  | Public URL of the API. OAuth callbacks and avatar URLs are built from it.             |
| `WEB_URL`                                  | Web app origin, allowed to call the API with credentials (CORS and Better Auth).      |
| `AUTH_SECRET`                              | Secret that signs sessions, at least 32 characters.                                   |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client. Optional outside production.                                     |
| `DATABASE_URL`                             | PostgreSQL connection URL.                                                            |
| `S3_ENDPOINT`                              | S3 endpoint. Leave empty for AWS S3; set for other providers (path-style addressing). |
| `S3_REGION`, `S3_BUCKET`                   | Storage region and bucket.                                                            |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Storage credentials.                                                                  |

With `NODE_ENV=production` the API connects through [Neon's serverless driver](https://github.com/neondatabase/serverless) (a WebSocket pool); otherwise it uses [node-postgres](https://node-postgres.com). Migrations always run over a regular PostgreSQL connection.

## Structure

```text
src/
├── index.ts          Node server entry point
├── app.ts            Routes, CORS and error handling; exports `AppType`
├── services.ts       Builds the long-lived dependencies from the configuration
├── config.ts         Environment validation
├── storage.ts        S3-compatible object storage
├── auth/             Better Auth instance, Google profile mapping, session middleware
├── db/               Drizzle client, schema and migration runner
├── http/             Error and validation helpers
└── modules/profile/  Profile names and avatars: rules, service and routes
drizzle/              Generated SQL migrations
scripts/              Environment preparation
test/                 HTTP-level tests and their helpers
```

Modules receive their dependencies as arguments; `createServices` wires them once, and tests build the same app against a separate database and bucket.

## HTTP API

Errors share one shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The request is invalid.",
    "issues": [{ "path": "firstName", "message": "Must not be empty." }]
  }
}
```

`issues` is present for validation errors (400). Other codes include `unauthorized` (401), `not_found` (404), `no_uploaded_avatar` (409), `image_too_large` (413) and `invalid_image` (422).

Browsers send the session cookie set by Better Auth; requests from the web app must include credentials. [`AppType`](src/app.ts) describes the routes for a typed client built with `hono/client`.

### Authentication and sessions

Better Auth serves these endpoints under `/api/auth` ([reference](https://www.better-auth.com/docs/concepts/api)):

| Endpoint                                                             | Purpose                                                                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `POST /sign-in/social`                                               | Start Google sign-in: `{ "provider": "google", "callbackURL": "<web URL>" }` returns the Google URL to open.         |
| `GET /callback/google`                                               | Google's redirect target. Creates the user on first sign-in, sets the session cookie and redirects to `callbackURL`. |
| `GET /get-session`                                                   | Current session and user, or `null`.                                                                                 |
| `POST /sign-out`                                                     | End the current session.                                                                                             |
| `GET /list-sessions`                                                 | The user's active sessions.                                                                                          |
| `POST /revoke-session`, `/revoke-other-sessions`, `/revoke-sessions` | End one, all other, or all sessions.                                                                                 |
| `POST /delete-user`                                                  | Delete the account, its sessions and stored photos. Requires a session from the last 24 hours.                       |

Google is the only sign-in method. On first sign-in the user inherits Google's given name, family name and photo; later sign-ins do not overwrite profile edits. Better Auth's `/update-user` and `/change-email` endpoints are disabled: profile changes go through `/api/me`.

### Profile

| Endpoint                                      | Purpose                                               |
| --------------------------------------------- | ----------------------------------------------------- |
| `GET /api/me`                                 | The signed-in user's profile.                         |
| `PATCH /api/me`                               | Update `firstName`, `lastName` and the avatar choice. |
| `PUT /api/me/avatar`                          | Upload a photo (multipart) and use it as the avatar.  |
| `PATCH /api/me/avatar`                        | Re-crop the uploaded photo: `{ "crop": … }`.          |
| `GET /api/me/avatar/source`                   | The uploaded photo before cropping, for re-cropping.  |
| `GET /api/users/:userId/avatar/:imageId.webp` | A cropped avatar. Public and cacheable forever.       |

A profile:

```json
{
  "id": "7f1c…",
  "email": "alex@example.com",
  "firstName": "Alex",
  "lastName": "Rivera",
  "avatar": {
    "kind": "provider",
    "url": "https://lh3.googleusercontent.com/…"
  },
  "createdAt": "2026-11-14T12:00:00.000Z"
}
```

`avatar` takes one of three forms:

| `kind`     | Fields        | Meaning                                                                                                    |
| ---------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| `provider` | `url`         | Google photo; `null` when there is none, and clients show initials.                                        |
| `preset`   | `preset`      | A platform avatar: `blue-sun`, `teal-diamond`, `amber-horizon`, `violet-moon`, `pink-peak` or `ink-cross`. |
| `upload`   | `url`, `crop` | An uploaded photo, cropped to a 512 × 512 WebP image.                                                      |

#### Names

Names are normalized (Unicode NFC, collapsed whitespace) and limited to 30 characters (code points), without control characters. The first name is required; an empty `lastName` removes it. Names inherited from Google are shortened to fit, and the first name falls back to Google's display name or the email address when Google omits it.

#### Choosing an avatar

`PATCH /api/me` with `{ "avatar": { "kind": "preset", "preset": "violet-moon" } }` or `{ "avatar": { "kind": "provider" } }`. Choosing either deletes a previously uploaded photo.

#### Uploading a photo

`PUT /api/me/avatar` takes `multipart/form-data` with:

- `image`: JPEG, PNG or WebP, at most 10 MB and at least 64 × 64 pixels.
- `crop` (optional): JSON crop; defaults to the largest centered square.

The API orients the photo from its EXIF data, keeps a copy of up to 2048 pixels per side without metadata (such as location) for re-cropping, and renders the avatar from the crop:

```json
{ "rotation": 90, "x": 0.1, "y": 0, "width": 0.5, "height": 0.75 }
```

The photo is first rotated clockwise by `rotation` (0, 90, 180 or 270). `x`, `y`, `width` and `height` are fractions of the rotated photo's width and height, so they do not depend on its resolution; the region must stay inside the photo and should be square in pixels. Each crop produces a new avatar URL and deletes the previous image.

## Data

Better Auth's tables live in [`src/db/schema/auth.ts`](src/db/schema/auth.ts): `users`, `sessions`, `accounts` and `verifications`. `users` also holds the profile: `first_name`, `last_name`, the inherited `image`, and the avatar choice (`avatar_kind`, `avatar_preset`, `avatar_upload`). Check constraints keep name lengths and the avatar fields consistent.

Stored objects of a user live under `users/<id>/` in the bucket: `avatar/<imageId>.webp` and `avatar-source/<sourceId>.webp`. Deleting the account deletes the prefix.

After changing the schema, run `pnpm db:generate` and commit the migration in `drizzle/`. The next `pnpm dev` or `pnpm test` applies it.

## Tests

Tests exercise the HTTP API against real PostgreSQL and storage services. The global setup creates a `<database>_test` database migrated from scratch and an empty `<bucket>-test` bucket on the development services; each test starts from empty tables and bucket.

Sign-in tests run Better Auth's actual OAuth flow (`/sign-in/social`, then `/callback/google`) and replace only Google's token endpoint, which returns an ID token for the test identity.
