<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": true` in the root `turbo.json` or `turbo.jsonc` to opt in; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Project guidance

- Read [README.md](README.md) and the README of the package you change, such as [apps/api/README.md](apps/api/README.md), before editing. Keep them accurate when behavior, configuration or commands change.
- `pnpm check` is the acceptance gate, identical to CI: Prettier, ESLint with zero warnings, `tsc` and the tests. Tests need Docker; they start the services in `compose.yaml` themselves.
- The API runs TypeScript through Node's type stripping: use erasable syntax only (no `enum`, namespaces or parameter properties) and import local files with their `.ts` extension.
- After changing `apps/api/src/db/schema`, generate a migration with `pnpm --filter @repo/api db:generate` and commit it.
