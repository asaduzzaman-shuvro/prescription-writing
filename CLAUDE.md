# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

RxPad BD: multi-tenant prescription-writing SaaS for Bangladeshi doctors. pnpm + Turborepo monorepo:
`apps/web` (Next.js 16, React 19, Tailwind 4), `packages/rx-core` (`@rx/core`, pure domain logic),
`packages/db` (`@rx/db`, Drizzle + Postgres RLS), `infra` (PowerSync via docker compose; Postgres runs locally on :5432, database `prescription_service`),
`spikes/print` (throwaway). Workspace packages export TypeScript source directly (no build step); Next
transpiles them via `transpilePackages`.

`apps/web/AGENTS.md` warns that Next 16 differs from training data: read `apps/web/node_modules/next/dist/docs/`
before writing Next-specific code.

## Commands

```bash
pnpm dev                    # web on :3000 (service worker disabled in dev)
pnpm typecheck              # turbo, all packages (no linter is configured)
pnpm test                   # turbo: vitest in rx-core + db (db tests hit the local dev DB)
pnpm db:migrate             # apply packages/db/migrations as the owner role
pnpm db:seed:dev            # idempotent; needs ./scripts/fetch-dev-seed.sh first

pnpm --filter @rx/core test test/dose.test.ts          # one test file
pnpm --filter @rx/core exec vitest run -t "shortcut"   # by test name
pnpm --filter @rx/db generate                          # drizzle-kit: SQL migration from schema diff

./scripts/e2e-db.sh                                    # e2e DB + its PowerSync; once, and after new migrations
cd apps/web && pnpm build && pnpm e2e                  # Playwright vs `next start` on :3100
cd apps/web && pnpm e2e e2e/ent.spec.ts                # one e2e spec
```

E2E runs against a **production build**, because the offline spec needs the service worker. It uses its own
database, `prescription_service_e2e`, and its own PowerSync on :8081 (compose service `powersync-e2e`, profile `e2e`),
never the dev ones; `./scripts/e2e-db.sh` sets both up (re-run after new migrations). Set `E2E_BASE_URL` to point at
an already-running server; it then uses whatever database that server was started with.
The `packages/db/test/rls.test.ts` integration test also needs the local Postgres (`prescription_service` database on `localhost:5432`).
Full local setup (setup.sql, env files, shared PowerSync JWT secret) is in README.md "Run locally".

## Architecture

**Two DB connections, two trust levels** (`apps/web/src/lib/db.ts`):
- `ownerDb` (`DATABASE_URL`, owner role) is for platform admin (`/admin`), server jobs, and migrations. It bypasses RLS.
- `appDb` (`DATABASE_URL_APP`, `rx_app` role) handles anything a clinic user triggers. Always wrap queries in
  `withTenant(appDb, {tenantId, userId}, tx => …)` (`packages/db/src/tenant-context.ts`). It sets `app.tenant_id`,
  and the `tenant_isolation` RLS policies read that setting. `rx_app` has column-level grants: it cannot read
  password hashes or write the catalogue.
- Sessions are an HS256 JWT cookie (`lib/session.ts`). Use `requireAdmin()` for `/admin` and `requireClinic(roles)` for clinic routes.

**Doctor app is offline-first and client-side.** `/doctor` is a single page with hash routing
(`lib/doctor/router.tsx`). Never add server routes or server components for doctor-app screens: navigation
must work with no network. `public/sw.js` caches the shell. Data lives in browser SQLite managed by PowerSync:
- Reads and writes go through `lib/doctor/data.ts` / `hooks.ts` using raw SQLite SQL. On the client, every
  column is text/integer/real: jsonb and arrays are JSON strings, booleans are 0/1.
- Downloads are defined in `infra/powersync/sync-config.yaml` (streams keyed by the JWT `tenant_id` from
  `/api/sync/token`).
- Uploads go from `lib/powersync/connector.ts` to `/api/sync/upload` to `lib/sync-upload.ts`. That file holds a
  per-table **allowlist** of writable columns and roles, forces `tenant_id`/owner fields from the session, and
  runs server-side rules: finalised prescriptions are immutable (edits create a new version), antibiotics need a
  fixed duration, and finalising writes `prescription_item`. Every op gets an audit-log row that records field
  names only, never clinical content.
- Client-side validation in `components/doctor/visit.tsx` mirrors the server rules. **Keep them identical.**
  A server-only rejection silently reverts a write the user saw succeed. It surfaces only through the
  `rx-sync-rejected` event.

**Adding or changing a synced table or column touches several places.** Check each one:
1. Drizzle schema in `packages/db/src/schema/*.ts`, then `pnpm --filter @rx/db generate`.
2. Hand-written SQL for grants to `rx_app`, RLS policy, `GRANT SELECT … TO powersync_role`, and
   `ALTER PUBLICATION powersync ADD TABLE …`. Write it as its own migration file and add it to
   `migrations/meta/_journal.json` (see `0002_rls.sql`, `0005_phase3_rls.sql`, `0008_chamber_insert_grant.sql`).
3. `infra/powersync/sync-config.yaml`. Streams that use `SELECT *` pick up new columns automatically; the
   others list columns explicitly.
4. `apps/web/src/lib/powersync/schema.ts`, the client table definitions.
5. `apps/web/src/lib/sync-upload.ts` `SPECS`, if clients may write it.
6. The doctor-app queries in `lib/doctor/data.ts` / `hooks.ts`.

**Printing.** `@rx/core` `renderPrescriptionHtml` (`packages/rx-core/src/print.ts`) is the single renderer for
both browser print (`lib/doctor/print.ts`) and server PDF (`lib/print-server.ts`, headless Chromium via
Playwright, fonts inlined from `public/fonts`). Medicine names print in CAPS by default (court order). Diagrams
in `prescription.doc` are client-writable, so the renderer passes them through the allowlist sanitiser in
`rx-core/src/sanitize.ts`. When adding a new SVG element or attribute, update the sanitiser and its tests.

**Specialty exams** (ENT, eye, vascular) are data, not code paths. A versioned `specialty_template.schema`
(JSONB, `SpecialtyTemplateSchema` in `rx-core/src/specialty.ts`) drives `components/doctor/specialty-exam.tsx`.
Answers are stored in `encounter.exam_findings`. `flattenFindings` turns them into printable lines and SVGs
(eardrum/TM map, audiogram, sketches in `sketches.ts` / `drawing.ts`). Curated templates live in
`rx-core/src/ent-template.ts` and `specialty-templates.ts`. When the curated ENT template changes, re-run
`pnpm db:seed:dev`: it publishes a new version, unless an admin has edited the template. Encounters keep the
template version they used. New specialties should not need a migration.

**Catalogue import** (`packages/db/src/import`): CSV goes through normalize, then plan (a dry-run diff of
new/changed/conflict/invalid), then apply. Rows merge on DAR number or company+brand+form+strength. Rows are
never hard-deleted and every row carries a `source`.

## Constraints

- **Dev medicine data must never reach production.** `data/dev-seed/` (gitignored) is scraped from MedEx,
  whose terms forbid reuse. `seed-dev.ts` refuses non-local hosts; keep that guard. Production data comes in
  via Admin → Import CSV from a licensed source.
- Demo logins (dev seed): `admin@rx.local / admin123`, `doctor@rx.local / doctor123` (ENT),
  `assistant@rx.local / assist123`.
- TS is strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`, so use `import type` for types.
- `docs/plans/` is gitignored and holds local working plans.
