# F-09 evidence (#79)

Raw output files are kept exactly as recorded. Corrections are written here, not in the files.

The server suite needs PostgreSQL. This computer has none it can use: Docker Desktop cannot start because virtualization is off, and the local PostgreSQL 17 rejects the project credentials. So every server run below is the CI job `test-and-docker` on a real PostgreSQL 16, started by hand (`workflow_dispatch`) on the branch. The CI logs are copied here with the log prefix and colour codes removed. Client tests and all typechecks also ran locally.

| File | Commit | What | Result |
| --- | --- | --- | --- |
| `red-server.txt` | `567c530` (tests only) | Server typecheck and whole suite on the pre-change code, CI run 45803528589 | 35 failed / 263 passed, all assertions (missing routes answer `404`, TEST-08 key set, TEST-51 rows) |
| `red-client.txt` | `567c530` | Whole client suite on the pre-change code, local | 15 failed / 67 passed, all assertions (pages and link not found) |
| `green-client.txt` | `7b4aefc` | Client typecheck and whole suite after the implementation, local | 82 passed, 0 failed, 0 skipped |
| `server-7b4aefc-test59.txt` | `7b4aefc` | Server suite after the implementation, CI run 45804705045 | 297 passed, 1 failed: TEST-59 (#71) |
| `e2e-41e20f0-catalog-link.txt` | `41e20f0` | E2E after the TEST-59 revision, CI run 45805076115 (server and client passed in that run) | 3 passed, 2 failed: TEST-30 and the Sprint 2 walkthrough |
| `green-ci-server.txt` | `4aec247` | Server typecheck and whole suite, CI run 45805552602 (conclusion success) | 298 passed, 0 failed, 0 skipped |
| `green-ci-client.txt` | `4aec247` | Client tests and production build, same run | 82 passed, 0 failed, 0 skipped |
| `green-ci-e2e.txt` | `4aec247` | E2E typecheck and `npm run test:e2e`, same run | 5 passed |
| `review-red-client.txt` | `2a04d00` (test only) | Whole client suite after the review of #98 added a TEST-121 (d) case, local | 1 failed / 82 passed: each edit sent every field |
| `review-green-client.txt` | `c002446` | Client typecheck and whole suite after the fix, local | 83 passed, 0 failed, 0 skipped |

Notes:

- **TEST-121 (e)** (`ManageUnitsPage.test.tsx`) failed in RED for the right reason: the page did not exist. But the RED version of its first check matched the wrong "Loading…". The sign-in check shows its own "Loading…" screen first. `7b4aefc` makes the test wait for the navigation bar before it looks for the page's "Loading…". No assertion was removed.
- **TEST-59** (change request #71) pinned `server/prisma/migrations` to exactly the two folders of staging `5508f49`. F-09 adds `20261126110000_catalog_names_ci` by contract (F09-D11), so `server-7b4aefc-test59.txt` shows TEST-59 as the only failure, with every F-09 test passing. `41e20f0` keeps the test's rule: the two migrations from before #71 are still the first, and no later migration mentions `dueAt`.
- **E2E TEST-30 and the walkthrough** clicked `getByRole("link", { name: "Catalog" })`. Playwright matches that name as a substring, so it also found the new "Manage catalog" link and stopped on a strict-mode violation (`e2e-41e20f0-catalog-link.txt`). `4aec247` adds `exact: true` to both selectors. The steps and assertions are unchanged.
- **Wrong test IDs in a commit message:** `7b4aefc`'s message says the client catalog fixtures belong to "TEST-09". They belong to TEST-17 and TEST-40 (`client/tests/catalog.test.tsx`). Only the two category fields were added, for the typecheck.
- **The `skipped` in `green-ci-server.txt`** is the seed's own message ("Sprint 2 demo requests: skipped"). It is not a skipped test.
- **Review of #98 (nit fixed here):** the category and item type forms sent every field on an edit. If another Custodian had moved the item type meanwhile, saving an unrelated change moved it back. `2a04d00` adds a TEST-121 (d) case; `c002446` sends only the fields that differ from the record as the form opened it, and an edit with no change closes the form with no call (the API refuses an empty edit, 3.4).
