# F-07 evidence (#77)

Raw output files are kept exactly as recorded. Corrections are written here, not in the files.

| File | Commit | What | Result |
| --- | --- | --- | --- |
| `red-server.txt` | `29d8600` (tests only) | Whole server suite on the pre-change code | 42 failed / 201 passed, all assertions |
| `red-client.txt` | `29d8600` | Whole client suite on the pre-change code | 22 failed / 40 passed, all assertions |
| `red-e2e.txt` | `29d8600` | `npm run test:e2e` on the pre-change code | 3 failed / 1 passed |
| `green-server.txt` | `e7387f9` | Server typecheck and full suite | 243 passed, 0 failed, 0 skipped |
| `green-client.txt` | `e7387f9` | Client typecheck and full suite | 62 passed, 0 failed, 0 skipped |
| `green-e2e.txt` | `e7387f9` | E2E typecheck and `npm run test:e2e` | 4 passed |

Corrections:

- `red-e2e.txt`: TEST-30 and TEST-53 fail because the pre-change code has no Ready for checkout page and no checkbox dialog (missing behaviour). TEST-32 fails on a line the RED commit forgot to revise: it still expected the request to stay `PENDING` while the test creates it `APPROVED` (F07-D8). `d209aaf` corrects that one assertion to `APPROVED`; it is a test fix, not a behaviour change.
