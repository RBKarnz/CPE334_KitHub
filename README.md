# KitHub

KitHub is a web-based inventory and borrowing system for a faculty hardware room (CPE 334 group project, Theme 2). Borrowers browse the catalog of boards, sensors, kits and instruments and request items; Custodians check units out and in, and every state change is kept in an append-only history.

Design documents:

- [Software Requirements Specification](docs/srs.md)
- [System-Level Software Design Specification](docs/system-sds.md)
- [Feature inventory](docs/features.md) and [traceability](docs/traceability.md)
- [Three-sprint plan](docs/sprints/plan.md)

## Prerequisites

- Node.js 24 (the Lab 5 Docker image uses `node:24-alpine`)
- PostgreSQL 16

## 1. Start PostgreSQL and create the databases

KitHub uses two databases: `kithub` for development and demos, and `kithub_test` for automated tests (tests refuse to run against any database whose name does not end in `_test`).

**Option A: Docker.** Choose your own local database password and use it in place of `<local-db-password>`:

```sh
docker run -d --name kithub-pg -e POSTGRES_USER=kithub -e POSTGRES_PASSWORD=<local-db-password> -e POSTGRES_DB=kithub -p 5432:5432 -v kithub-pgdata:/var/lib/postgresql/data postgres:16
docker exec kithub-pg createdb -U kithub kithub_test
```

The named volume `kithub-pgdata` keeps the data when the container restarts.

**Option B: local install.** Install PostgreSQL 16, then as a superuser:

```sql
CREATE ROLE kithub LOGIN PASSWORD '<local-db-password>' CREATEDB;
CREATE DATABASE kithub OWNER kithub;
CREATE DATABASE kithub_test OWNER kithub;
```

## 2. Configure the environment

```sh
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Edit `server/.env`: put your local database password in `DATABASE_URL` and `TEST_DATABASE_URL`, and choose local passwords for `SEED_CUSTODIAN_PASSWORD` and `SEED_BORROWER_PASSWORD` (at most 72 bytes). Every variable is explained in [SDS section 9.1](docs/system-sds.md#91-environment-variables). `client/.env` can stay as it is: an empty `VITE_API_URL` means the UI calls the API on the same origin.

## 3. Server: install, migrate, seed, run

```sh
cd server
npm ci
npx prisma migrate deploy
npm run prisma:seed
npm run dev
```

The API listens on `http://localhost:3000`. Check it with `GET /api/health` (process is up) and `GET /api/ready` (database is reachable).

The seed is safe to run again: it only inserts records that are missing and never changes existing ones.

## 4. Client: install and run

In a second terminal:

```sh
cd client
npm ci
npm run dev
```

Open the URL Vite prints (`http://localhost:5173`). Vite forwards `/api` calls to the server on port 3000.

## 5. Tests and builds

```sh
cd server && npm test     # unit and API tests; needs kithub_test and TEST_DATABASE_URL
cd client && npm test     # component tests (jsdom)
```

`npm test` in `server/` first applies any pending migrations to `kithub_test` (`prisma migrate deploy`), then runs the test files one at a time. API tests empty and refill `kithub_test`; they never touch `kithub`.

Production builds:

```sh
cd server && npm run build && npm start   # compiles to server/dist
cd client && npm run build                # compiles to client/dist
```

With `NODE_ENV=production`, the server also serves the built UI from `client/dist` (one origin for UI and API).

## Seeded accounts

| Username | Role | Seeded when |
| --- | --- | --- |
| `custodian1`, `custodian2` | Custodian | Always |
| `borrower1`, `borrower2` | Borrower | `SEED_DEMO_DATA=true` |

The passwords are the values you set in `SEED_CUSTODIAN_PASSWORD` and `SEED_BORROWER_PASSWORD` in your own `server/.env`. No password is stored in this repository.

## Never commit secrets

`.env` files are ignored by Git; only `.env.example` files with placeholders are committed. Never put a real password, session token or connection string in code, documents, screenshots or chat. Anything in a `VITE_` variable is compiled into the public JavaScript bundle, so it must never hold a secret.
