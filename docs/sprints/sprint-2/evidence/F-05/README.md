# F-05 evidence (#75)

Raw output files are kept exactly as recorded. Corrections are written here, not in the files.

As for F-04 and F-09, the server suite runs only in CI on this computer: there is no usable local PostgreSQL. Each server run below is the CI job `test-and-docker` on a real PostgreSQL 16, started by hand (`workflow_dispatch`) on the branch. The CI logs are copied here with the log prefix and colour codes removed. Client tests and all typechecks also ran locally.

The branch starts from F-04 (`feature/74-multi-line-requests`, PR #99): the edit uses F-04's body schema, rule check and `RequestForm`.

| File | Commit | What | Result |
| --- | --- | --- | --- |
| `red-server.txt` | `711750f` (tests only) | Server typecheck and whole suite on the pre-change code, CI run 45809666748 | 29 failed / 346 passed, all assertions (`PATCH /api/requests/:id` and `/cancel` answer `404`; TEST-51 cancel rows) |
| `red-client.txt` | `711750f` | Whole client suite on the pre-change code, local | 8 failed / 96 passed |
| `green-client.txt` | `dc96c01` | Client typecheck and whole suite after the implementation, local | 104 passed, 0 failed, 0 skipped |
| `server-dc96c01-deadlock.txt` | `dc96c01` | Server suite on the first implementation commit, CI run 45810084751 | 374 passed, 1 failed: TEST-78 (b) got `500` from a PostgreSQL deadlock (40P01) |
| `green-ci-server.txt` | `7bc8b5e` | Server typecheck and whole suite, CI run 45810422706 (conclusion success) | 375 passed, 0 failed, 0 skipped |
| `green-ci-client.txt` | `7bc8b5e` | Client tests and production build, same run | 104 passed |
| `green-ci-e2e.txt` | `7bc8b5e` | E2E typecheck and `npm run test:e2e`, same run | 5 passed |

Notes:

- **Three TEST-79 cases pass in RED.** They are the cases that check that no control is shown: a `CHECKED_OUT` request, a Custodian's view, and an approved request that was cancelled. The pre-change detail page shows no Edit or Cancel at all, so they hold before and after. The other 8 cases fail on assertions.
- **The deadlock in `dc96c01`.**
  - What happened: an edit locks the Borrower's `users` row and then the request row. The first cancel locked only the request row, and then its history insert needed a key-share lock on the Borrower row (`actorUserId`). Two concurrent calls waited for each other.
  - Fix: `7bc8b5e` makes the cancel lock the Borrower row first, the same order as create and edit (SDS 4.7).
  - No test changed: TEST-78 found the bug, as it was written to.
- **Second run for stability:** after the fix, CI ran once more on `7bc8b5e` (run 45810902076) to check that the race tests are stable. Its result is recorded in the PR.
- **Unrelated log line:** "Sprint 2 demo requests: skipped" in `green-ci-server.txt` is the seed's message, not a skipped test.
