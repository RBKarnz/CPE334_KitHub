# F-08 evidence (#78)

Raw output files are kept exactly as recorded. Corrections are written here, not in the files.

| File | Commit | What | Result |
| --- | --- | --- | --- |
| `red-server.txt` | `73a54a3` (tests only, on the F-07 branch `7089178`) | Whole server suite on the pre-change code | 18 failed / 242 passed, all assertions |
| `red-client.txt` | `73a54a3` | Whole client suite on the pre-change code | 3 failed / 63 passed, all assertions |
| `green-server.txt` | `a31432f` | Server typecheck and full suite | 260 passed, 0 failed, 0 skipped |
| `green-client.txt` | `a31432f` | Client typecheck and full suite | 66 passed, 0 failed, 0 skipped |
| `green-e2e.txt` | `a31432f` | E2E typecheck and `npm run test:e2e` | 4 passed |

Notes:

- The return calls live in `client/src/api/loans.ts` (recorded path); the contract planned `client/src/api/returns.ts`. One module per resource keeps the loan list and its actions together.
- For an early return, the loan's own state is checked before its request's state, so a loan that is already `RETURNED` answers "Loan 31 cannot be returned because it is RETURNED, not ACTIVE." (contract 3.5, TEST-107 (a)).
