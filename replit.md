# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### E2E Testing (Playwright)

End-to-end tests use Playwright with Chromium. The browser must be installed before running tests:

```bash
pnpm exec playwright install chromium
```

**Important (Replit/NixOS):** Do NOT use `--with-deps` flag — it attempts apt installs which are not available in Replit. Instead, system-level browser dependencies (libgbm, mesa) are installed via Nix and persisted in `replit.nix`. The post-merge script installs the browser binary automatically.

Run e2e tests: `pnpm test:e2e`
Config: `playwright.config.ts`
Tests: `tests/e2e/`

### Testing

The `api-server` package uses **Vitest** for automated testing:
- Unit tests: `src/lib/paprika.test.ts` — tests `mapPaprikaRecipeToLocal`, `fetchPaprikaRecipeList`, `fetchPaprikaRecipeDetail`
- Integration tests: `src/routes/paprika-import.test.ts` — tests `POST /api/paprika/import` with mocked DB and Paprika API
- Run tests: `pnpm --filter @workspace/api-server run test`
- Config: `artifacts/api-server/vitest.config.ts`

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

## Features

### Recipe Import Agent (`artifacts/recipe-agent`)

- **My Recipes**: Browse saved recipes with compliance score indicators per dietary profile
- **AI Generate**: Generate recipes via AI with a "Who's eating this?" profile selector; shows dietary suggestions after generation
- **Import URL**: Import recipes from any food website with a "Who's eating this?" profile selector; shows dietary suggestions after extraction
- **Recipe Detail**: Full recipe view with a "Dietary Compliance" section listing each profile's score (0-100%) and AI-generated reason
- **Settings**: 
  - Dietary Profiles card — create/edit/delete named profiles (e.g. "Me", "Sarah") with free-text dietary needs
  - Paprika Integration — link Paprika account for recipe export/sync
  - Categorize Recipes — AI-powered Paprika category suggestions

### Database Schema

- `recipes` — saved recipes
- `paprika_credentials` — encrypted Paprika credentials
- `dietary_profiles` — named dietary profiles with descriptions
- `recipe_compliance_scores` — AI-computed compliance scores (0-100) with reasons per recipe+profile pair; `versionId` is nullable (NULL = base recipe score, non-null = version-specific score)
- `recipe_versions` — saved compliance-fix versions of recipes (label, ingredients, directions, isOriginal); each recipe has an "Original" version seeded on first use

Schema changes applied via `drizzle push` (see `scripts/post-merge.sh`). The DB already has `recipe_versions` and the nullable `versionId` FK on `recipe_compliance_scores`.

### API Routes (`artifacts/api-server`)

- `GET/POST /api/dietary-profiles` — list/create dietary profiles
- `PATCH/DELETE /api/dietary-profiles/:id` — update/delete a profile (re-scores only base recipe scores, scoped with `versionId IS NULL`)
- `GET /api/recipes/compliance-scores/bulk` — all base compliance scores (for recipe cards, filters `versionId IS NULL`)
- `GET /api/recipes/:id/compliance-scores?versionId=` — compliance scores for a single recipe; optional `versionId` query param for version-specific scores
- `POST /api/recipes/compliance-score` — compute/recompute a base compliance score (scoped with `versionId IS NULL`)
- `POST /api/recipes/dietary-suggestions` — get AI dietary suggestions for a recipe+profiles
- `POST /api/recipes/:id/compliance-fix-preview` — AI-powered ingredient swap suggestions with projected compliance scores
- `POST /api/recipes/:id/compliance-versions` — save a compliance-fixed version of a recipe
- `GET /api/recipes/:id/versions` — list all versions for a recipe (summary: id, label, isOriginal, createdAt)
- `GET /api/recipes/:id/versions/:versionId` — get full version data (ingredients, directions)
- Compliance scores are auto-computed when a recipe is saved or a profile is created/updated

## ChatGPT Recipe Import Feature

Allows importing recipes from ChatGPT into a pending queue for review before adding to the main collection.

### DB Tables Added
- `chatgpt_pending_recipes` — stores recipes queued from ChatGPT (mirrors recipe fields + `status`, `createdAt`)
- `api_keys` — stores hashed import API key (single-row settings table)

### API Routes (`/api/chatgpt/`)
- `POST /import` — accepts recipe payload + Bearer token auth, saves to pending table
- `GET /pending` — returns all pending recipes
- `POST /pending/:id/confirm` — moves pending recipe to main `recipes` table, deletes from pending
- `DELETE /pending/:id` — dismisses (deletes) a pending recipe
- `GET /api-key` — returns configured status + masked key (last 4 chars)
- `POST /api-key/regenerate` — generates new key, hashes + stores it, returns plaintext once

### Frontend
- **Settings page** (`/settings`): Added ChatGPT Integration card below Paprika Integration. Shows masked API key with Regenerate button (with warning), numbered setup instructions, and copyable OpenAPI spec for Custom GPT action configuration.
- **My Recipes page** (`/`): Added collapsible `ChatgptImportsSection` at the top. Appears only when pending recipes exist, shows badge count, polls every 30 seconds. Each card shows full recipe preview (name, description, ingredients/directions expandable, image, metadata). "Add to Collection" confirms; "Dismiss" (X) deletes.
