# F-06 evidence (#76, PR #91)

Raw output files are kept exactly as recorded. Corrections are written here, not in the files.

| File | Commit | What | Result |
| --- | --- | --- | --- |
| `red-server.txt` | `cb800c9` (tests only) | The six changed server test files on the pre-change code | 29 failed / 29 passed, all assertions |
| `red-client.txt` | `cb800c9` | Whole client suite on the pre-change code | 10 failed / 43 passed, all assertions |
| `green-server.txt` | `be5e11c` | Server typecheck and full suite | 215 passed, 0 failed, 0 skipped |
| `green-client.txt` | `be5e11c` | Client typecheck and full suite | 53 passed, 0 failed, 0 skipped |
| `green-e2e.txt` | `be5e11c` | `npm run test:e2e` | 4 passed |
| `red2-client.txt` | `d946252` (tests only) | Review of PR #91: TEST-88 (e) no stale rows, TEST-89 (e) dialog locked while running, TEST-89 (f) 400 keeps the reason; whole client suite before the fixes | 3 failed / 52 passed, all assertions |
| `green2-server.txt` | `6e4361e` | Server typecheck and full suite after the fixes | 215 passed, 0 failed, 0 skipped |
| `green2-client.txt` | `6e4361e` | Client typecheck and full suite after the fixes | 55 passed, 0 failed, 0 skipped |
| `green2-e2e.txt` | `6e4361e` | `npm run test:e2e` | 4 passed |

Corrections:

- `green-e2e.txt` line 1 says "not run by CI". That is wrong: `ci-docker.yml` (lines 172 to 174) runs `npm run test:e2e` in `test-and-docker`. The line was briefly edited in `8e92a14` and restored to the recorded text in `d946252` (review of PR #91). The local run above is still the record for `be5e11c`.
- `55db3d9` changed one RED assertion: TEST-84's path case expected the field `id`; the validator names it `params.id`, which TEST-48 (f) already accepts. The `400` check is unchanged.
