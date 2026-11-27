# F-11 evidence (#108)

Raw output files are kept exactly as recorded. Corrections are written here, not in the files.

There is no local PostgreSQL on the machine that wrote this feature, so the server suite was run in CI (`ci-docker.yml`, job `test-and-docker`, started with `gh workflow run ci-docker.yml --ref feature/108-overdue-limits`). The server files are the step "Install & Test Backend (Typecheck + Prisma Migrate + Seed + Vitest)" of that run, with the runner's timestamp prefix and ANSI colours removed. The client suite was run locally.

| File | Commit | What | Result |
| --- | --- | --- | --- |
| `red-server.txt` | `a5419ab` (tests only) | Server typecheck and whole suite on the pre-change code, CI run 45932516855 | Typecheck clean; 27 failed / 379 passed, all assertions |
| `red-client.txt` | client files as in `a5419ab` | Client typecheck and whole suite on the pre-change code | 107 passed, 0 failed (TEST-141 passes; see the notes) |
| `green-server.txt` | `4763dcc` | Server typecheck and whole suite, CI run 45933275728 | Typecheck clean; 406 passed, 0 failed |
| `green-client.txt` | `4763dcc` | Client typecheck and whole suite | 107 passed, 0 failed, 0 skipped |

Commits on `feature/108-overdue-limits`:

| Commit | What |
| --- | --- |
| `a5419ab` | RED: TEST-132 to TEST-139 and TEST-141, tests only |
| `e04d4ad` | Test fix: TEST-134 (e) signs in again after its 31-hour clock jump; this RED evidence |
| `a524ed2` | GREEN code: `request-rules.ts`, `requests.service.ts`, `requests.view.ts`, `requests.schemas.ts` |
| `4763dcc` | Test fix: the older exact-key tests TEST-09 and TEST-18 name the new `overdue` field; TEST-133 (c) to (e) accept `query.overdue` |

Notes:

- Every RED failure is an assertion: a missing function (`expected 'undefined' to be 'function'`), `201` where `409` is expected, a missing `overdue` field, or the wrong order of the overdue list. None is an import or type error.
- Two RED failures were not caused by the missing feature, and were fixed in the tests:
  - TEST-134 (d), (e) got `401` where `201` was expected. The test moved the clock 31 hours forward (`NOW` to `LATER`), past the 8-hour session (`SESSION_TTL_HOURS` default), so the cookie had expired. Fixed in `e04d4ad` by signing in again after the jump. With the fix, TEST-134 (d), (e) pass on the pre-change code, as a "does not block" case should.
  - TEST-133 (c) to (e) expected the detail field `overdue`. The API names a query field `query.overdue` (`zodIssuesToDetails`, as `query.status` in TEST-99 (c)). On the pre-change code the request was still `400`, because the strict schema did not know `overdue`. Fixed in `4763dcc` to accept `overdue` or `query.overdue`, the same check as TEST-99 (c).
- The GREEN run of `a524ed2` (CI run 45932997574) had 403 passed / 3 failed: the TEST-133 field name above, and TEST-09 and TEST-18, whose exact key lists did not include the new `overdue` field (contract 5.1 adds it to every request). No application code changed after `a524ed2`.
- TEST-141 (AC-141) passes before the change. The request form already shows any `409` as an alert with the API message and keeps the entered lines and loan length (F-04, F-05), so the new `OVERDUE_BLOCK` and `BORROW_LIMIT` codes needed no client change. TEST-141 is kept as a guard.
- AC-140 (the Overdue marker and the Custodian `/overdue` page) is not built in this PR and stays Planned in `docs/features.md` 6.2. The API it needs, `overdue` on every request and `GET /api/requests?overdue=true`, is here.
