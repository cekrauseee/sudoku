# Sudoku

A minimalist Sudoku game. This repository is a [Turborepo](https://turborepo.dev) monorepo managed with [pnpm](https://pnpm.io).

## Requirements

- Node.js 26 (see [`.node-version`](.node-version))
- pnpm 11, activated with `corepack enable`
- Docker with Compose, for the local PostgreSQL and storage services

## Getting started

```sh
pnpm install
pnpm dev
```

`pnpm dev` creates `apps/api/.env`, starts the services in [`compose.yaml`](compose.yaml), applies database migrations and starts the API on http://localhost:3000. Google sign-in needs an OAuth client; see [Google sign-in](apps/api/README.md#google-sign-in).

## Commands

| Command              | Purpose                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `pnpm dev`           | Prepare the environment and start the applications in watch mode   |
| `pnpm test`          | Prepare an isolated test environment and run the tests             |
| `pnpm check`         | Check formatting, lint, types and tests. CI runs the same command. |
| `pnpm lint`          | Lint every package                                                 |
| `pnpm check-types`   | Type-check every package                                           |
| `pnpm format`        | Format the repository with Prettier                                |
| `pnpm services:down` | Stop the local services, keeping their data                        |

## Repository layout

| Path                                                       | Purpose                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| [`apps/api`](apps/api/README.md)                           | HTTP API: Google sign-in, sessions and profiles         |
| [`packages/eslint-config`](packages/eslint-config/base.js) | Shared ESLint configuration                             |
| [`packages/typescript-config`](packages/typescript-config) | Shared `tsconfig` bases                                 |
| [`compose.yaml`](compose.yaml)                             | Local PostgreSQL 18 and RustFS (S3-compatible) services |

## Tooling

- **TypeScript.** `tsc` is TypeScript 7 (`@typescript/native`). Tools that still need the classic compiler API, such as typescript-eslint, resolve `typescript` to `@typescript/typescript6`. Both are pinned in the [pnpm catalog](pnpm-workspace.yaml). The API runs TypeScript directly with Node's type stripping, so it uses only erasable syntax and imports files with their `.ts` extension.
- **Formatting.** Prettier with its default options. `pnpm check` reports differences without changing files.
- **Lint.** ESLint with `typescript-eslint`'s strict and stylistic type-checked presets, `eslint-config-prettier` and `eslint-plugin-turbo`. Warnings fail the lint task.
- **CI.** [GitHub Actions](.github/workflows/ci.yml) runs `pnpm check` on pull requests and on `main`, with the Node.js and pnpm versions declared in the repository.
