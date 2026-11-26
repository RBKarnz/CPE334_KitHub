# F-08 evidence (#78)

Raw output files are kept exactly as recorded. Corrections are written here, not in the files.

| File | Commit | What | Result |
| --- | --- | --- | --- |
| `red-server.txt` | `73a54a3` (tests only, on the F-07 branch `7089178`) | Whole server suite on the pre-change code | 18 failed / 242 passed, all assertions |
| `red-client.txt` | `73a54a3` | Whole client suite on the pre-change code | 3 failed / 63 passed, all assertions |
| `green-server.txt` | `a31432f` | Server typecheck and full suite | 260 passed, 0 failed, 0 skipped |
| `green-client.txt` | `a31432f` | Client typecheck and full suite | 66 passed, 0 failed, 0 skipped |
| `green-e2e.txt` | `a31432f` | E2E typecheck and `npm run test:e2e` | 4 passed |
| `red2-server.txt` | `eced9b5` (tests only; after merging #93's review fix `36366e5` in `01e42f7`) | Review of PR #94: TEST-107 (c), a loan whose unit is not `ON_LOAN`; whole server suite before the fix | 1 failed / 260 passed, an assertion (`200` instead of `409`) |
| `green2-server.txt` | `ef16ebc` | Server typecheck and full suite after the fix | 261 passed, 0 failed, 0 skipped |
| `green2-client.txt` | `ef16ebc` | Client typecheck and full suite (includes #93's TEST-101 (e)) | 67 passed, 0 failed, 0 skipped |
| `green2-e2e.txt` | `ef16ebc` | E2E typecheck and `npm run test:e2e` | 4 passed |

Notes:

- The return calls live in `client/src/api/loans.ts` (recorded path); the contract planned `client/src/api/returns.ts`. One module per resource keeps the loan list and its actions together.
- For an early return, the loan's own state is checked before its request's state, so a loan that is already `RETURNED` answers "Loan 31 cannot be returned because it is RETURNED, not ACTIVE." (contract 3.5, TEST-107 (a)).
