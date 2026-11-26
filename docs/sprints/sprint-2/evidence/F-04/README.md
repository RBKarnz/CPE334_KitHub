# F-04 evidence (#74)

Raw output files are kept exactly as recorded. Corrections are written here, not in the files.

As for F-09, the server suite runs only in CI on this computer: there is no usable local PostgreSQL. Each server run below is the CI job `test-and-docker` on a real PostgreSQL 16, started by hand (`workflow_dispatch`) on the branch. The CI logs are copied here with the log prefix and colour codes removed. Client tests and all typechecks also ran locally.

The branch starts from F-09 (`feature/79-catalog-management`, PR #98): TEST-66 (e) and TEST-67 (e) lower limits with F-09's `PATCH /api/item-types/:id`, as the contract says.

| File | Commit | What | Result |
| --- | --- | --- | --- |
| `red-server.txt` | `f67788e` (tests only) | Server typecheck and whole suite on the pre-change code, CI run 45807798272 | 64 failed / 280 passed, all assertions (the Sprint 1 schema refuses `loanDays` and several lines, `GET /api/item-types/:id` answers `404`, the old rule function returns no result for the new input) |
| `red-client.txt` | `f67788e` | Whole client suite on the pre-change code, local | 13 failed / 80 passed, all assertions (pages, links and form not found) |
| `green-client.txt` | `7ba81fb` | Client typecheck and whole suite after the implementation, local | 93 passed, 0 failed, 0 skipped |
| `green-ci-server.txt` | `7ba81fb` | Server typecheck and whole suite, CI run 45808520915 (conclusion success) | 344 passed, 0 failed, 0 skipped |
| `green-ci-client.txt` | `7ba81fb` | Client tests and production build, same run | 93 passed |
| `green-ci-e2e.txt` | `7ba81fb` | E2E typecheck and `npm run test:e2e`, same run | 5 passed |
| `review-red-client.txt` | `a055ef7` (test only) | Whole client suite after the review of #99 added a check to TEST-71 (g), local | 1 failed / 92 passed: the history entry still holds `{"notice":"Request #12 submitted."}` |
| `review-green-client.txt` | `a7c272e` | Client typecheck and whole suite after the fix, local | 93 passed, 0 failed, 0 skipped |

Notes:

- **TEST-71 timing fix:** `7ba81fb` changes TEST-71 (`NewRequestPage.test.tsx`) to wait for the form's first line before using it. The RED version waited only for the "New request" heading, which shows while the item types are still loading. RED failed for the right reason (the page did not exist); no assertion was removed.
- **Unit tests through a typed view:** `server/tests/unit/request-rules.test.ts` calls `requestRuleViolation` through a typed view, so it typechecks before and after the new input shape and RED fails on assertions, not in `npm run typecheck` (which CI runs before the tests).
- **Unrelated log line:** the log line "Sprint 2 demo requests: skipped" in `green-ci-server.txt` is the seed's message, not a skipped test.
- **Review of #99 (nit fixed here):** the "Request #n submitted." notice came from the history entry's state, which a browser reload keeps, so a reload showed it again. `a055ef7` adds the check to TEST-71 (g); `a7c272e` makes the detail page clear the state after reading it.
