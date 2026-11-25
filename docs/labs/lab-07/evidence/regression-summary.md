# Lab 7 #71: RED, GREEN and regression summary

| Field | Value |
| --- | --- |
| Change request | #71, specified in PR #72 (https://github.com/RBKarnz/CPE334_KitHub/pull/72), implemented in PR #88 |
| Base | `staging` `5508f49` (after #72 was merged) |
| RED commit (tests only) | `e08dbb2` |
| GREEN commit (implementation) | `b1898d5` |
| Environment | Windows 11, Git Bash, node v24.14.0, npm 10.8.2, PostgreSQL 16 in Docker (`kithub-pg`, test database `kithub_test`) |
| Recorded | 2026-11-25, ICT; each file states its own command, commit and time |

## RED: pre-change code with the new and revised tests

| Suite | Command | Commit | Passed | Failed | Skipped | File |
| --- | --- | --- | --- | --- | --- | --- |
| Server, the three changed files | `npx vitest run tests/unit/due-date.test.ts tests/api/checkout.test.ts tests/api/due-date-preview.test.ts` | `e08dbb2` | 27 | 22 | 0 | `red-server.txt` |
| Client, whole suite | `npx vitest run` | `e08dbb2` | 40 | 2 | 0 | `red-client.txt` |

All 24 failures are assertions about behaviour that does not exist yet: the old due time (for example `2026-11-20T07:30:00.000Z` instead of `2026-11-20T10:00:00.000Z` in TEST-19, TEST-50, TEST-54 to TEST-57), `404` from the missing preview route (TEST-58 (a) to (e)), and the missing preview line in the dialog (TEST-58 (f), (g)). None is an import or compile error. TEST-59 and TEST-60 pass on the old code, as expected: they check that stored values are kept and shown, which the old code already does.

## GREEN: implementation and regression

| Suite | Command | Commit | Passed | Failed | Skipped | File |
| --- | --- | --- | --- | --- | --- | --- |
| Server typecheck | `npm run typecheck` | `b1898d5` | exit 0 | - | - | `green-server.txt` |
| Server, whole suite (27 files) | `npx vitest run` | `b1898d5` | 185 | 0 | 0 | `green-server.txt` |
| Client typecheck | `npx tsc --noEmit -p .` | `b1898d5` | exit 0 | - | - | `green-client.txt` |
| Client, whole suite (5 files) | `npx vitest run` | `b1898d5` | 42 | 0 | 0 | `green-client.txt` |
| End-to-end (Playwright, not run by CI) | `npm run test:e2e` | `b1898d5` | 4 | 0 | 0 | `green-e2e.txt` |

The implementation diff is `green-diff.txt` (`git diff e08dbb2 b1898d5 -- server/src client/src`, 7 files, 104 insertions, 10 deletions).

## Old behaviour each suite protects

| Old behaviour (change-71.md section 3) | Tests in the GREEN run | Result |
| --- | --- | --- |
| Checkout flow and its rejections: request `PENDING` → `CHECKED_OUT`, unit `AVAILABLE` → `ON_LOAN`, one `ACTIVE` loan, `409`/`404`/`400` cases | `checkout.test.ts` (26: TEST-19 to TEST-21, TEST-26, TEST-42 to TEST-46, TEST-54, TEST-59), `checkout-concurrency.test.ts` (3: TEST-22, TEST-47), `units.test.ts` (6: TEST-48), `transitions.test.ts` (9: TEST-51), `checkout-errors.test.ts` (3: TEST-52) | All pass |
| History: three entries per checkout, append-only | `checkout-history.test.ts` (5: TEST-23, TEST-24) | All pass |
| BR-04 and the other request rules, with the Lab 6 correction #68 | `requests-create.test.ts` (18, includes TEST-11b), `requests-concurrency.test.ts`, `request-rules.test.ts`, `catalog.test.ts`, `requests-read.test.ts`, E2E TEST-31 | All pass |
| Roles and access: Custodian-only endpoints, no session rejected, no cross-Borrower access | `checkout-access.test.ts` (8: TEST-41), `requests-access.test.ts` (4: TEST-14, TEST-15), `auth.test.ts` (14: TEST-01 to TEST-07), `due-date-preview.test.ts` TEST-58 (b), (c) for the new endpoint, E2E TEST-32 | All pass |
| Persistence: data survives a restart; database constraints; old loans keep their `dueAt`; no migration added | `persistence.test.ts` (1: TEST-27), `schema.test.ts` (6), TEST-59 | All pass |
| UI: pending list, checkout dialog, catalog, My requests, narrow screens | client suite (42), E2E TEST-30 (revised due-date assertion only) and TEST-53 | All pass |

No test was deleted, skipped or weakened. The expected values that changed (TEST-19, TEST-49 (e), TEST-50, TEST-30) are listed with their old values in F-03 contract v1.3 section 8.2.
