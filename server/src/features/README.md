# server/src/features

One folder per feature area (SDS 3.6): `auth`, `catalog`, `requests`, `loans`, `units`, `history`, `reports`. Each folder holds:

- `*.routes.ts`: Express router; applies `authenticate`, `requireRole` and `validate` (from `core/middleware/`)
- `*.service.ts`: business rules, ownership scope, transactions and history entries
- `*.schemas.ts`: strict zod schemas for params, query and body

Mount each router in `src/app.ts` where the comment says so, before the `/api` not-found handler.

Empty in the project skeleton (#13). Features are added after their contracts are merged into `staging`.
