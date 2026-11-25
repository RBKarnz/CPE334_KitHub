# F-08 Returns: return all and early return: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-08 Returns: return all and early return |
| Sprint | 2 (due 2026-11-29) |
| Version | 1.1 |
| Status | Proposed (PR for #78); implementation starts only after this contract is reviewed and merged |
| Date | 2026-11-25 |
| Authors | Teerakarn Noiruksa (67070501062); reviewer Methipat Mansap (67070501071) |
| Baseline | SRS v1.3 (v1.4 after #71), System-Level SDS v1.8 (Sprint 2 columns from #73), F-07 contract v1.0 (#77) |
| Issues | #78 this feature; #73 `loans.returnedAt`, `returnedById`, `returnCondition` and CHECK `loans_returned_check`; #77 F-07 creates multi-unit loans |
| Definition of Done | [Product Definition of Done](../sprint-1/definition-of-done.md) and section 9 |
| AC/TEST block | 102 to 109 (claimed in #78) |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-25 | Teerakarn Noiruksa | First contract: AC-102 to AC-109, TEST-102 to TEST-109, decisions F08-D1 to F08-D6. Review of PR #82: return-all body cap 100 derived from F04-D2, as F-07 3.4 (3.4); `415` comes first (3.5) |
| 1.1 | 2026-11-25 | Teerakarn Noiruksa | Review of PR #83: a return-all that names a loan of this request which is no longer `ACTIVE` gives `409 INVALID_STATE` with the loan's state, not `400`, so 3.5 and 3.7 agree for a return-all racing an early return (3.4, 3.5, AC-107, TEST-107 (b), new TEST-108 (c)). `400` stays for loans of another request, duplicates and missing active loans |

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What F-08 does with it |
| --- | --- | --- |
| Functional | FR-20, FR-21 | Return every unit of a `CHECKED_OUT` request with a condition per unit (default good); return one unit early; the request becomes `RETURNED` when its last unit is back |
| Business rules | BR-11, BR-16 | A damaged unit goes to `MAINTENANCE`, a good one to `AVAILABLE`; history for every change |
| SRS state rows | 8.1 `ON_LOAN` → `AVAILABLE`, `ON_LOAN` → `MAINTENANCE`; 8.2 `CHECKED_OUT` → `RETURNED`; 8.3 `ACTIVE` → `RETURNED` | The only transitions F-08 performs |
| Non-functional | NFR-01, NFR-02, NFR-05, NFR-09, NFR-12 | Session and role checks; concurrent returns; history; UI states |

### 2.2 Depends on

| Dependency | What F-08 uses | Status on 2026-11-25 |
| --- | --- | --- |
| #73 | `loans.returnedAt`, `returnedById`, `returnCondition`; CHECK `loans_returned_check` | PR #80 |
| F-07 (#77) | Requests with several `ACTIVE` loans; the Loans page and `GET /api/loans` | Contract PR #82 |
| F-03 | Transition table, history pattern, request detail with loans | Done |

### 2.3 Out of scope

| Not in F-08 | Arrives in |
| --- | --- |
| Setting a `MAINTENANCE` unit back to `AVAILABLE` (repair) | F-09 (#79, FR-25) |
| Overdue status and late-return marking | Sprint 3, F-11 (the return time is stored, so F-11 can compare it with `dueAt`) |
| Fines, notes per return, photos | Not in the SRS |

## 3. Feature-level design (Feature SDS)

### 3.1 Behaviour and workflow

**Return all (FR-20).**

1. On the detail of a `CHECKED_OUT` request, the Custodian chooses **Return all**. A dialog lists every `ACTIVE` loan (asset tag, item type) with a condition choice "Good" (default) or "Damaged".
2. The UI calls `POST /api/requests/:id/return` with `{ "loans": [ { "loanId", "condition" } ] }`, one entry per `ACTIVE` loan.
3. One transaction: the request must be `CHECKED_OUT`; the entries must name exactly its `ACTIVE` loans; for each loan in ascending loan ID order a conditional update `ACTIVE` → `RETURNED` sets `returnedAt`, `returnedById`, `returnCondition`, and the unit moves `ON_LOAN` → `AVAILABLE` (good) or `MAINTENANCE` (damaged); the request moves `CHECKED_OUT` → `RETURNED`; history entries are written.
4. `200` with the request, now `RETURNED`.

**Early return of one unit (FR-21).**

1. On the same detail each `ACTIVE` loan has **Return this unit**, with the same condition choice.
2. The UI calls `POST /api/loans/:id/return` with `{ "condition" }`.
3. One transaction: the loan must be `ACTIVE` and its request `CHECKED_OUT`; the loan and its unit move as above; if this was the request's last `ACTIVE` loan, the request also moves to `RETURNED` (F08-D2).
4. `200` with the request that owns the loan.

Any failure rolls back every write.

### 3.2 State changes

| Entity | From | To | When |
| --- | --- | --- | --- |
| Loan | `ACTIVE` | `RETURNED` | Each returned loan; `returnedAt` = `now`, `returnedById` = Custodian, `returnCondition` |
| Unit | `ON_LOAN` | `AVAILABLE` | Condition `GOOD` |
| Unit | `ON_LOAN` | `MAINTENANCE` | Condition `DAMAGED` (BR-11) |
| Request | `CHECKED_OUT` | `RETURNED` | When no `ACTIVE` loan of the request is left |

### 3.3 Business rules and where they are enforced

| Rule | UI (hint only) | Route and middleware | Service (in the transaction) | Domain | Database |
| --- | --- | --- | --- | --- | --- |
| Custodian only (BR-17, NFR-02) | Buttons for Custodians only | `requireRole("CUSTODIAN")` on both endpoints | - | - | - |
| Only `CHECKED_OUT` requests and `ACTIVE` loans | Buttons only there | - | Conditional updates `WHERE status = 'CHECKED_OUT'` / `'ACTIVE'` → `409 INVALID_STATE` | `assertTransition` for loan, unit and request rows | - |
| Return all names exactly the active loans (FR-20) | Dialog lists all active loans | Strict schema | The set of `loanId`s equals the request's `ACTIVE` loans → otherwise `400` | - | - |
| Condition decides the unit state (BR-11) | Default "Good" | `condition` one of `GOOD`, `DAMAGED`; default `GOOD` | `GOOD` → `AVAILABLE`, `DAMAGED` → `MAINTENANCE` | `assertTransition("UNIT", "ON_LOAN", …)` | - |
| `returnedAt` exactly when `RETURNED` | - | - | Set in the same update | - | CHECK `loans_returned_check` (#73) |
| Request ends when the last unit is back (FR-21) | - | - | Count of `ACTIVE` loans after the update is 0 → request update | - | - |
| History (BR-16) | - | - | Entries in the same transaction (3.6) | - | Append-only trigger |

### 3.4 Validation

| Input | Rule | Error |
| --- | --- | --- |
| Path `id` | Integer ≥ 1 | `400` naming `id` |
| Return-all body | Strict `{ loans }`; 1 to 100 strict entries `{ loanId: int ≥ 1, condition?: "GOOD" \| "DAMAGED" }`. 100 is the largest checkout F-07 accepts (10 lines × 10 per line, F04-D2), so every checked-out request fits; the rule is the service set check below | `400` naming the field |
| Return-all loans (service) | Every `loanId` is a loan of this request and appears once; every named loan is `ACTIVE`; every `ACTIVE` loan of the request appears | `400` naming `loans[i].loanId` for a loan of another request or an unknown loan ("Loan 31 is not a loan of request #12") or a duplicate ("Loan 31 is listed twice"); `409 INVALID_STATE` for a named loan of this request that is no longer `ACTIVE` ("Loan 31 cannot be returned because it is RETURNED, not ACTIVE."); `400` naming `loans` when active loans are missing ("2 active loans are missing") |
| Early-return body | Strict `{ condition?: "GOOD" \| "DAMAGED" }` | `400` naming the field |

### 3.5 Check order

`415` → `401` → `403` → `400` (shape) → `404` (request or loan) → `409 INVALID_STATE` (request not `CHECKED_OUT`, or, for an early return, the loan not `ACTIVE`) → return all: `400` (a named loan is not a loan of this request, or is listed twice) → `409 INVALID_STATE` (a named loan of this request is no longer `ACTIVE`, read inside the transaction) → `400` (an `ACTIVE` loan of the request is missing). The state checks come before the missing-loan check so that a request or loan returned by someone else answers `409`, not a confusing `400`; a return-all that races an early return of one of its loans therefore gets `409`, as 3.7 says.

### 3.6 History entries

One timestamp `now` per transaction; `actorType` `USER`, `actorUserId` the Custodian.

| Entry | `entityType` | `action` | From → to | `details` |
| --- | --- | --- | --- | --- |
| Per returned loan | `LOAN` | `STATUS_CHANGED` | `ACTIVE` → `RETURNED` | `{ "condition": "GOOD" }` or `DAMAGED` |
| Per returned unit | `UNIT` | `STATUS_CHANGED` | `ON_LOAN` → `AVAILABLE` or `MAINTENANCE` | null |
| Request, when it ends | `REQUEST` | `STATUS_CHANGED` | `CHECKED_OUT` → `RETURNED` | null |

Loan and unit entries carry `requestId`, `unitId` and, for loan entries, `loanId`.

### 3.7 Concurrency

- Two return-all calls on the same request, or a return-all and an early return of one of its loans: the conditional loan updates let each loan be returned once; the later call gets `409 INVALID_STATE` (the request is `RETURNED`, or a named loan is no longer `ACTIVE`, 3.5) and rolls back completely.
- Two early returns of the last two loans at the same time: each locks the request row (`SELECT … FOR UPDATE`) before counting the `ACTIVE` loans, so exactly one of them moves the request to `RETURNED`.

### 3.8 Decisions made in this contract

| ID | Decision | Reason |
| --- | --- | --- |
| F08-D1 | Return all must list every `ACTIVE` loan of the request; it cannot return a subset | FR-20 is "return all"; a subset is what the early-return endpoint is for, one loan at a time |
| F08-D2 | An early return of the last `ACTIVE` loan ends the request (`RETURNED`) | FR-21: "The request stays `CHECKED_OUT` until every unit is returned" |
| F08-D3 | `condition` is optional and defaults to `GOOD` | FR-20: "a condition per unit that defaults to good" |
| F08-D4 | Both endpoints return `200` with the request in the Custodian detail shape (F-06 F06-D4, with history) | The detail page refreshes from one response |
| F08-D5 | Messages: `409 INVALID_STATE` "Request #12 cannot be returned because it is RETURNED, not CHECKED_OUT." / "Loan 31 cannot be returned because it is RETURNED, not ACTIVE."; `404` "Loan 999 does not exist." | Same style as F-03 and F-06 |
| F08-D6 | A loan returned after `dueAt` is returned normally; F-08 stores `returnedAt` only | Overdue handling is F-11 (Sprint 3) |

## 4. UI specification

| Element | Behaviour |
| --- | --- |
| Return all button | On a `CHECKED_OUT` request detail, Custodian only |
| Return all dialog | Title "Return Request #12"; one row per `ACTIVE` loan: asset tag, item type, condition radio "Good" (selected) / "Damaged". Confirm "Return 3 units". Success "Request #12 returned: 2 good, 1 damaged (KH-ARD-0002 sent to maintenance)." |
| Return this unit | Per `ACTIVE` loan row; small dialog with the condition; confirm "Return KH-ARD-0001". Success "KH-ARD-0001 returned." and, when it was the last, "Request #12 returned." |
| Errors | `409` and `404`: API message as an alert, the detail is fetched again; `400` alert; `401`, `403` shared behaviour |
| Submitting | Button disabled with a spinner; a double click sends one call |
| Loan rows | Show "Returned 20 Nov 2026, 10:00 · Good/Damaged" for returned loans |

Planned files: `client/src/pages/requests/ReturnDialog.tsx`, `client/src/api/returns.ts`, changes to `client/src/pages/RequestDetailPage.tsx`.

## 5. API specification

### 5.1 `POST /api/requests/:id/return`

| Aspect | Specification |
| --- | --- |
| Who | Custodian only |
| Body | `{ "loans": [ { "loanId": 31, "condition": "GOOD" }, { "loanId": 32, "condition": "DAMAGED" } ] }` |
| Success | `200` with the request: `status` `RETURNED`; every loan `RETURNED` with `returnedAt`, `returnCondition` |
| Errors | `400`, `404`, `409 INVALID_STATE` |

### 5.2 `POST /api/loans/:id/return`

| Aspect | Specification |
| --- | --- |
| Who | Custodian only |
| Body | `{ "condition": "GOOD" }` or `{}` (default `GOOD`) |
| Success | `200` with the request that owns the loan; `status` `RETURNED` only if it was the last `ACTIVE` loan |
| Errors | `400`, `404 NOT_FOUND` (loan), `409 INVALID_STATE` |

### 5.3 Loan representation

Loans in requests and in `GET /api/loans` gain `returnedAt` and `returnCondition` (`null` while `ACTIVE`); the Custodian view also gains `returnedBy { id, username, displayName }`.

## 6. Data specification

No migration. Writes `loans.status`, `returnedAt`, `returnedById`, `returnCondition`; `units.status`; `borrow_requests.status`; history entries (3.6).

## 7. Acceptance criteria

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-102 | Return all with every loan `GOOD`: every loan `RETURNED` with `returnedAt` and `returnedBy` the Custodian, every unit `AVAILABLE`, the request `RETURNED`, and the item types' available counts rise by the returned units | FR-20, BR-11 |
| AC-103 | A loan returned `DAMAGED` sends its unit to `MAINTENANCE`, and that unit is not counted as available and cannot be checked out | BR-11, FR-20, FR-21 |
| AC-104 | A condition left out is `GOOD` | FR-20 |
| AC-105 | An early return of one loan returns that loan and unit only; the request stays `CHECKED_OUT` while another loan is `ACTIVE`, and becomes `RETURNED` with the last one | FR-21 |
| AC-106 | Return all that leaves out an active loan, lists a loan twice or names a loan of another request, and any unknown field or condition, is rejected with `400` naming the problem, and nothing changes | FR-20 |
| AC-107 | Returning a request that is not `CHECKED_OUT`, an early return of a loan that is not `ACTIVE`, or a return-all that names a loan of this request which is no longer `ACTIVE`, gives `409 INVALID_STATE` naming the state; an unknown request or loan gives `404`; nothing changes | FR-20, FR-21 |
| AC-108 | Concurrent returns of the same loans return each loan once; exactly one call moves the request to `RETURNED`; every call writes history only for what it changed | NFR-05, BR-16, NFR-09 |
| AC-109 | A Borrower calling either return endpoint gets `403`, a call without a session `401`, nothing changes; the Return all and Return this unit controls appear only for Custodians on `CHECKED_OUT` requests and `ACTIVE` loans, and the dialogs default every condition to Good | NFR-01, NFR-02, BR-17, NFR-12 |

## 8. Software Test Specification (STS)

Conventions as F-07 8 (factories create `CHECKED_OUT` requests with `ACTIVE` loans; "Unchanged" snapshot of loans, units, requests and history count; RED fails on assertions).

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-102 **TDD** | AC-102 | API | `CHECKED_OUT` request R with loans L1 (A1), L2 (A2), L3 (S1); Arduino available count 2 before | Return all with L1, L2, L3 `GOOD` | `200`; R `RETURNED`; each loan `RETURNED`, `returnedAt` set, `returnedBy` C, `returnCondition` `GOOD`; A1, A2, S1 `AVAILABLE`; Arduino count 4 | `server/tests/api/returns.test.ts` |
| TEST-103 **TDD** | AC-103 | API | As TEST-102 | Return all with L2 `DAMAGED`; then an `APPROVED` request for Arduino tries to check out A2 | A2 `MAINTENANCE`, Arduino count rises by 1 only; the checkout gives `409 UNIT_NOT_AVAILABLE` | `server/tests/api/returns.test.ts` |
| TEST-104 **TDD** | AC-104 | API | `CHECKED_OUT` request with one loan L | (a) Return all with `{ loanId: L }`; (b) another request, `POST /api/loans/:id/return` with `{}` | Both loans `returnCondition` `GOOD`, units `AVAILABLE` | `server/tests/api/returns.test.ts` |
| TEST-105 **TDD** | AC-105 | API | R with L1, L2 | (a) early return L1; (b) early return L2 `DAMAGED` | (a) `200`, L1 `RETURNED`, A1 `AVAILABLE`, R `CHECKED_OUT`, L2 `ACTIVE`; (b) L2 `RETURNED`, unit `MAINTENANCE`, R `RETURNED` | `server/tests/api/returns.test.ts` |
| TEST-106 **TDD** | AC-106 | API | R with L1, L2; R2 with L9 | Return all R with (a) only L1; (b) L1, L1, L2; (c) L1, L2, L9; (d) L1, L2 with `condition: "LOST"`; (e) an extra field | Each `400` naming the problem; Unchanged | `server/tests/api/returns.test.ts` |
| TEST-107 **TDD** | AC-107 | API | Requests `APPROVED`, `RETURNED`; a `RETURNED` loan; `CHECKED_OUT` request R with L1 already returned early and L2 `ACTIVE`; no request or loan 999 999 | (a) Return all on each request; early return of the returned loan; both on 999 999; (b) return all on R naming L1 and L2 | (a) `409 INVALID_STATE` naming the state, or `404`; (b) `409 INVALID_STATE` "Loan L1 cannot be returned because it is RETURNED, not ACTIVE.", L2 still `ACTIVE`; Unchanged after each | `server/tests/api/returns.test.ts` |
| TEST-108 **TDD** | AC-108 | Integration | R with L1, L2; Custodians C1, C2 | (a) `Promise.all` of two return-all calls; (b) early returns of L1 and L2 at once; (c) a return-all naming L1 and L2 and an early return of L1 at once; 5 rounds each | (a) one `200`, one `409`; each loan returned once; one request entry. (b) both `200`; R `RETURNED`; exactly one request history entry `CHECKED_OUT` → `RETURNED`. (c) one `200`, one `409 INVALID_STATE` (never `400`); if the early return won, R stays `CHECKED_OUT` with L2 `ACTIVE`; if the return-all won, R `RETURNED`; each loan returned once | `server/tests/api/returns-concurrency.test.ts` |
| TEST-109 | AC-109 | API + UI | R `CHECKED_OUT` of Borrower B | API: as B both endpoints; no cookie. UI (`vi.mock`): detail as Custodian and as B; open Return all | API: `403`, `401`, Unchanged. UI: buttons only for the Custodian; every condition "Good" by default; confirm "Return 2 units"; return mock called once with both loans | `server/tests/api/returns-access.test.ts`, `client/tests/ReturnDialog.test.tsx` |

## 9. Definition of Done (F-08)

| # | Item | Evidence |
| --- | --- | --- |
| 1 | AC-102 to AC-109 implemented | PR lists each AC with its commit or file |
| 2 | TEST-102 to TEST-109 pass; Sprint 1 and F-07 suites still pass | `npm test` output with counts and the commit |
| 3 | TDD tests failed on assertions first | Test-only commit SHA with failing output |
| 4 | Teammate review with a specific comment; CI green | GitHub |
| 5 | `features.md` and `traceability.md` updated | Diff |

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-102 | FR-20, BR-11 | TEST-102 | `server/tests/api/returns.test.ts` |
| AC-103 | BR-11, FR-20, FR-21 | TEST-103 | `server/tests/api/returns.test.ts` |
| AC-104 | FR-20 | TEST-104 | `server/tests/api/returns.test.ts` |
| AC-105 | FR-21 | TEST-105 | `server/tests/api/returns.test.ts` |
| AC-106 | FR-20 | TEST-106 | `server/tests/api/returns.test.ts` |
| AC-107 | FR-20, FR-21 | TEST-107 | `server/tests/api/returns.test.ts` |
| AC-108 | NFR-05, BR-16, NFR-09 | TEST-108 | `server/tests/api/returns-concurrency.test.ts` |
| AC-109 | NFR-01, NFR-02, BR-17, NFR-12 | TEST-109 | `server/tests/api/returns-access.test.ts`, `client/tests/ReturnDialog.test.tsx` |
