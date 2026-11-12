# KitHub Deployment (Lab 5)

| Field | Value |
| --- | --- |
| Product | KitHub, a web-based inventory and borrowing system |
| Course | CPE 334, Lab 5: GCP deployment and CI/CD |
| Version | 0.2 |
| Date | 2026-11-12 |
| Authors | Teerakarn Noiruksa (67070501062), Methipat Mansap (67070501071) |
| Design | [SDS v1.7](../../system-sds.md), sections 9.1 to 9.7 |
| Status | Started in #2 (stack, environment variables, cloud readiness); Docker added in #3. GCP names, URLs and evidence are added in #5 to #9 |

## Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-12 | Teerakarn Noiruksa | First version (#2): stack, every environment variable, cloud-readiness check |
| 0.2 | 2026-11-12 | Teerakarn Noiruksa | Section 4 Docker (#3): the files, how to run them locally, what differs from the Starter Kit, and what was checked |

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

The app reads every setting from environment variables (SDS 9.1). Locally the values come from `server/.env` and `client/.env`, copied from the `.env.example` files, which hold placeholders only. On GCP, Cloud Run sets them on the service or the job, and secrets come from Secret Manager. The GCP names below are planned (SDS 9.6); #5 records the final ones.

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

The seed passwords go to the migration job only, because only the seed reads them. The service never needs them.

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
| Fresh clone (C-03) | See the pull request for #3: clone, copy `server/.env.example` to `server/.env` with only the placeholders filled in, `docker compose up --build -d` |

## 5. Still to record

| Section | Issue |
| --- | --- |
| CI on pull requests | #4 |
| GCP project, final resource names, service URL | #5 |
| GitHub to GCP connection and merge gate | #6 |
| Auto deploy from `main` with smoke test | #7 |
| Persistence, rollback and roll forward | #8 |
| Final version of this document and the Lab 5 PDF | #9 |
