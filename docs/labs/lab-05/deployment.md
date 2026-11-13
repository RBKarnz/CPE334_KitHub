# KitHub Deployment (Lab 5)

| Field | Value |
| --- | --- |
| Product | KitHub, a web-based inventory and borrowing system |
| Course | CPE 334, Lab 5: GCP deployment and CI/CD |
| Version | 1.0 |
| Date | 2026-11-13 |
| Authors | Teerakarn Noiruksa (67070501062), Methipat Mansap (67070501071) |
| Design | [SDS v1.8](../../system-sds.md), sections 9.1 to 9.7 |
| Status | Complete for Lab 5: stack, environment variables and cloud readiness (#2, sections 1 to 3); Docker (#3, section 4); CI (#4, section 5); GCP deployment (#5, section 6; Service URL in 6.1); release pipeline (#7, section 7); persistence, rollback and roll forward (#8, section 8); GitHub to Google Cloud and the merge gate (#6, section 9); commands at a glance and the issue table (#9, sections 10 and 11) |

## Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-12 | Teerakarn Noiruksa | First version (#2): stack, every environment variable, cloud-readiness check |
| 0.2 | 2026-11-12 | Teerakarn Noiruksa | Section 4 Docker (#3): the files, how to run them locally, what differs from the Starter Kit, and what was checked |
| 0.3 | 2026-11-12 | Teerakarn Noiruksa | Section 5 CI on pull requests (#4): what the workflow runs, what differs from the Starter Kit, and the local run of every step |
| 0.4 | 2026-11-12 | Methipat Mansap | Section 6 GCP deployment (#5): project, region, resource names, which secrets go to the service and to the job (and the IAM scope of the shared runtime account), the Cloud Shell commands, the smoke-test checks and the changes to `deploy/`. Notes in 2 and 5.2 updated; "Still to record" is now section 7 |
| 0.5 | 2026-11-13 | Teerakarn Noiruksa | First deployment done (#5): Service URL in 6.1, new 6.8 with the run, the checks on the public URL and the Console check; #5 removed from section 7 |
| 0.6 | 2026-11-13 | Methipat Mansap | Section 7 Release pipeline (#7): how a release happens, how to find the running commit, rollback, why the smoke-test login is skipped, what GitHub provides; 6.6 note for #7 updated; "Still to record" is now section 8 |
| 0.7 | 2026-11-13 | Teerakarn Noiruksa | 7.2: why the first run showed two different digests and the `--provenance=false` fix in `deploy.yml` (#7) |
| 0.8 | 2026-11-13 | Methipat Mansap | 7.6 filled with the first two automatic releases; new 7.7 for the second release, a visible change (C-06, #56) (#7) |
| 0.9 | 2026-11-13 | Methipat Mansap | 7.7 filled: the pull requests, the Deploy demo run, the merge commit, the revision and digest, and the tagline on the public URL (C-06) (#7); the row for the first automatic release removed from section 8 (#7) |
| 0.10 | 2026-11-13 | Teerakarn Noiruksa | New section 8 Persistence, rollback and roll forward (#8): the record that was kept, the restart, the rollback to release A and the roll forward to release B with their runs and revisions, why the data survives, and the limits of a rollback; "Still to record" is now section 9 and #8 is removed from it |
| 1.0 | 2026-11-13 | Methipat Mansap | Final version (#9): new section 9 GitHub to Google Cloud and the merge gate (#6), appended so that no existing section number changes; new section 10 Commands at a glance and section 11 Lab 5 issues instead of "Still to record"; final check against the Lab 5 handout 4.3; nits from #60 (Status row, "Redeploy (no changes)" in 8.2) |

## 1. Stack

| Layer | Choice |
| --- | --- |
| UI | React 18 + TypeScript, built with Vite 6; React Router 6; Bootstrap 5 |
| API | Node.js 24 + Express 4 + TypeScript; zod for validation; bcryptjs for password hashing |
| Data access | Prisma 5 (schema, migrations, client) |
| Database | PostgreSQL 16: Docker container or local install on a laptop, Cloud SQL for PostgreSQL 16 on GCP |
| Tests | Vitest and Supertest (server), Vitest and Testing Library (client), Playwright (end-to-end) |
| Packaging | One Docker image that serves the API under `/api` and the built UI (SDS DD-01), built in #3 |
| Hosting | Cloud Run service `kithub` and Cloud Run job `kithub-migrate` in `asia-southeast1` (SDS 9.6) |

Exact package versions are pinned in each `package-lock.json`.

Changes from the Starter Kit (the reference) are listed where they were made: Docker in 4.3, the CI workflow in 5.2, `deploy/` in 6.5 and the deploy workflow in section 7 (its changes are the first paragraph of that section).

## 2. Environment variables

The app reads every setting from environment variables (SDS 9.1). Locally the values come from `server/.env` and `client/.env`, copied from the `.env.example` files, which hold placeholders only. On GCP, Cloud Run sets them on the service or the job, and secrets come from Secret Manager. The GCP names below are the ones `deploy/deploy.sh` creates (section 6, SDS 9.6).

### 2.1 Server

| Variable | Purpose | Secret | Local value | Value on GCP |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `development`, `test` or `production`. `production` serves the built UI and turns on `Secure` cookies. Default `development` | No | `server/.env`: `development` | Service and job setting: `production` |
| `PORT` | HTTP port. The server binds `0.0.0.0`. Default `3000` | No | `server/.env`: `3000` | Set by Cloud Run; not set by us |
| `DATABASE_URL` | PostgreSQL connection string for Prisma | Yes (contains the database password) | `server/.env`, your local database | Secret Manager `kithub-database-url`, given to the service and the job |
| `TEST_DATABASE_URL` | Separate database for the automated tests; must differ from `DATABASE_URL` and end in `_test` | Local value only | `server/.env`, your local `kithub_test` database | Not used on GCP. CI sets a throwaway value |
| `SESSION_TTL_HOURS` | Session lifetime in hours, 1 to 720 (D-18). Default `8` | No | `server/.env`: `8` | Not set: default `8` |
| `COOKIE_SECURE` | `Secure` flag of the session cookie. Default `true` when `NODE_ENV=production`, else `false` | No | Not set: default `false` | Not set: default `true` (Cloud Run serves HTTPS) |
| `BCRYPT_COST` | bcrypt cost factor, 4 to 31 (NFR-03). Default `12` | No | `server/.env`: `12` | Not set: default `12` |
| `SEED_DEMO_DATA` | `true` also seeds the demo Borrower accounts. Default `false` | No | `server/.env`: `true` | Job setting: `true` while the demo accounts are needed (Lab 6 UAT) |
| `SEED_CUSTODIAN_PASSWORD` | Initial password of the seeded Custodian accounts; required to run the seed | Yes | `server/.env`, chosen by each developer | Secret Manager `kithub-custodian-password`, given to the job only |
| `SEED_BORROWER_PASSWORD` | Password of the demo Borrower accounts; required when `SEED_DEMO_DATA=true` | Yes | `server/.env`, chosen by each developer | Secret Manager `kithub-borrower-password`, given to the job only |

The seed passwords are set on the migration job only, because only the seed reads them. The service never needs them. Both run as the same runtime service account, which can read all three secrets (section 6.3).

### 2.2 Client

| Variable | Purpose | Secret | Local value | Value on GCP |
| --- | --- | --- | --- | --- |
| `VITE_API_URL` | Base URL of the API. Empty means the same origin | No. Every `VITE_` value is compiled into the public JavaScript bundle | `client/.env`: empty (the Vite proxy forwards `/api`) | Empty at image build time: the UI and the API share one origin in the one container |

### 2.3 Rules

- No real value is committed: `.env` files are ignored by Git, and `.env.example` holds placeholders only (SDS 9.3).
- No secret is baked into the Docker image or the UI bundle; secrets are injected at run time.
- Passwords, session tokens and `DATABASE_URL` are never logged or printed.

## 3. Cloud readiness

Checked in #2 against the six points of the Lab 5 guide, section 2.2. The pull request for #2 holds the ticked checklist.

| Point | Result | Where |
| --- | --- | --- |
| 1. Uploaded files are stored in the database or Cloud Storage, not a local folder | Already OK: KitHub has no file upload and writes nothing to the container file system | `server/src` |
| 2. The seed is safe: passwords from environment variables, not shown on screen, rerunnable | Already OK: insert-if-missing; passwords from `SEED_*_PASSWORD`, never printed | `server/prisma/seed.ts`, `seed-lib.ts` |
| 3. No dev shortcuts in production | Already OK: no user picker, no default password on the login page, test-only routes mounted only by the tests | `server/src/index.ts`, `client/src/pages/LoginPage.tsx` |
| 4. Sessions are stored in the database | Already OK: `sessions` table | `server/prisma/schema.prisma`, `server/src/core/middleware/authenticate.ts` |
| 5. The server reads its port from `PORT` and does not bind only to localhost | Already OK: binds `0.0.0.0:PORT` and stops cleanly on `SIGTERM` | `server/src/index.ts` |
| 6. `/api/ready` exists and returns 503 when the database is unreachable | Already OK; the success body now matches the guide | `server/src/core/health.routes.ts` |

Readiness check:

| Database | Response |
| --- | --- |
| Reachable | `200 {"status":"ready","db":"connected"}` |
| Unreachable | `503` with `error.code` `NOT_READY` |

## 4. Docker

Added in #3 from the Lab 5 Starter Kit and adapted to KitHub. Nothing here is deployed; the root `Dockerfile` is the image that CI (#4) and Cloud Run (#5) use.

### 4.1 Files

| File | Used by | What it does |
| --- | --- | --- |
| `Dockerfile` | CI and Cloud Run | Three stages: build the UI, build the server and generate the Prisma Client, then a `node:24-alpine` runtime that serves the API and the built UI on `PORT` as the non-root `node` user |
| `.dockerignore` | Root `Dockerfile` | Keeps `node_modules`, `dist`, `.env` and test reports out of the build |
| `docker-compose.yml` | Local run only | Starts the four services in section 4.2 |
| `server/Dockerfile` | Compose `migrate` and `server` | API image: installs, generates the Prisma Client, builds `dist/` |
| `server/docker-entrypoint.sh` | Both server images | `exec "$@"`, so `node dist/index.js` is PID 1 and receives `SIGTERM` |
| `server/.dockerignore` | `server/Dockerfile` | Keeps `node_modules`, `dist`, `.env` and tests out of the build |
| `client/Dockerfile` | Compose `client` | Builds the UI with Vite and serves it with nginx |
| `client/nginx.conf` | Compose `client` | Serves the UI, sends `/api` to `server:3000`, and returns `index.html` for client routes |
| `client/.dockerignore` | `client/Dockerfile` | Keeps the host's `node_modules`, `dist` and `.env` out of the build |
| `.gitattributes` | Git | Keeps `*.sh` files in LF on every checkout, so the entrypoint also runs when the repository is cloned on Windows |

### 4.2 Run it locally

Ports 3000 and 5173 must be free. The database publishes no host port, so a local PostgreSQL on 5432 or the `kithub-pg` container does not get in the way.

1. Copy `server/.env.example` to `server/.env` and choose the two seed passwords (README section 2). The `migrate` service reads `SEED_CUSTODIAN_PASSWORD`, `SEED_BORROWER_PASSWORD` and `SEED_DEMO_DATA` from that file; Compose sets `NODE_ENV` and `DATABASE_URL` itself.
2. Build and start: `docker compose up --build -d`.
3. Check: `docker compose ps -a`. `db`, `server` and `client` are running; `migrate` shows `Exited (0)`.
4. Check the API: `curl --fail http://localhost:3000/api/health` and `curl --fail http://localhost:3000/api/ready` (on Windows PowerShell, `curl.exe`).
5. Open `http://localhost:5173` and sign in with a seeded account.
6. Stop and keep the data: `docker compose down`. Start again: `docker compose up -d`. Delete the data too: `docker compose down -v`.

| Service | Container | Port | Role |
| --- | --- | --- | --- |
| `db` | `kithub-db` | none on the host | PostgreSQL 16, data in the `postgres_data` volume |
| `migrate` | `kithub-migrate` | none | `prisma migrate deploy`, then the insert-if-missing seed; runs once on every `up`, then exits |
| `server` | `kithub-server` | 3000 | The API (`NODE_ENV=production`); starts only after `migrate` succeeds |
| `client` | `kithub-client` | 5173 | nginx with the built UI; proxies `/api` to `server` |

With `NODE_ENV=production` the session cookie is `Secure`. Chrome, Edge and Firefox accept it on `http://localhost`; use one of them for the local run.

### 4.3 Changes from the Starter Kit

| Kit file | Change | Why |
| --- | --- | --- |
| `docker-compose.yml` | `migrate` reads `server/.env` instead of `ADMIN_PASSWORD` and `DEMO_USER_PASSWORD` with fallbacks | KitHub's seed reads `SEED_CUSTODIAN_PASSWORD` and `SEED_BORROWER_PASSWORD`; without them `migrate` exits 1 and the server never starts. Seed passwords are never written in Git (SDS 9.3) |
| `docker-compose.yml` | No host port for `db` | Only `migrate` and `server` use it, over the Compose network; avoids a clash with a local PostgreSQL |
| `docker-compose.yml` | Names `kithub-*`; `db` is `kithub-db` | `kithub-pg` is already the development database container (README) |
| `server/Dockerfile` | Copies `tsconfig.build.json` too | `npm run build` runs `tsc -p tsconfig.build.json`; without it the build fails |
| new `client/.dockerignore`, `server/.dockerignore` | Added | The root `.dockerignore` applies only to builds from the root. Without them, `COPY . .` in `client/Dockerfile` copies the host's `node_modules` over the Linux ones |
| new `.gitattributes` | `*.sh text eol=lf` | With `core.autocrlf=true` on Windows, the entrypoint would get CRLF and the container would not start |
| All files | Comments name KitHub | The kit comments name TokTickIT |

No password or secret is in any `ARG` or `ENV`. The only password in `docker-compose.yml` is the fallback `kithub` for the local database container.

### 4.4 Checked (#3)

| Check | Result |
| --- | --- |
| `docker compose up --build -d` | All images built, no error; `migrate` `Exited (0)`: migrations applied, seed created 6 categories, 9 item types, 38 units and 4 accounts |
| `/api/health`, `/api/ready` on port 3000 and through nginx on 5173 | `200 {"status":"ok"}`, `200 {"status":"ready","db":"connected"}` |
| UI on 5173 | `/` and a deep link such as `/requests/1` return the app |
| Sign-in | borrower1 signs in through nginx and in Chromium; the cookie is `HttpOnly`, `Secure`, `SameSite=Lax` |
| A record survives a restart | Request #1 (PENDING, Arduino Uno R3) created, then `down` and `up`: still there with the same `createdAt`. The second seed run created nothing |
| Images | No `.env` in any image; image ENV holds only `NODE_ENV`, `TZ`, `PORT`; the server runs as `node`, PID 1 is `node dist/index.js` |
| Root `Dockerfile` | Builds; with `PORT=8080` it listens on 8080, serves the UI and the API from one container, `/api/ready` 200 |
| Fresh clone (C-03) | New clone on Windows, `server/.env` copied from `server/.env.example` with only the placeholders filled in, `docker compose build --no-cache` then `up -d`: `migrate` `Exited (0)`, health and ready 200, borrower1 signs in, a new request survives `down` and `up`. The entrypoint stays LF in the clone |

## 5. CI on pull requests

Added in #4 from the Lab 5 Starter Kit: `.github/workflows/ci-docker.yml` and the `deploy/` folder. The workflow uses no Google Cloud and nothing costs money.

### 5.1 What the workflow runs

Workflow "CI & Docker Build", job `test-and-docker` (the name the merge gate in section 9.4 requires). It starts on every pull request into `staging` or `main`, by hand from the Actions tab (`workflow_dispatch`), and from the deploy workflow in #7 (`workflow_call`). `permissions` is `contents: read` only.

| Step | What it does |
| --- | --- |
| Services: `postgres` | A temporary PostgreSQL 16 with the throw-away user, password and database `kithub` |
| Setup | Node.js 24 and Python 3.14 |
| Deploy scripts | `bash -n` on `deploy.sh`, `teardown.sh` and `release.sh`, then their offline tests with a fake `gcloud`. No access to GCP |
| Backend | `npm ci`, `npm run typecheck`, `prisma migrate deploy` on `kithub`, the seed with random passwords for this run only, then `npm test` on `kithub_test` |
| Frontend | `npm ci`, `npm test`, `npm run build` |
| End-to-end | Root `npm ci`, Playwright Chromium, `npm run typecheck:e2e`, `npm run test:e2e` against `kithub_test` (TEST-30 to TEST-32, TEST-53) |
| Docker | `docker build` of the root `Dockerfile`; the image is not pushed |

A failing step fails the job. Concurrency cancels an older run on the same branch when a new commit is pushed.

### 5.2 Changes from the Starter Kit

| Change | Why |
| --- | --- |
| `pull_request` branches `[main, staging]` | Every change goes into `staging` first; with `[main]` only, feature pull requests would get no check |
| Database service `kithub`/`kithub`/`kithub` | KitHub names; throw-away CI values, not secrets |
| Job-level `DATABASE_URL` and `TEST_DATABASE_URL` (`kithub_test`) | The server tests and E2E refuse to run without a separate `*_test` database (SDS 4.8). `prisma migrate deploy` creates `kithub_test` on the first run |
| Seed passwords from `openssl rand`, masked in the log | KitHub's seed needs `SEED_CUSTODIAN_PASSWORD` and `SEED_BORROWER_PASSWORD`; generating them keeps every password out of Git (SDS 9.3) |
| `npm run typecheck` in the backend step | `npm test` does not type-check; the Docker build only type-checks `src/`, not the tests |
| New end-to-end step | Runs the Playwright tests of SDS 10 on every pull request |
| Image tag `kithub:ci` | The kit tag names TokTickIT |

#4 copied `deploy/` from the kit unchanged. #5 adapts the scripts and their offline tests to KitHub (section 6.5); the CI step that runs them is unchanged.

### 5.3 Checked locally (#4)

Every step was run on a fresh clone with no `.env` and a new PostgreSQL 16 that had only the `kithub` database, as on the runner:

| Step | Result |
| --- | --- |
| Deploy scripts | Syntax OK; deploy stub, release stub and 3 smoke-test unit tests pass |
| Backend | Typecheck OK; migrations applied; seed created 6 categories, 9 item types, 38 units and 4 accounts; `kithub_test` created; 160 tests passed |
| Frontend | 39 tests passed; build OK |
| End-to-end | Typecheck OK; 4 passed |
| Docker | Root image builds |

The first run on GitHub is recorded in the pull request for #4.

## 6. GCP deployment (#5)

The first deployment is run once, by hand, from Cloud Shell with `deploy/deploy.sh` (Lab 5 guide, Episode 5). #5 first adapts `deploy/` to KitHub; this section says what the script creates and how to run it. The first deployment was run on 2026-11-12 (6.8).

### 6.1 Project

| Field | Value |
| --- | --- |
| Project ID | `cpe334-th037-free-robux-513814` |
| Region | `asia-southeast1` (every resource below) |
| Service URL | <https://kithub-itgltxbgxa-as.a.run.app> |

The Project ID is not a secret. The Project number is not written in this document.

### 6.2 Resources

The names follow SDS 9.6: the Starter Kit names with the kit's app name replaced by `kithub`.

| Resource | Name | Notes |
| --- | --- | --- |
| Artifact Registry (Docker) | `kithub`, image `kithub/kithub` | The first deploy pushes the tag `latest`; from #7 every image is tagged with the full commit SHA |
| Cloud SQL for PostgreSQL 16 | `kithub-pg` | `db-f1-micro`, Enterprise edition, 10 GB SSD, daily backup at 03:00. **Storage auto-increase off at creation** (`--no-storage-auto-increase`) |
| Database and database user | `kithub` / `kithub` | The user's password is generated and stored only inside the `kithub-database-url` secret |
| Cloud Run job | `kithub-migrate` | `npx prisma migrate deploy && npm run prisma:seed`, `NODE_ENV=production`, `TZ=Asia/Bangkok`, `SEED_DEMO_DATA=true` with `--demo`. The seed is insert-if-missing (SDS 4.8), so a rerun is safe |
| Cloud Run service | `kithub` | Port 3000, 0 to 3 instances, 512 MiB, 1 CPU, public URL (`--allow-unauthenticated`; the app enforces sign-in). `COOKIE_SECURE` is not set: it defaults to `true` in production and Cloud Run serves HTTPS |
| Runtime service account | `kithub-runner` | Runs the service and the job. Cloud SQL Client on the project and Secret Manager Secret Accessor on each of the secrets below only |
| Secret | `kithub-database-url` | `DATABASE_URL` |
| Secret | `kithub-custodian-password` | `SEED_CUSTODIAN_PASSWORD`, always created |
| Secret | `kithub-borrower-password` | `SEED_BORROWER_PASSWORD`, created only with `--demo` |

### 6.3 Which secret goes where

| Secret | Environment variable | Service `kithub` | Job `kithub-migrate` |
| --- | --- | --- | --- |
| `kithub-database-url` | `DATABASE_URL` | Yes | Yes |
| `kithub-custodian-password` | `SEED_CUSTODIAN_PASSWORD` | No | Yes |
| `kithub-borrower-password` | `SEED_BORROWER_PASSWORD` | No | Yes, with `--demo` |

Only the seed reads the two passwords, so they are set as environment variables on the job only, never on the service (section 2.1).

IAM scope: the service and the job both run as `kithub-runner`, and that account has Secret Accessor on all three secrets, because the job needs them. The service could therefore read the seed passwords through the Secret Manager API, although the app never does. This matches the kit and SDS 9.6. A separate service account for the job, with Secret Accessor on the seed secrets, and the service account limited to `kithub-database-url`, would be stricter; it is a possible follow-up, not part of #5.

Both passwords are generated with `openssl` (18 characters, well under the 72-byte bcrypt limit in `server/src/core/config.ts`), stored only in Secret Manager and never printed; the script logs the database user's password as `<REDACTED>`.

### 6.4 Run it (Cloud Shell)

Before you start: Issue #1 is done (billing on, budget alert set), `main` contains the merged PR for #5, and nobody is watching your screen. Costs start at step 3, mostly Cloud SQL.

1. Prepare Cloud Shell (guide 5.1):

   ```bash
   gcloud auth list --filter=status:ACTIVE --format='value(account)'
   export PROJECT_ID=cpe334-th037-free-robux-513814
   export REGION=asia-southeast1
   gcloud config set project "$PROJECT_ID"
   git clone https://github.com/RBKarnz/CPE334_KitHub.git
   cd CPE334_KitHub
   git rev-parse --short HEAD   # must match the latest commit on main
   ```

2. Read the plan; it creates nothing (guide 5.2). Check that every name is `kithub*` and that the Cloud SQL line has `--no-storage-auto-increase`:

   ```bash
   DRY_RUN=1 PROJECT_ID="$PROJECT_ID" REGION="$REGION" bash deploy/deploy.sh --demo
   ```

3. Deploy for real, **with `--demo`**, because Lab 6 UAT needs the Borrower accounts (guide 5.3). It takes about 10 to 20 minutes; do not cancel it:

   ```bash
   PROJECT_ID="$PROJECT_ID" REGION="$REGION" bash deploy/deploy.sh --demo
   ```

   If it stops at the migration job, read the job log with the command it prints before running it again.

4. Guide step 5.4 is not needed: storage auto-increase is already off. To check it (prints `False`):

   ```bash
   gcloud sql instances describe kithub-pg --format='value(settings.storageAutoResize)'
   ```

5. Test the running app (guide 5.5):

   ```bash
   export SERVICE_URL=$(gcloud run services describe kithub --region "$REGION" --format='value(status.url)')
   echo "$SERVICE_URL"
   curl --fail "$SERVICE_URL/api/health"
   curl --fail "$SERVICE_URL/api/ready"
   python3 deploy/smoke_test.py "$SERVICE_URL"
   ```

   Then open the URL in a browser: the sign-in page loads.

6. Sign in (guide 5.6, no screenshot). Read a password privately and never paste it into a chat, a document or an Issue:

   ```bash
   gcloud secrets versions access latest --secret=kithub-custodian-password
   gcloud secrets versions access latest --secret=kithub-borrower-password
   ```

   Custodian accounts: `custodian1`, `custodian2`. Demo Borrower accounts: `borrower1`, `borrower2`.

7. Check in the Console what the script created (guide 5.7) against section 6.2, then comment on Issue #5 with the service URL and the screenshots, with no secret value (guide 5.8). Fill in the Service URL in 6.1.

### 6.5 Changes to `deploy/` from the Starter Kit

| File | Change | Why |
| --- | --- | --- |
| `deploy.sh` | Every resource name in 6.2; banner, descriptions and comments name KitHub | SDS 9.6 |
| `deploy.sh` | Seed secrets `kithub-custodian-password` and `kithub-borrower-password` given to the job as `SEED_CUSTODIAN_PASSWORD` and `SEED_BORROWER_PASSWORD`, instead of `ADMIN_PASSWORD` and `DEMO_USER_PASSWORD` | The names KitHub's seed reads (`server/src/core/config.ts`); without them the job fails |
| `deploy.sh` | `--no-storage-auto-increase` on `gcloud sql instances create` | SDS 9.6: auto-increase off from the start, instead of patching it afterwards (guide 5.4) |
| `deploy.sh` | The summary lists the Custodian and Borrower usernames and the secret names, not the kit's admin email | KitHub has no admin account |
| `release.sh` | Defaults `kithub` and `kithub-migrate`; image and digest path `kithub/kithub` | Same names as `deploy.sh` (used from #7) |
| `teardown.sh` | Same names; deletes the two KitHub seed secrets | Same names as `deploy.sh` |
| `smoke_test.py` | `/api/categories` must answer 401 without a session; optional login with `SMOKE_USERNAME` and `SMOKE_PASSWORD` (was `SMOKE_EMAIL`), the `kithub_session` cookie instead of a bearer token, and a JSON `POST` for logout | KitHub has no public data endpoint (SDS 9.7); sign-in takes a username; the session is an `HttpOnly` cookie; the API answers 415 to a `POST` without `Content-Type: application/json` |
| `tests/*` | Same names; new checks for the job and service secrets with and without `--demo`, the 72-byte limit, the auto-increase flag, a dry run with KitHub names only, and every smoke check | Keeps the CI step "Check deployment scripts without accessing GCP" meaningful |

### 6.6 Smoke test

`python3 deploy/smoke_test.py SERVICE_URL` only reads. Each public check is retried 5 times, 3 seconds apart, for a cold start.

| Check | Passes when |
| --- | --- |
| `GET /api/health` | 200 and `status` is `ok` |
| `GET /api/ready` | 200 and `db` is `connected` |
| `GET /` | 200 and the page contains `<html` |
| `GET /api/categories` without a session | 401. Proves the API routes and the auth guard are live; a 200 fails |
| Optional login, only when both `SMOKE_USERNAME` and `SMOKE_PASSWORD` are set | `POST /api/auth/login` 200, `GET /api/auth/me` 200 and `GET /api/categories` 200 with a non-empty `items` list (migration and seed ran), all with the session cookie; then `POST /api/auth/logout` 204, which is sent even if a check failed |

Without the two values it prints `SKIP login: optional smoke credentials not configured`. Setting only one of them is an error. The script never prints a password, the cookie or a response body. The login check needs the HTTPS URL, because the cookie is `Secure` in production.

For #7: `deploy.yml` passes `SMOKE_USERNAME` (variable) and `SMOKE_PASSWORD` (secret) of the `demo` environment to the script (the guide's 7.3 says `SMOKE_EMAIL`; KitHub signs in with a username). Neither is created, so the login check is skipped; see 7.4.

### 6.7 Checked offline (#5)

Before the first deployment, with no GCP access, the CI commands were run locally on the branch for #5:

| Check | Result |
| --- | --- |
| `bash -n` on `deploy.sh`, `teardown.sh`, `release.sh` | OK |
| `bash deploy/tests/test_deploy_stub.sh` | first run, rerun, partial, job failure, `--demo` and both dry runs pass |
| `bash deploy/tests/test_release_stub.sh` | 5 checks pass |
| `python3 -m unittest discover -s deploy/tests -p 'test_smoke.py'` | 14 tests pass |
| `DRY_RUN=1 … bash deploy/deploy.sh --demo` with the Project ID above | Only `kithub*` names; the database password shows as `<REDACTED>`; no generated value |
| Kit names in `deploy/` | `grep -rni` finds no kit app name, `ADMIN_PASSWORD`, `DEMO_USER_PASSWORD` or `SMOKE_EMAIL` |

### 6.8 First deployment (#5)

Run on 2026-11-12 from Cloud Shell, following 6.4, with `main` at `bc3611c` (the merge of #48). The screenshots are in the [Issue #5 comment](https://github.com/RBKarnz/CPE334_KitHub/issues/5#issuecomment-6831199270), with emails and the Project number hidden. No password or secret value is in them.

| Step | Result |
| --- | --- |
| Dry run (`DRY_RUN=1 … deploy.sh --demo`) | Only `kithub*` names; Cloud SQL line has `--no-storage-auto-increase`; the database password shows as `<REDACTED>` |
| `deploy.sh --demo` | Every step finished: APIs, Artifact Registry, Cloud SQL (status `RUNNABLE`), database, `kithub-runner`, database user, the three secrets and their Secret Accessor bindings |
| Image build (Cloud Build) | `SUCCESS` in 1m50s; `kithub/kithub:latest` pushed |
| Migration job `kithub-migrate` | Execution completed (migrations and seed) |
| Service `kithub` | Revision `kithub-00001-zbh` serves 100% of traffic |
| Storage auto-increase | `settings.storageAutoResize` is `False`; guide 5.4 not needed |
| `/api/health`, `/api/ready` | `{"status":"ok"}` and `{"status":"ready","db":"connected"}` |
| `python3 deploy/smoke_test.py "$SERVICE_URL"` | `/api/health`, `/api/ready`, `/` and `/api/categories` (401 without a session) pass; login skipped (no smoke credentials) |
| Browser | The sign-in page loads from the public internet, with no Google sign-in |
| Console (guide 5.7) | Matches 6.2: the six APIs enabled; `kithub-runner` has only Cloud SQL Client on the project and Secret Accessor on each of the three secrets; `kithub-pg` PostgreSQL 16, database `kithub`, 10 GB SSD, automatic storage increase off; the service has `NODE_ENV` and `TZ` as plain values and `DATABASE_URL` from Secret Manager, port 3000, 0 to 3 instances; image `kithub` tag `latest` |

Domain workflow on the public URL (C-04):

| Check | Result |
| --- | --- |
| Sign-in | `borrower1` signs in and the catalog opens |
| Main action | Request #1 (USB-A to USB-B cable × 1) submitted; My requests shows it as Pending |
| Access restriction | `borrower1` opening `/pending`, a Custodian page, gets Forbidden |

Two URLs reach the same service: Cloud Run also shows `https://kithub-<project number>.asia-southeast1.run.app`. This document and the Issues use the `status.url` above, which does not contain the Project number.

## 7. Release pipeline (#7)

`.github/workflows/deploy.yml` (workflow name **Deploy demo**) deploys `main` to Cloud Run with no manual command. It is the Starter Kit workflow with only these changes: `SERVICE_NAME: kithub`, `MIGRATE_JOB_NAME: kithub-migrate`, image path `kithub/kithub`, `SMOKE_EMAIL` renamed `SMOKE_USERNAME`, KitHub wording in the run summary and the comments. `environment: demo`, the four `vars.*` names and the action SHAs are unchanged. `ci-docker.yml` is not changed.

### 7.1 How a release happens

| Step | What happens |
| --- | --- |
| 1 | A feature branch is merged into `staging` by a reviewed pull request |
| 2 | `staging` is synced with `main`, so the branch is up to date (the ruleset requires it) |
| 3 | A release pull request `staging` to `main` runs `test-and-docker` and needs 1 approval |
| 4 | The merge into `main` starts **Deploy demo**. Runs are queued (`concurrency: deploy-demo`), never cancelled halfway |
| 5 | Job `test` reuses `ci-docker.yml` (job `test-and-docker`). If it fails, nothing is deployed |
| 6 | Job `deploy` runs in environment `demo`: validate the settings and that the image tag is a full 40-character SHA |
| 7 | Sign in to Google Cloud with Workload Identity Federation (no key file, section 9.2) |
| 8 | Build and push `kithub/kithub:<full commit SHA>` to Artifact Registry |
| 9 | `deploy/release.sh`: resolve the image digest, update and run `kithub-migrate`, update `kithub`, send 100% of traffic to the latest revision. A failed migration stops before the service is updated |
| 10 | `deploy/smoke_test.py` checks the public URL (6.6) |
| 11 | The run Summary records the image tag, the digest, whether it was a rollback, and the URL |

A pull request does not start Deploy demo; only a push to `main` or a manual run does.

### 7.2 How to find the commit that is running

Any one of these is enough:

| Where | What to read |
| --- | --- |
| The run page of Deploy demo, Summary | "Commit image tag" is the full commit SHA; "Digest" is the deployed image digest |
| Cloud Run, service `kithub`, Revisions | The revision with 100% of traffic; its container image digest equals the Summary's digest |
| Artifact Registry, `kithub/kithub` | The image whose tag is that commit SHA |
| `gcloud run services describe kithub --region asia-southeast1 --format='value(spec.template.spec.containers[0].image)'` | The image reference of the running service (read only) |

The digest in the Summary and the digest of the revision in Cloud Run must be the same. In the first automatic run (the build without `--provenance=false`) they were not: BuildKit pushed a manifest list that wraps the image and its provenance attestation, the Summary showed the digest of the list (`sha256:5648...`), and Cloud Run showed the digest of the image inside it (`sha256:faba...`). Both belong to the same build; the run log shows them in the lines `exporting manifest` and `exporting manifest list`. The build step now uses `docker build --provenance=false`, so one manifest is pushed and both places show the same digest. The cost is that the image carries no provenance attestation; the tag is still the full commit SHA, which leads back to the code and the run.

### 7.3 Rollback

Actions, Deploy demo, Run workflow on `main`, with `image_tag` set to the **full 40-character commit SHA** of an image that exists in Artifact Registry. Tests, build and migration are skipped; only the service is pointed back to that image, and the smoke test still runs. A short SHA or a tag that is not a SHA is rejected before any Google Cloud call. The procedure and its proof are in section 8.

### 7.4 Smoke-test login is skipped on purpose

`SMOKE_USERNAME` and `SMOKE_PASSWORD` are not created. KitHub has no screen to create users, and the guide forbids reusing the password of a demo account for the pipeline. The smoke step therefore prints `SKIP login: optional smoke credentials not configured` and checks health, readiness, the page and `/api/categories` (401 without a session).

### 7.5 What GitHub provides

| Item | Setting |
| --- | --- |
| Environment `demo` | Deployment branch `main` only; variables `GCP_PROJECT_ID`, `GCP_REGION`, `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT` (section 9.3) |
| Ruleset `protect-main` | Pull request required with 1 approval, required check `test-and-docker`, branch must be up to date (section 9.4) |
| Secrets and keys | No secret and no key file in GitHub; the service account is reached through Workload Identity Federation |

### 7.6 First automatic release

| | Run #1 | Run #2 |
| --- | --- | --- |
| Started by | Release PR #52 | Release PR #55 (after `--provenance=false`) |
| `main` commit | `2adc25b` | `6bf2a8ceb5919964e428769b078b54dfb0dcad14` |
| Run | [43405628558](https://github.com/RBKarnz/CPE334_KitHub/actions/runs/43405628558) | [43432255470](https://github.com/RBKarnz/CPE334_KitHub/actions/runs/43432255470) |
| Result | Green on attempt 3 | Green on attempt 1 |
| Cloud Run revision | `kithub-00002-ndd` | `kithub-00003-r8l` |
| Digest in Summary vs revision | Different (see 7.2) | Equal |

Run #1 needed three attempts:

1. Attempt 1 failed: the pool name in the `WIF_PROVIDER` variable had a typo; fixed in GitHub.
2. Attempt 2 failed in `release.sh`: a missing IAM permission on Google Cloud; fixed by Teerakarn.
3. Attempt 3 was green and created revision `kithub-00002-ndd`. The two digests it showed are explained in 7.2.

Run #2 ran with `--provenance=false`; the digest in its Summary equals the digest of the revision in Cloud Run.

### 7.7 Second release, a visible change (C-06)

One small change that a user can see on the public URL went through the whole pipeline: a tagline under the sign-in heading.

| Item | Value |
| --- | --- |
| Issue | #56 |
| Change | "Borrow lab equipment from the faculty hardware room." under the heading "Sign in to KitHub" (heading text unchanged); one client test |
| Pull request into `staging` | #57 (reviewed and approved by Teerakarn Noiruksa), merged as `dad859a` |
| Release pull request `staging` to `main` | #58 (approved by Teerakarn Noiruksa, `test-and-docker` green), merged as a merge commit |
| Deploy demo run | [43440432113](https://github.com/RBKarnz/CPE334_KitHub/actions/runs/43440432113), started by the merge of #58; `test / test-and-docker` and `deploy` green |
| `main` commit (Summary, Commit image tag) | `3889ea47fb421ca8a8d5990197d73182727947c9` |
| Cloud Run revision | `kithub-00004-hhs`, with 100% of the traffic at the time of the run |
| Digest | `sha256:98f6265fae3c9b66793e158e783dccf3f0b440820fc2c2c7a057a716cdc421da`; the Summary and the revision show the same digest |
| Result on the public URL | The tagline is visible under the heading "Sign in to KitHub" on the sign-in page of `https://kithub-itgltxbgxa-as.a.run.app`, after a hard refresh |

## 8. Persistence, rollback and roll forward (#8)

The data of KitHub is in Cloud SQL (PostgreSQL), not in the container. A restart, a redeploy, a rollback and a roll forward replace only the app container, so the data stays. A rollback changes only the app image; it does not roll the database back (the migration and the seed are skipped). The screenshots are in the [comment on #8](https://github.com/RBKarnz/CPE334_KitHub/issues/8#issuecomment-6858183781).

### 8.1 What was kept and which releases were used

The record is Request #1 of `borrower1` ("USB-A to USB-B cable x 1", created 12 Nov 2026 23:55, status Pending), made on the public URL in 6.8 (C-04). KitHub has no file upload and writes no file to the container disk, so there is no attachment to compare by checksum.

| Release | Image tag (commit) | Digest | What the user sees |
| --- | --- | --- | --- |
| A | `6bf2a8ceb5919964e428769b078b54dfb0dcad14` (second automatic release, 7.6) | `sha256:073be3706fa5703abe42cf43a88538245cd5307c63e8c80b529708d3d77603ee` | Sign-in page without the tagline |
| B | `3889ea47fb421ca8a8d5990197d73182727947c9` (7.7, C-06) | `sha256:98f6265fae3c9b66793e158e783dccf3f0b440820fc2c2c7a057a716cdc421da` | Sign-in page with the tagline |

A is the image of the second automatic release, not the first (`2adc25b`): the first was built before `--provenance=false` and shows two different digests (7.2), so its digest cannot be compared. No code under `server/` differs between A and B, so the database schema is the same for both.

### 8.2 Steps and results

| Step | What was done | Result |
| --- | --- | --- |
| 1. Before | `borrower1` signs in and opens My requests | Request #1 is there; the service runs release B on revision `kithub-00004-hhs` |
| 2. Restart | Cloud Run, service `kithub`, Redeploy (no changes) | New revision `kithub-00005-hm9` from the same image has 100% of the traffic; Request #1 is still there |
| 3. Rollback to A | Actions, Deploy demo, Run workflow on `main` with `image_tag` set to the full SHA of A ([run 43454238399](https://github.com/RBKarnz/CPE334_KitHub/actions/runs/43454238399)) | Job `test` skipped and step Build and push image skipped; the log says "Rollback: reuse existing image; skip tests, build, migration and seed."; smoke test PASS for the four checks, login SKIP; Summary shows A's tag, `Rollback: true` and A's digest; revision `kithub-00006-tnb` has 100% of the traffic; the sign-in page has no tagline; Request #1 is still there |
| 4. Roll forward to B | The same with the full SHA of B ([run 43455644798](https://github.com/RBKarnz/CPE334_KitHub/actions/runs/43455644798)) | The same steps skipped and the same smoke test result; Summary shows B's tag and B's digest, equal to the digest of [run 43440432113](https://github.com/RBKarnz/CPE334_KitHub/actions/runs/43440432113); revision `kithub-00007-mcz` has 100% of the traffic; the tagline is back; Request #1 is still there |

The run page of a rollback shows the commit of `main` that holds `deploy.yml` (`3889ea4`); the image that was deployed is the "Commit image tag" in its Summary. Cloud Run keeps every revision (`kithub-00001-zbh` to `kithub-00007-mcz`); only the newest one has traffic.

### 8.3 Why the data survives

- Requests, users and the catalog are rows in PostgreSQL on Cloud SQL (`kithub-pg`); the container only runs the code.
- Each of the four steps creates a new revision from an image. None of them touches the database.
- The rollback and the roll forward skip the migration job and the seed on purpose (`deploy/release.sh`, rollback mode), so a rollback cannot change or reset the data.

### 8.4 Limits of a rollback

- A rollback does not undo a database migration. If a release adds a migration, running an older image against the newer schema may fail; that has to be checked before a rollback. It was safe here because A and B have the same schema.
- Only an image that exists in Artifact Registry can be used, and `image_tag` must be the full 40-character commit SHA; anything else is rejected before any Google Cloud call (7.3).

## 9. GitHub to Google Cloud and the merge gate (#6)

#6 lets GitHub deploy to Google Cloud without a key file, and makes the passing check mandatory for `main`. It is set up in the Google Cloud Console and in the GitHub settings; the only file in the repository that uses it is `deploy.yml` (section 7). The screenshots are in [Issue #6](https://github.com/RBKarnz/CPE334_KitHub/issues/6), with emails and the Project number hidden. The Project number is not written in this document, so the `WIF_PROVIDER` value below has a placeholder.

### 9.1 Deployer service account and roles

`kithub-deployer` is the account that GitHub Actions uses to deploy. It is separate from `kithub-runner`, which runs the app (6.2). It has no keys: the Keys tab of the account is empty.

| Role | Granted on | Why |
| --- | --- | --- |
| Cloud Run Developer | The project | `deploy/release.sh` updates and runs the job `kithub-migrate`, updates the service `kithub` and moves traffic |
| Artifact Registry Writer | Repository `kithub` only | The workflow pushes the image `kithub/kithub:<commit SHA>`; it cannot write to any other repository |
| Service Account User | `kithub-runner` only | A Cloud Run service and job run as `kithub-runner`; deploying them needs the right to act as that account, and no other account |

None of the three roles gives access to the value of a secret. The secrets stay readable only by `kithub-runner` (6.3).

Two APIs are enabled so that the account can be used without a key: the IAM Service Account Credentials API (to impersonate the account) and the Security Token Service API (to exchange the GitHub token for a Google token).

### 9.2 Workload Identity Federation

Workload Identity Federation lets a GitHub Actions run prove who it is with a short-lived OpenID Connect token, and exchange it for a short-lived Google token that acts as `kithub-deployer`. `deploy.yml` asks for the token with `id-token: write` on the `deploy` job only and passes `vars.WIF_PROVIDER` and `vars.WIF_SERVICE_ACCOUNT` to the Google login step.

| Item | Value |
| --- | --- |
| Pool | `github-actions` |
| Provider | `github-main` (OpenID Connect) |
| Issuer | `https://token.actions.githubusercontent.com/` |
| Attribute mapping | `google.subject = assertion.sub`; `attribute.repository_id = assertion.repository_id` |
| Impersonation | `kithub-deployer` can be impersonated by the principal set of the pool filtered by `attribute.repository_id = 1447177977` |

The provider accepts a token only if the attribute condition is true. It is one expression, shown here on several lines:

```text
assertion.repository_id == '1447177977'
&& assertion.repository_owner_id == '153267751'
&& assertion.ref == 'refs/heads/main'
&& assertion.workflow_ref == 'RBKarnz/CPE334_KitHub/.github/workflows/deploy.yml@refs/heads/main'
&& assertion.sub == 'repo:RBKarnz@153267751/CPE334_KitHub@1447177977:environment:demo'
```

| Part of the condition | What it excludes |
| --- | --- |
| `repository_id` and `repository_owner_id` | Any other repository or owner, including a repository that later gets the same name (the numeric IDs do not change when a name is reused) |
| `ref == 'refs/heads/main'` | A run on any other branch or on a pull request |
| `workflow_ref` | Any other workflow file, and a copy of `deploy.yml` on another branch |
| `sub` ending in `environment:demo` | A job that does not run in the GitHub environment `demo` (9.3) |

Why there is no JSON key: a key file is a long-lived secret that can be copied, committed or leaked, and it works from anywhere until someone deletes it. The federated token lives for a single run and is issued only to a run that matches the condition. There is nothing to rotate, and nothing secret is stored in GitHub.

The first Deploy demo run proved the setup end to end (7.6): its first attempt failed because of a typo in `WIF_PROVIDER`, which was fixed in GitHub.

### 9.3 GitHub environment `demo`

| Setting | Value |
| --- | --- |
| Deployment branch | `main` only |
| Variable `GCP_PROJECT_ID` | The Project ID in 6.1 |
| Variable `GCP_REGION` | `asia-southeast1` |
| Variable `WIF_PROVIDER` | `projects/<project number>/locations/global/workloadIdentityPools/github-actions/providers/github-main` |
| Variable `WIF_SERVICE_ACCOUNT` | The email of `kithub-deployer` (not written here) |
| Environment secrets | None |

All four are variables, not secrets: none of them lets anyone act without a token that the condition in 9.2 accepts. The branch rule means a job on another branch cannot start in `demo`, and the condition in 9.2 checks the same thing again on the Google side.

### 9.4 Ruleset `protect-main`

Status Active, target branch `main`, **empty bypass list**: nobody, including the repository owner, can skip a rule.

| Rule | Why |
| --- | --- |
| Restrict deletions | `main` is the release branch and cannot be deleted |
| Block force pushes | The history of `main` cannot be rewritten (R-10) |
| Require a pull request, 1 approval | Nothing reaches `main` without a review by someone other than the author |
| Require status check `test-and-docker`, branches up to date | The job of 5.1 must pass on the exact commit that is merged; a pull request that is behind `main` must be updated first |

Public proof, readable without signing in: <https://api.github.com/repos/RBKarnz/CPE334_KitHub/rules/branches/main>.

### 9.5 The merge gate works (C-02, R-06)

A pull request that fails `test-and-docker` must not be mergeable. It was shown with a failing pull request from a temporary branch, and the released application was never touched.

| Step | Result |
| --- | --- |
| Temporary branch | `test/prove-gate`; one server test was broken on purpose (`server/tests/api/health.test.ts`, commit `eb1c7fd`) |
| Pull request | [#50](https://github.com/RBKarnz/CPE334_KitHub/pull/50) into `main` |
| CI | [Run 43395402297](https://github.com/RBKarnz/CPE334_KitHub/actions/runs/43395402297) failed |
| Merge box | Showed the required check as failed and merging as blocked |
| Clean-up | The pull request was closed **without merging** and the branch deleted |
| `main` | Unchanged, still `bc3611c` |

The screenshots of the failed check and of the blocked merge box are in Issue #6.

## 10. Commands at a glance

Every command below exists in this repository. The last column says where it is explained.

| What | Where | Command | Details |
| --- | --- | --- | --- |
| Build and run everything locally | Repository root | `docker compose up --build -d` | 4.2 |
| Build the image used by CI and Cloud Run | Repository root | `docker build .` | 4.1, 5.1 |
| Run the server for development | `server/` | `npm ci`, then `npm run dev` | README section 3 |
| Run the client for development | `client/` | `npm ci`, then `npm run dev` | README section 4 |
| Build | `server/`, `client/` | `npm run build` | 5.1 |
| Test: server (typecheck, then tests) | `server/` | `npm run typecheck`, `npm test` | 5.1, 5.3 |
| Test: client | `client/` | `npm test` | 5.1, 5.3 |
| Test: end-to-end | Repository root | `npm ci`, `npx playwright install --with-deps chromium`, `npm run typecheck:e2e`, `npm run test:e2e` | 5.1, README section 6 |
| Test: deploy scripts, offline | Repository root | `bash deploy/tests/test_deploy_stub.sh`, `bash deploy/tests/test_release_stub.sh`, `python3 -m unittest discover -s deploy/tests -p 'test_smoke.py'` | 6.7 |
| Migrate | `server/` | `npx prisma migrate deploy` | README section 3 |
| Seed | `server/` | `npm run prisma:seed` | 2.1, README section 3 |
| First deployment on GCP, once | Cloud Shell | `PROJECT_ID=... REGION=... bash deploy/deploy.sh --demo` | 6.4 |
| Release | GitHub | Merge the release pull request into `main`; **Deploy demo** runs | 7.1 |
| Migrate and seed in the cloud | Cloud Run job `kithub-migrate` | Runs `npx prisma migrate deploy && npm run prisma:seed`; started by `deploy/release.sh` in every release | 6.2, 7.1 |
| Find the running commit | Run Summary, Cloud Run, Artifact Registry | Read "Commit image tag" and "Digest" | 7.2 |
| Roll back or roll forward | Actions, Deploy demo, Run workflow on `main` | Set `image_tag` to the full 40-character commit SHA | 7.3, 8.2 |

## 11. Lab 5 issues

| Issue | What | Where in this document |
| --- | --- | --- |
| #1 | Google Cloud project, billing and budget alert | 6.1 (the project); billing and the budget alert are shown in the Issue |
| #2 | Stack, environment variables, cloud readiness | 1, 2, 3 |
| #3 | Docker | 4 |
| #4 | CI on pull requests | 5 |
| #5 | GCP deployment | 6 |
| #6 | GitHub to Google Cloud and the merge gate | 9 |
| #7 | Release pipeline | 7 |
| #8 | Persistence, rollback and roll forward | 8 |
| #9 | This document and the Lab 5 PDF | All sections; the commands are collected in 10 |
