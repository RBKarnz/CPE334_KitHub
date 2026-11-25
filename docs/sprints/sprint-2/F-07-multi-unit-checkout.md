# F-07 Multi-unit checkout and loan lists: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-07 Multi-unit checkout and loan lists |
| Sprint | 2 (due 2026-11-29) |
| Version | 1.0 |
| Status | Proposed (PR for #77); implementation starts only after this contract is reviewed and merged |
| Date | 2026-11-25 |
| Authors | Teerakarn Noiruksa (67070501062); reviewer Methipat Mansap (67070501071) |
| Baseline | SRS v1.3 (v1.4 after #71), System-Level SDS v1.8 (Sprint 2 columns from #73), F-03 contract v1.2 (v1.3 after #71), F-06 contract v1.0 (#76) |
| Issues | #77 this feature; #73 Sprint 2 columns; #71 due-date rule D-21; #74 F-04 creates multi-line requests with `loanDays`; #76 F-06 approves them |
| Definition of Done | [Product Definition of Done](../sprint-1/definition-of-done.md) and section 9 |
| AC/TEST block | 90 to 101 (claimed in #77) |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-25 | Teerakarn Noiruksa | First contract: AC-90 to AC-101, TEST-90 to TEST-101, decisions F07-D1 to F07-D8. Replaces the Sprint 1 checkout rule FR-16 by FR-17 |

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What F-07 does with it |
| --- | --- | --- |
| Functional | FR-17, FR-18, FR-19 | Check out an `APPROVED` request with one unit per quantity on each line; Borrower sees own active loans; Custodian sees all active loans |
| Functional (replaced) | FR-16 | The Sprint 1 checkout of a `PENDING` request is removed (SRS FR-16: "Replaced by FR-17 from Sprint 2") |
| Business rules | BR-02, BR-03, BR-06, BR-08, BR-12, BR-16 | Only `AVAILABLE` units of the line's item type; one `ACTIVE` loan per unit; the Custodian, not the Borrower, picks units; due date from the request's loan length; a retired unit cannot be checked out; history for every change |
| SRS decisions | D-16, D-17, D-21 | Loan length; no available unit means no checkout; due time 17:00 ICT on a business day |
| Non-functional | NFR-01, NFR-02, NFR-05, NFR-09, NFR-12 | Session and role checks; concurrent checkouts; history; list states |

### 2.2 Depends on

| Dependency | What F-07 uses | Status on 2026-11-25 |
| --- | --- | --- |
| F-03 (#16, #19) | Checkout endpoint, dialog, conditional updates, `loans_one_active_per_unit`, history pattern (3.10), `toLoanInsertConflict` | Done |
| #71 | `computeDueAt(checkedOutAt, days)` with the D-21 rule | Specified (PR #72) |
| #73 | `borrow_requests.loanDays` | PR #80 |
| F-04 (#74) | Requests with several lines, quantities and `loanDays` | Contract pending |
| F-06 (#76) | `APPROVED` requests | Contract PR #81 |

### 2.3 Out of scope

| Not in F-07 | Arrives in |
| --- | --- |
| Returns, unit condition (FR-20, FR-21) | F-08 (#78) |
| Reserved units of approved requests and expiry (BR-13, FR-15) | Sprint 3, F-10 |
| Overdue marking and overdue list (FR-22) | Sprint 3, F-11 |
| Partial checkout (some lines now, others later) | Not planned: a request is checked out as a whole (D-06, D-13) |

## 3. Feature-level design (Feature SDS)

### 3.1 Behaviour and workflow

1. The Custodian opens **Ready for checkout** (`/pending`, renamed, F07-D6). The UI calls `GET /api/requests?status=APPROVED` and lists approved requests oldest first.
2. **Check out** opens the dialog. For each line the UI calls `GET /api/item-types/:id/units?status=AVAILABLE` and shows the due date preview from `GET /api/item-types/:id/due-date-preview` (#71), now with the request's loan length (F07-D3).
3. For each line the Custodian picks exactly `quantity` units. The confirm button is enabled only when every line has its quantity of distinct units.
4. The UI calls `POST /api/requests/:id/checkout` with `{ "units": [ { "lineId", "unitId" }, ... ] }`, one entry per unit.
5. The server runs `authenticate`, `requireRole("CUSTODIAN")`, the strict body schema, then one transaction:
   1. Reads the request with its lines and every named unit (`404` for a missing request or unit).
   2. Checks that every `lineId` is a line of the request, that each line receives exactly its `quantity` of entries and that no unit appears twice (`400`).
   3. Moves the request `APPROVED` → `CHECKED_OUT` with a conditional update (`409 INVALID_STATE`).
   4. For each unit, in ascending unit ID order: conditional update `AVAILABLE` → `ON_LOAN` with the line's item type (`409 UNIT_WRONG_ITEM_TYPE` or `UNIT_NOT_AVAILABLE`), then inserts the `ACTIVE` loan.
   5. Writes the history entries (3.6) and commits.
6. The server returns `201` with the request, now `CHECKED_OUT`, and all its loans, which share one `dueAt`.
7. Any failure rolls back every write: the request stays `APPROVED`, every unit keeps its state, no loan and no history entry exist.
8. Borrowers see their active loans on **My loans** (`/loans`); Custodians see all active loans on **Loans** (`/loans`).

### 3.2 State changes

| Entity | From | To | SRS row |
| --- | --- | --- | --- |
| Request | `APPROVED` | `CHECKED_OUT` | 8.2, Sprint 2 |
| Unit (each) | `AVAILABLE` | `ON_LOAN` | 8.1 |
| Loan (each) | (new) | `ACTIVE` | 8.3 |

The Sprint 1 row `PENDING` → `CHECKED_OUT` is removed from the transition table; a checkout of a `PENDING` request now gives `409 INVALID_STATE`.

### 3.3 Business rules and where they are enforced

| Rule | UI (hint only) | Route and middleware | Service (in the transaction) | Domain | Database |
| --- | --- | --- | --- | --- | --- |
| Custodian only (BR-17, NFR-02) | Pages and buttons for Custodians only | `requireRole("CUSTODIAN")` | - | - | - |
| Only `APPROVED` (SRS 8.2, FR-17) | Only approved requests listed | - | Conditional update `WHERE status = 'APPROVED'` → `409 INVALID_STATE` | `assertTransition("REQUEST", "APPROVED", "CHECKED_OUT")` | - |
| One unit per quantity per line (FR-17, BR-06) | Confirm disabled until each line is complete | Strict schema: 1 to 20 entries | Count per `lineId` equals `quantity`; every line present; no duplicate `unitId` → `400` | - | - |
| Unit `AVAILABLE` and of the line's item type (BR-02, BR-12) | Only `AVAILABLE` units of the line's item type listed | - | Conditional unit update per unit | `assertTransition("UNIT", "AVAILABLE", "ON_LOAN")` | FK |
| One `ACTIVE` loan per unit (BR-03, NFR-05) | Submit disabled while running | - | Conditional updates; units locked in ascending ID order | - | `loans_one_active_per_unit` |
| Due date (BR-08, D-16, D-21) | Preview before confirming | - | One `dueAt = computeDueAt(now, loanDays)` for every loan of the request (F07-D3) | `computeDueAt` | `loans.dueAt` not null |
| History (BR-16) | - | - | Entries in the same transaction (3.6) | - | Append-only trigger |
| Borrower sees only own loans (BR-05) | - | `GET /api/loans` scope by role | `WHERE requests.borrowerId = req.user.id` for Borrowers | - | - |

### 3.4 Validation

| Input | Rule | Error |
| --- | --- | --- |
| Checkout path `id` | Integer ≥ 1 | `400` naming `id` |
| Checkout body | Strict `{ units }`; `units` 1 to 20 strict entries `{ lineId: int ≥ 1, unitId: int ≥ 1 }` (20 = 6 item types × the largest maximum quantity 4, rounded up) | `400` naming the field |
| Lines (service) | Every `lineId` is a line of this request; each line gets exactly `quantity` entries; every line of the request appears | `400` naming `units[i].lineId` ("Not a line of request #12") or `units` ("Line 5 needs 2 units, got 1") |
| Units (service) | No `unitId` twice | `400` naming `units[i].unitId` ("Unit 7 is listed twice") |
| `GET /api/loans` query | Strict `{ status? }`, `status` one of `ACTIVE`, `RETURNED`; default `ACTIVE` | `400` naming the parameter |

### 3.5 Check order

`401` → `403` → `415` → `400` (shape) → `404` (request, then each unit in body order) → `400` (lines and duplicates) → `409 INVALID_STATE` (request not `APPROVED`) → per unit in ascending ID: `409 UNIT_WRONG_ITEM_TYPE`, `409 UNIT_NOT_AVAILABLE`. As in F-03 3.7, messages that name a current state come from a re-read inside the transaction.

### 3.6 History entries

All with `occurredAt` = `now` (one timestamp for the transaction), `actorType` `USER`, `actorUserId` the Custodian, `details` null.

| Entry | `entityType` | `action` | From → to | References |
| --- | --- | --- | --- | --- |
| One for the request | `REQUEST` | `STATUS_CHANGED` | `APPROVED` → `CHECKED_OUT` | `requestId` |
| One per unit | `UNIT` | `STATUS_CHANGED` | `AVAILABLE` → `ON_LOAN` | `requestId`, `unitId` |
| One per loan | `LOAN` | `CREATED` | null → `ACTIVE` | `requestId`, `unitId`, `loanId` |

A request with 3 units writes 1 + 3 + 3 = 7 entries.

### 3.7 Concurrency

- Two checkouts that share a unit (two requests): the unit's conditional update lets one win; the other gets `409 UNIT_NOT_AVAILABLE` and its whole transaction, including units it already moved, rolls back.
- Two checkouts of the same request: the request's conditional update lets one win; the other gets `409 INVALID_STATE`.
- Units are updated in ascending ID order in every checkout, so two checkouts that share two units cannot deadlock each other.

### 3.8 Decisions made in this contract

| ID | Decision | Reason |
| --- | --- | --- |
| F07-D1 | Checkout requires `APPROVED`; the Sprint 1 `PENDING` path is removed in the same PR | FR-16 says it is replaced by FR-17 from Sprint 2; keeping both would skip BR-09 |
| F07-D2 | All-or-nothing: one transaction for every unit of the request | D-06 and D-13: one due date and one state per request |
| F07-D3 | `dueAt = computeDueAt(now, loanDays)`. When `loanDays` is null (a request created in Sprint 1 and approved in Sprint 2), the loan length is the smallest `maxLoanDays` among the request's item types, as D-16 did for one line | Every loan of the request shares one due date (SDS 4.5); old requests still get a valid due date |
| F07-D4 | The preview endpoint (#71, F-03 5.5) gains an optional query `days` (integer 1 to 365); without it the item type's `maxLoanDays` is used. The dialog sends the request's loan length (F07-D3) | One preview function for both releases; the dialog shows the real due date |
| F07-D5 | `GET /api/loans` returns `{ items: [ loan ] }`; a loan item has `id`, `status`, `checkedOutAt`, `dueAt`, `returnedAt`, `unit { id, assetTag }`, `itemType { id, name }`, `request { id }`; the Custodian view adds `borrower { id, username, displayName }`. Order: `dueAt` ascending, then `id` | The earliest due loans first, which is what both roles look for |
| F07-D6 | The Custodian page `/pending` is renamed "Ready for checkout" and lists `APPROVED` requests; `PENDING` requests are decided from All requests (F-06) | The Sprint 1 page existed to check out pending requests; that step now needs approval first |
| F07-D7 | The navigation bar adds "My loans" (Borrower) and "Loans" (Custodian), both `/loans` | One route, scope by role, as `/requests` for F-02 |
| F07-D8 | Sprint 1 tests that check out a `PENDING` request change their precondition to `APPROVED` (TEST-19 to TEST-26, TEST-41 to TEST-47, TEST-49, TEST-52, TEST-54, TEST-58, and E2E TEST-30, TEST-32, TEST-53 through an approve step); their assertions on rules stay. TEST-43 now checks an `APPROVED` → `CHECKED_OUT` request checked out again | The requirement changed (FR-16 → FR-17); the rules those tests protect did not |

## 4. UI specification

| Screen | Change |
| --- | --- |
| Ready for checkout `/pending` (Custodian) | Title "Ready for checkout"; lists `APPROVED` requests oldest first with Borrower, items (`Arduino Uno R3 × 2, HC-SR04 ultrasonic sensor × 1`), loan length and approval time; "Check out" per row. States: "Loading…", "No approved requests.", error with "Try again" |
| Checkout dialog | One section per line: "Arduino Uno R3 — choose 2 of 4 available" with checkboxes of asset tags; a line with fewer `AVAILABLE` units than its quantity says "Only 1 of 2 available. The request cannot be checked out yet." and the confirm button stays disabled. Preview "Due if checked out now: Mon 7 Dec 2026, 17:00". Confirm "Check out 3 units for Request #12". Success "Request #12 checked out: KH-ARD-0001, KH-ARD-0002, KH-SR04-0003, due 7 Dec 2026, 17:00". Errors as F-03 4.3 |
| My loans `/loans` (Borrower) | Table: item type, asset tag, request `#`, checked out, due; states as above ("You have no active loans.") |
| Loans `/loans` (Custodian) | Same plus Borrower; filter Active / Returned |
| Request detail | Lists every loan under its line (already in F-03 4.4) |

Planned files: `client/src/pages/pending/PendingRequestsPage.tsx`, `client/src/pages/pending/CheckoutDialog.tsx`, `client/src/pages/loans/LoansPage.tsx`, `client/src/api/loans.ts`.

## 5. API specification

### 5.1 `POST /api/requests/:id/checkout` (changed)

| Aspect | Specification |
| --- | --- |
| Who | Custodian only |
| Body | `{ "units": [ { "lineId", "unitId" }, ... ] }`, 1 to 20 entries |
| Success | `201` with the request (`CHECKED_OUT`) in the Custodian detail shape; every line's `loans` holds its new loans; all loans and the top-level `dueAt` share one value |
| Errors | `400`, `404`, `409 INVALID_STATE`, `409 UNIT_WRONG_ITEM_TYPE`, `409 UNIT_NOT_AVAILABLE` (as 3.5) |

Example: request 12 approved with 7 days, line 5 Arduino Uno R3 × 2, line 6 HC-SR04 × 1, at Mon 30 Nov 2026 10:00 ICT:

```json
{ "units": [ { "lineId": 5, "unitId": 1 }, { "lineId": 5, "unitId": 2 }, { "lineId": 6, "unitId": 23 } ] }
```

Response `201`: `status` `CHECKED_OUT`, `dueAt` `2026-12-07T10:00:00.000Z` (Mon 7 Dec 17:00 ICT, D-21), three loans `ACTIVE`.

### 5.2 `GET /api/loans` (new)

| Aspect | Specification |
| --- | --- |
| Who | Borrower: own loans. Custodian: every loan. No session: `401` |
| Query | `status` (`ACTIVE` default, or `RETURNED`) |
| Success | `200 { "items": [ loan ] }` (F07-D5) |

```json
{ "items": [ { "id": 31, "status": "ACTIVE", "checkedOutAt": "2026-11-30T03:00:00.000Z", "dueAt": "2026-12-07T10:00:00.000Z", "returnedAt": null,
  "unit": { "id": 1, "assetTag": "KH-ARD-0001" }, "itemType": { "id": 3, "name": "Arduino Uno R3" }, "request": { "id": 12 },
  "borrower": { "id": 3, "username": "borrower1", "displayName": "Borrower One" } } ] }
```

The Borrower view has no `borrower` key.

### 5.3 `GET /api/item-types/:id/due-date-preview` (changed by F07-D4)

Optional query `days` (integer 1 to 365). Otherwise as F-03 5.5.

## 6. Data specification

No migration. Uses `borrow_requests.loanDays` (#73). Writes: `borrow_requests.status`; `units.status` for each unit; one `loans` row per unit; history entries (3.6).

## 7. Acceptance criteria

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-90 | A Custodian checks out an `APPROVED` request with one `AVAILABLE` unit per quantity on each line: one `ACTIVE` loan per unit, every unit `ON_LOAN`, the request `CHECKED_OUT`, and every loan and the request share one `dueAt` | FR-17, BR-02, BR-06 |
| AC-91 | The shared `dueAt` is `computeDueAt(checkout time, loanDays)` (D-21); for a request without `loanDays` it uses the smallest `maxLoanDays` among its item types | FR-17, BR-08, D-16, D-21 |
| AC-92 | Checkout of a request that is not `APPROVED` (`PENDING`, `REJECTED`, `CANCELLED`, `CHECKED_OUT`) is rejected with `409 INVALID_STATE` and nothing changes | FR-17, SRS 8.2 |
| AC-93 | A body whose entries do not give every line exactly its quantity, or names a line of another request, is rejected with `400 VALIDATION_FAILED` naming the problem, and nothing changes | FR-17, BR-06 |
| AC-94 | A body that names the same unit twice, or has more than 20 entries or an unknown field, is rejected with `400 VALIDATION_FAILED`, and nothing changes | FR-17 |
| AC-95 | If any named unit is not `AVAILABLE` (`ON_LOAN`, `MAINTENANCE`, `RETIRED`) or belongs to another item type, the whole checkout is rejected with `409` and no unit, loan, request or history row changes, even for the units that were valid | BR-02, BR-12 |
| AC-96 | Two simultaneous checkouts that share a unit produce exactly one success; the other request stays `APPROVED` and none of its units changes; no deadlock with two shared units | BR-03, NFR-05 |
| AC-97 | A checkout of n units writes one request entry, n unit entries and n loan entries with the Custodian and one timestamp | BR-16, NFR-09 |
| AC-98 | A Borrower's loan list holds only their own loans with item type, asset tag, request, checkout time and due date, earliest due first, and no `borrower` key | FR-18, BR-05 |
| AC-99 | A Custodian's loan list holds every Borrower's loans with the Borrower; `status=RETURNED` lists returned loans; an unknown `status` gives `400` | FR-19 |
| AC-100 | A Borrower calling checkout gets `403`; checkout and the loan list without a session give `401`; the body has only `error` and nothing changes | NFR-01, NFR-02, BR-17 |
| AC-101 | The checkout dialog lists the `AVAILABLE` units per line, enables confirm only when every line has its quantity of distinct units, shows the preview due date for the request's loan length, and shows all asset tags and the due date on success; the loans pages show their rows and a loading, an empty and an error state | FR-17, FR-18, FR-19, NFR-12 |

## 8. Software Test Specification (STS)

Conventions as F-03 8.1 and F-06 8.1 (factories, "Unchanged" snapshot, fake `Date` with `vi.useFakeTimers({ toFake: ["Date"] })`, RED fails on assertions). Requests are created `APPROVED` with `loanDays` by the factories.

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-90 **TDD** | AC-90 | API | `APPROVED` request R of Borrower B, `loanDays` 7, line L1 Arduino × 2, line L2 HC-SR04 × 1; units A1, A2, S1 `AVAILABLE`. Time fixed at `2026-11-30T03:00:00.000Z` | Checkout R with (L1, A1), (L1, A2), (L2, S1) | `201`; R `CHECKED_OUT`; 3 `ACTIVE` loans, each with its unit, `checkedOutBy` C; A1, A2, S1 `ON_LOAN`; every loan and the top-level `dueAt` `2026-12-07T10:00:00.000Z` | `server/tests/api/checkout-multi.test.ts` |
| TEST-91 **TDD** | AC-91 | Unit + API | (a) as TEST-90 with `loanDays` 3; (b) `APPROVED` request with `loanDays` null, lines Arduino (14) and Digital multimeter (3), time Mon 30 Nov 10:00 ICT | Checkout | (a) `dueAt` `2026-12-03T10:00:00.000Z`; (b) uses 3 days: `2026-12-03T10:00:00.000Z` | `server/tests/api/checkout-multi.test.ts` |
| TEST-92 **TDD** | AC-92 | API | Requests in `PENDING`, `REJECTED`, `CANCELLED`, `CHECKED_OUT`, each with an `AVAILABLE` unit of its item type | Checkout each | Each `409 INVALID_STATE` naming the state; Unchanged | `server/tests/api/checkout-multi.test.ts` |
| TEST-93 **TDD** | AC-93 | API | R as TEST-90 | (a) only (L1, A1), (L2, S1); (b) (L1, A1), (L1, A2) without L2; (c) a `lineId` of another request; (d) three entries for L1 | Each `400`; (a) and (d) "Line L1 needs 2 units, got 1/3"; (b) names `units` ("Line L2 needs 1 unit, got 0"); (c) names `units[i].lineId`; Unchanged | `server/tests/api/checkout-multi.test.ts` |
| TEST-94 **TDD** | AC-94 | API | R as TEST-90 | (a) (L1, A1), (L1, A1), (L2, S1); (b) 21 entries; (c) an entry with `borrowerId` | Each `400`; (a) "Unit A1 is listed twice"; Unchanged | `server/tests/api/checkout-multi.test.ts` |
| TEST-95 **TDD** | AC-95 | API | R as TEST-90 with S1 replaced by: (a) S1 `ON_LOAN`; (b) `MAINTENANCE`; (c) `RETIRED`; (d) a unit of another item type | Checkout with A1, A2 and the bad unit | (a) to (c) `409 UNIT_NOT_AVAILABLE`, (d) `409 UNIT_WRONG_ITEM_TYPE`; A1 and A2 still `AVAILABLE`; R `APPROVED`; no loan; history count unchanged | `server/tests/api/checkout-multi.test.ts` |
| TEST-96 **TDD** | AC-96 | Integration | Two `APPROVED` requests R1 and R2 that both name units U1 and U2 (in opposite body order); two Custodians | `Promise.all` of both checkouts, 5 rounds | Each round: one `201`, one `409 UNIT_NOT_AVAILABLE`; the loser `APPROVED` with no loan; U1 and U2 `ON_LOAN` with exactly one `ACTIVE` loan each; both calls finish within the test timeout (no deadlock) | `server/tests/api/checkout-multi-concurrency.test.ts` |
| TEST-97 | AC-97 | Integration | As TEST-90 | Checkout | Exactly 7 new history entries: 1 request (`APPROVED` → `CHECKED_OUT`), 3 unit, 3 loan; all actor C, one `occurredAt` equal to `checkedOutAt` | `server/tests/api/checkout-multi.test.ts` |
| TEST-98 **TDD** | AC-98 | API | Borrower B with 2 active loans (due 3 Dec, 7 Dec) and 1 returned; Borrower B2 with 1 active loan | As B `GET /api/loans` | `200`, exactly B's 2 active loans, 3 Dec first; each item has the F07-D5 fields and no `borrower` | `server/tests/api/loans.test.ts` |
| TEST-99 **TDD** | AC-99 | API | As TEST-98 | As C: (a) `GET /api/loans`; (b) `?status=RETURNED`; (c) `?status=LOST`; (d) `?x=1` | (a) all 3 active loans with `borrower`; (b) B's returned loan; (c), (d) `400` naming the parameter | `server/tests/api/loans.test.ts` |
| TEST-100 | AC-100 | API | R as TEST-90 | (a) as Borrower B checkout R; (b) no cookie: checkout and `GET /api/loans` | (a) `403`; (b) `401`; only `error`; Unchanged | `server/tests/api/checkout-multi.test.ts` |
| TEST-101 **TDD** | AC-101 | UI | `CheckoutDialog` and `LoansPage` with API modules mocked by `vi.mock` factories | (a) R with L1 × 2 (4 units listed) and L2 × 1; pick one Arduino; then the second, then one sensor; (b) L2 with 0 available; (c) confirm; (d) `LoansPage` loading, empty, error, rows | (a) confirm disabled until 2 + 1 picked; label "Check out 3 units for Request #12"; preview called with `days` 7; (b) "Only 0 of 1 available …", confirm disabled; (c) checkout mock called once with the three entries; success text lists the asset tags and "due 7 Dec 2026, 17:00"; (d) "Loading…", "You have no active loans.", error and "Try again", rows | `client/tests/CheckoutDialog.test.tsx`, `client/tests/LoansPage.test.tsx` |

Regression: the Sprint 1 checkout and E2E tests listed in F07-D8 are updated to approve first and must pass; no rule assertion is removed.

## 9. Definition of Done (F-07)

| # | Item | Evidence |
| --- | --- | --- |
| 1 | AC-90 to AC-101 implemented | PR lists each AC with its commit or file |
| 2 | TEST-90 to TEST-101 pass | `npm test` in `server/` and `client/`, `npm run test:e2e`, with counts and the commit |
| 3 | TDD tests failed on assertions first | Test-only commit SHA with failing output |
| 4 | F07-D8 test changes listed with the reason; nothing skipped or weakened | PR section |
| 5 | Teammate review with a specific comment; CI green | GitHub |
| 6 | `features.md`, `traceability.md` and the F-03 contract (FR-16 replaced) updated | Diff |

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-90 | FR-17, BR-02, BR-06 | TEST-90 | `server/tests/api/checkout-multi.test.ts` |
| AC-91 | FR-17, BR-08, D-16, D-21 | TEST-91 | `server/tests/api/checkout-multi.test.ts` |
| AC-92 | FR-17 | TEST-92 | `server/tests/api/checkout-multi.test.ts` |
| AC-93 | FR-17, BR-06 | TEST-93 | `server/tests/api/checkout-multi.test.ts` |
| AC-94 | FR-17 | TEST-94 | `server/tests/api/checkout-multi.test.ts` |
| AC-95 | BR-02, BR-12 | TEST-95 | `server/tests/api/checkout-multi.test.ts` |
| AC-96 | BR-03, NFR-05 | TEST-96 | `server/tests/api/checkout-multi-concurrency.test.ts` |
| AC-97 | BR-16, NFR-09 | TEST-97 | `server/tests/api/checkout-multi.test.ts` |
| AC-98 | FR-18, BR-05 | TEST-98 | `server/tests/api/loans.test.ts` |
| AC-99 | FR-19 | TEST-99 | `server/tests/api/loans.test.ts` |
| AC-100 | NFR-01, NFR-02, BR-17 | TEST-100 | `server/tests/api/checkout-multi.test.ts` |
| AC-101 | FR-17, FR-18, FR-19, NFR-12 | TEST-101 | `client/tests/CheckoutDialog.test.tsx`, `client/tests/LoansPage.test.tsx` |
