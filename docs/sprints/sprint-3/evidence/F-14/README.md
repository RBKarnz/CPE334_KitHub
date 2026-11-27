# F-14 evidence (#111)

Raw output files are kept exactly as recorded. Corrections are written here, not in the files.

There is no local PostgreSQL on the machine that wrote this feature, so the server suite was run in CI (`ci-docker.yml`, job `test-and-docker`, started with `gh workflow run ci-docker.yml --ref feature/111-inventory-report`). The server files are the step "Install & Test Backend (Typecheck + Prisma Migrate + Seed + Vitest)" of that run, with the runner's timestamp prefix and ANSI colours removed. The client suite was run locally.

| File | Commit | What | Result |
| --- | --- | --- | --- |
| `red-server.txt` | `bdeffcd` (tests only) | Server typecheck and whole suite on the pre-change code, CI run 45938098754 | Typecheck clean; 5 failed / 375 passed, every failure `404` where `200` or `403` is expected (the route is missing) |
| `red-client.txt` | `bdeffcd` | Client typecheck and whole suite on the pre-change code | 5 failed / 105 passed, every failure a missing heading, text or link (the page is missing) |
| `green-server.txt` | `e111146` | Server typecheck and whole suite, CI run 45938401167 | Typecheck clean; 380 passed, 0 failed |
| `green-client.txt` | `e111146` | Client typecheck and whole suite | 110 passed, 0 failed |

Commits on `feature/111-inventory-report` (from `staging` at `83fb906`):

| Commit | What |
| --- | --- |
| `bdeffcd` | RED: TEST-158 to TEST-163, tests only |
| `0f0d3d4` | Test fix: TEST-163 (a) waits for "Generated …" (`findByText`); this RED evidence |
| `e111146` | GREEN: `server/src/features/reports/`, route in `app.ts`; `client/src/api/reports.ts`, `InventoryReportPage.tsx`, route and Reports link |

Notes:

- TEST-163 (a) first checked "Generated …" with `getByText` right after the heading appeared. The heading renders before the report loads, so the check ran too early. `0f0d3d4` changes it to `findByText`; on the pre-change code the test still fails on the missing heading.
- TEST-159 and TEST-161 make their loans with the real approve and checkout endpoints (F-06, F-07), and TEST-161 uses the real early return, repair and retire endpoints (F-08, F-09), as contract 8.3 asks.
- The item type in TEST-158 to TEST-161 is named "Arduino Nano", not "Arduino Uno R3" as in contract 8.2, because item type names are unique and the shared test world already has an "Arduino Uno R3".
- Review of PR #118 (not blocking): AC-163 names a loading state, but no TEST-163 case checked it. TEST-163 (f) is added: with the report reply held back, the page shows "Loading…" under its heading, and the table once the reply arrives. Client suite after it: 111 passed, 0 failed (local).
