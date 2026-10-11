# RxPad BD — prescription writing for Bangladeshi doctors

Multi-tenant SaaS with an **Admin panel** (medicine catalogue, libraries, templates, doctors, billing)
and an **offline-first Doctor panel** (patients, visits, bilingual prescriptions, printing on the
doctor's own pad). General practice plus ENT, eye (ophthalmology) and vascular specialty modules.

## Layout

```
apps/web            Next.js 16 app — /admin (online), /doctor (PWA, works offline), /v/<token> (QR verification)
packages/rx-core    Shared domain logic: dose shortcuts (1+0+1, tds, af, 7d…), Bangla formatting,
                    print renderer, ENT / eye / vascular exam templates + diagrams, Code 39 barcode, FHIR export
packages/db         Drizzle schema + migrations (RLS), CSV import (dry-run diff), dev seed
infra               docker compose: PowerSync service (Postgres runs on your machine)
spikes/print        Bangla print/PDF spike (Phase 0 evidence)
```

## Run locally

```bash
pnpm install
# Local Postgres (Homebrew etc.) on localhost:5432 with logical replication for PowerSync, once:
#   psql -d postgres -c "ALTER SYSTEM SET wal_level = logical"   then restart Postgres
psql -d postgres -c "CREATE ROLE prescription_service LOGIN CREATEROLE PASSWORD 'prescription_service'"  # app owner; runs the migrations
createdb -O prescription_service prescription_service
psql -d prescription_service -f infra/powersync/setup.sql             # once, as a superuser: replication role + storage DB
pnpm db:migrate
./scripts/fetch-dev-seed.sh && pnpm db:seed:dev                        # DEV ONLY data, see below
#   CSVs kept elsewhere (gitignored, e.g. resources/archive): SEED_DIR=resources/archive pnpm db:seed:dev
cp infra/.env.example infra/.env && cp apps/web/.env.example apps/web/.env.local
#   put the same base64url secret in infra/.env (PS_JWT_SECRET) and apps/web/.env.local (POWERSYNC_JWT_SECRET)
docker compose -f infra/docker-compose.yml up -d
pnpm dev                                                               # http://localhost:3000
```

The dev database URL defaults to `postgres://prescription_service:prescription_service@localhost:5432/prescription_service` (`packages/db/src/dev-urls.ts`); set `DATABASE_URL` /
`DATABASE_URL_APP` to use another server. PowerSync reaches it from Docker via `host.docker.internal`; override
`PS_DATA_SOURCE_URI` / `PS_STORAGE_SOURCE_URI` in `infra/.env` if your server differs.

Re-running `pnpm db:seed:dev` on an existing dev database adds any new specialties' pick-lists and exam templates,
and publishes a new ENT exam template version when the curated one in code has changed (admin-edited ones are left alone).
To try the eye or vascular exam, change a doctor's specialty in Admin → Doctors.

The lab test catalogue (`packages/rx-core/src/lab-catalogue/`) is our own curated data, not MedEx-derived:
`pnpm db:seed:labs` writes it to any database, production included (`db:seed:dev` runs it too). Re-run it after the
catalogue changes; rows the platform admin edited are left alone, and clinics' own changes are separate rows.
The platform admin edits it in Admin → Lab catalogue; a clinic adjusts ranges and units, hides tests and adds its
own in Settings → Lab settings, which also sets the lab report's heading and signatories. The clinic lab itself is
the **Lab** screen of the doctor app (all roles): pick the patient's tests, enter results, print.

Demo logins (dev seed): `admin@rx.local / admin123`, `doctor@rx.local / doctor123` (ENT),
`assistant@rx.local / assist123`.

## Tests

```bash
pnpm typecheck
pnpm test                       # rx-core + db unit tests, incl. RLS isolation against the dev DB
./scripts/e2e-db.sh                     # once, and after new migrations: e2e database + its PowerSync (:8081)
cd apps/web && pnpm build && pnpm e2e   # Playwright against a production build
```

E2E doesn't touch the dev database: the server Playwright starts uses `prescription_service_e2e` and the `powersync-e2e`
service (compose profile `e2e`). Test patients pile up there; drop `prescription_service_e2e` and
`powersync_storage_e2e` and re-run the script to start clean.

The e2e suite covers: bilingual prescription + PDF + QR verification, offline write → reconnect →
sync, assistant restrictions (server rejects tampered uploads), CSV import dry-run/commit, ENT exam
with eardrum (TM) map — quadrants, symbols, free-hand drawing, optional blank drums — throat & neck
pictures (oropharynx, larynx, neck node levels) and audiogram printed as diagrams, interaction/allergy alerts, serial booking →
check-in → waiting-room display → fees/reports, SMS credit charging, FHIR export, bKash payment recording.

## Deploy (shared cPanel)

Shared cPanel can't run Docker, and Docker only ever hosted PowerSync. cPanel runs the **web app only**:

- **Postgres**: managed, with logical replication (e.g. Supabase). cPanel's PostgreSQL can't create the replication
  role or set `wal_level=logical`.
- **PowerSync**: PowerSync Cloud instead of the container.
- **Server PDF** (`/api/print/.../pdf`) needs Chromium, which shared hosting can't run. It answers 503, and browser
  print is the path to use.

```bash
./scripts/build-cpanel.sh      # → dist/rxpad-cpanel.tar.gz (Next standalone, flat node_modules, no symlinks)
```

1. Database, once: run the role part of `infra/powersync/setup.sql` (strong passwords; PowerSync Cloud has its own
   storage, so skip the storage user and DB), create the owner and `rx_app` roles as in "Run locally", then from your
   machine `DATABASE_URL=<owner url> pnpm db:migrate` and `pnpm db:seed:labs`. **Never `db:seed:dev`.**
2. PowerSync Cloud, once: connect it with the `powersync_role` URI, paste `infra/powersync/sync-config.yaml` as the
   sync config, add an HS256 client-auth key matching `POWERSYNC_JWT_KID`/`POWERSYNC_JWT_SECRET` with audience
   `rxpad`. Its instance URL is `POWERSYNC_URL`.
3. cPanel: turn on AutoSSL (the service worker needs HTTPS). Upload the archive to your **home folder, not
   `public_html`**, and extract it there; it creates `~/rxpad`. In **Setup Node.js App**, pick Node ≥ 20.9, set
   application root `rxpad`, application URL the domain, startup file
   `index.js` (it starts `apps/web/server.js`), and mode production. Don't run NPM install, because the archive already holds its
   `node_modules`. Set the env vars there (`DATABASE_URL`, `DATABASE_URL_APP`, `SESSION_SECRET`, `POWERSYNC_URL`,
   `POWERSYNC_JWT_SECRET`, `POWERSYNC_JWT_KID`, `PUBLIC_BASE_URL`, `CRON_SECRET`, SMS/email/SSLCommerz as used),
   then Restart.
4. Cron Jobs: `curl -X POST -H "authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/followup-reminders`.
5. Updates: re-run the script, upload, extract over the old files, Restart. Run new migrations from your machine first.

**403 or a file listing on the domain?** The app was extracted into `public_html`. Apache then serves the folder as
plain files instead of passing requests to the Node app, and anyone can download `node_modules/` and the server code.
An `index.html` won't fix it. Delete `apps/`, `node_modules/` and `index.js` from `public_html` (keep `.htaccess`),
delete that app in Setup Node.js App, then do step 3 again. Afterwards, `public_html/.htaccess` should hold the
`CLOUDLINUX PASSENGER CONFIGURATION` block with `PassengerAppRoot` pointing at `~/rxpad`. Startup errors go to
`~/rxpad/stderr.log`. The archive also carries these steps as `rxpad/DEPLOY-CPANEL.txt`.

The host must allow outbound connections to the database port (5432, or Supabase's pooler on 6543). Many shared hosts
block them, so check before you start. The archive is built on your machine, so `sharp` inside it is the wrong platform
for Linux. That's harmless, because the app doesn't use `next/image`.

## Key design points

- **Offline:** the doctor app is one page (`/doctor`, hash routes) cached by `public/sw.js`. Data lives
  in browser SQLite synced by PowerSync (`infra/powersync/sync-config.yaml`). Local writes go through
  `/api/sync/upload`, which validates per table and role and writes on the `rx_app` RLS connection.
- **Security:** Postgres row-level security on every tenant table, plus an app role that can't read
  password hashes or write the catalogue. Finalised prescriptions are immutable (edits create v2).
  An append-only audit log records clinical content as field names only.
- **Printing:** one renderer (`@rx/core` `renderPrescriptionHtml`) is used for both browser print and
  server PDF. Fonts are bundled (Noto Sans Bengali, OFL), medicine names print in CAPS (2017 High
  Court order), page margins are calibrated to the doctor's pre-printed pad, and long prescriptions
  flow onto page 2.
- **Catalogue import:** CSV with column mapping and a dry run (new / changed / conflict / invalid).
  Rows merge on DAR number or company+brand+form+strength. Nothing is ever hard-deleted, and every
  row carries its `source`.

## Before production — open items

| Area | Status |
|---|---|
| **Medicine data** | The Kaggle dev seed is scraped from MedEx and **must not ship**. The seed script refuses non-local hosts. Licence MedEx/DIMS data or obtain a DGDA export, then load it via Admin → Import CSV. |
| Interactions | Engine and admin editor work; the table is empty except test data. Needs a licensed set or pharmacist-curated pairs. |
| Paediatric dose limits | Engine works when `paed max mg/kg/day` is set per generic; values must be entered by a clinician. |
| Specialty templates & lists | ENT, eye and vascular are built from standard practice; **a consultant in each specialty must review** them, including the TM map symbols (grommet, cholesteatoma, tympanosclerosis, fluid level, granulation, graft, bulging) and the throat & neck pictures (areas, states, symbols, left/right orientation). |
| SSLCommerz online payment | Code path written, **not verified**: needs sandbox store credentials. Manual bKash/Nagad/bank recording is verified. |
| SMS gateway | Verified with the `console` provider only. Configure a BTRC-authorised gateway (`SMS_HTTP_URL`) and test with a real number. |
| Voice input | Web Speech API (Chrome; online only). Not covered by automated tests. |
| FHIR | Bundle export is tested structurally. Only resources that meet DGHS IG mandatory elements claim the profile; the rest are reported as gaps (UHID, religion, parent RelatedPerson…). Not validated against the DGHS sandbox. |
| Legal | PDPA 2026 (consent, data residency in BD, retention) needs a lawyer's review. Host in a BD data centre or keep a BD replica. |
| Sync scope | Every device downloads the tenant's full history; there's no date window on the `tenant_data` stream yet. Fine for one chamber, but add a window before large clinics. |
| Test isolation | The e2e suite uses its own database (`prescription_service_e2e`, see Tests), where runs accumulate. Use a throwaway DB in CI. |
| Lab catalogue | Ranges and units come from Bangladeshi lab menus and textbook values; several (DC, RBC indices, LFT, electrolytes, hormones) are from non-BD sources. **A pathologist must review** them before the production seed, and codes are permanent once released. |
| Lab sign-off | Reports print as soon as they are entered, with the clinic's signatories at the foot and no verification step (by design, for now). Decide with a pathologist whether that wording is acceptable or a "verified by" step is needed. |
| BMDC lookup | The "Look up on BMDC site" link URL on the tenant page is a guess and unverified. |
| Auth hardening | No login rate limiting or lockout yet; no password reset by email/OTP (admins reset passwords). |
| Ops | Production secrets, HTTPS, backups, PowerSync JWT via JWKS/RS256 instead of the shared HS256 dev secret. |
