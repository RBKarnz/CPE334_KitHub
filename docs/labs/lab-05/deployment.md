# KitHub Deployment (Lab 5)

| Field | Value |
| --- | --- |
| Product | KitHub, a web-based inventory and borrowing system |
| Course | CPE 334, Lab 5: GCP deployment and CI/CD |
| Version | 0.5 |
| Date | 2026-11-13 |
| Authors | Teerakarn Noiruksa (67070501062), Methipat Mansap (67070501071) |
| Design | [SDS v1.8](../../system-sds.md), sections 9.1 to 9.7 |
| Status | Started in #2 (stack, environment variables, cloud readiness); Docker added in #3; CI added in #4; `deploy/` adapted and the first GCP deployment run in #5 (Service URL in 6.1). Evidence for #6 to #9 is added later |

## Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-12 | Teerakarn Noiruksa | First version (#2): stack, every environment variable, cloud-readiness check |
| 0.2 | 2026-11-12 | Teerakarn Noiruksa | Section 4 Docker (#3): the files, how to run them locally, what differs from the Starter Kit, and what was checked |
| 0.3 | 2026-11-12 | Teerakarn Noiruksa | Section 5 CI on pull requests (#4): what the workflow runs, what differs from the Starter Kit, and the local run of every step |
| 0.4 | 2026-11-12 | Methipat Mansap | Section 6 GCP deployment (#5): project, region, resource names, which secrets go to the service and to the job (and the IAM scope of the shared runtime account), the Cloud Shell commands, the smoke-test checks and the changes to `deploy/`. Notes in 2 and 5.2 updated; "Still to record" is now section 7 |
| 0.5 | 2026-11-13 | Teerakarn Noiruksa | First deployment done (#5): Service URL in 6.1, new 6.8 with the run, the checks on the public URL and the Console check; #5 removed from section 7 |

## 1. Stack

| Layer | Choice |
| --- | --- |
| UI | React 18 + TypeScript, built with Vite 6; React Router 6; Bootstrap 5 |
| API | Node.js 24 + Express 4 + TypeScript; zod for validation; bcryptjs for password hashing |
| Data access | Prisma 5 (schema, migrations, client) |
| Database | PostgreSQL 16: Docker container or local install on a laptop, Cloud SQL for PostgreSQL 16 on GCP |
| Tests | Vitest and Supertest (server), Vitest and Testing Library (client), Playwright (end-to-end) |
| Packaging | One Docker image that serves the API under `/api` and the built UI (SDS DD-01), built in #3 |
| Hosting (planned) | Cloud Run service `kithub` and Cloud Run job `kithub-migrate` in `asia-southeast1` (SDS 9.6) |

Exact package versions are pinned in each `package-lock.json`.

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

Workflow "CI & Docker Build", job `test-and-docker` (the name the merge gate in #6 requires). It starts on every pull request into `staging` or `main`, by hand from the Actions tab (`workflow_dispatch`), and from the deploy workflow in #7 (`workflow_call`). `permissions` is `contents: read` only.

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

For #7: `deploy.yml` must pass `SMOKE_USERNAME` as a variable and `SMOKE_PASSWORD` as a secret of the `demo` environment (the guide's 7.3 says `SMOKE_EMAIL`; KitHub signs in with a username). The account must be a Borrower, never a Custodian.

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

## 7. Still to record

| Section | Issue |
| --- | --- |
| GitHub to GCP connection and merge gate | #6 |
| Auto deploy from `main` with smoke test | #7 |
| Persistence, rollback and roll forward | #8 |
| Final version of this document and the Lab 5 PDF | #9 |
