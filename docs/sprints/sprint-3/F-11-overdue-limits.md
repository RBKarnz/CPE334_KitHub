# F-11 Overdue status and borrowing limits: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-11 Overdue status and borrowing limits |
| Sprint | 3 (due 2026-12-13); implemented first, for the Deliverable 2 candidate (`plan.md` 6.3) |
| Version | 1.0 |
| Status | Proposed (PR for #108); implementation starts only after this contract is reviewed and merged |
| Date | 2026-11-27 |
| Authors | Methipat Mansap (67070501071); reviewer Teerakarn Noiruksa (67070501062) |
| Baseline | SRS v1.6 (#106), System-Level SDS v1.13, F-04 contract v1.0, F-05 contract v1.0, F-07 contract v1.0, F-08 contract v1.1 |
| Issues | #108 this feature; #74 F-04 and #75 F-05 (the create and edit checks this feature extends); #78 F-08 (returns end an overdue state) |
| Definition of Done | [Product Definition of Done](../sprint-1/definition-of-done.md) and section 9 of this contract |
| AC/TEST block | 132 to 141 (claimed in #108) |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-27 | Methipat Mansap | First contract: AC-132 to AC-141, TEST-132 to TEST-141, decisions F11-D1 to F11-D8 |

Changes after approval get a new version row with the reason. AC and TEST IDs are never reused for a different meaning.

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What F-11 does with it |
| --- | --- | --- |
| Functional | FR-22 | Shows a request as overdue to its Borrower and to Custodians; Custodians get a list of every overdue request with the units not yet returned |
| Functional (rules added from Sprint 3) | FR-07, FR-10, FR-11 | Request create (F-04) and edit (F-05) also check BR-14 and BR-15 |
| Business rules | BR-14, BR-15 | 5-unit limit per Borrower; an overdue Borrower cannot request |
| Business rules (kept) | BR-01, BR-04, BR-05, BR-07, BR-08, BR-10, BR-16, BR-17 | Unchanged; BR-14 and BR-15 join their check order (3.5) |
| Non-functional | NFR-01, NFR-02 | The overdue list rejects no session (`401`); a Borrower sees only their own overdue requests |
| SRS decisions | D-14, D-20, D-21 | D-14 blocks overdue Borrowers until the request is fully returned; D-20 says what counts toward the limit; D-21 sets every `dueAt` |
| SDS | 4.5 "Overdue request" and "Units held by a Borrower", DD-05 (Borrower row lock), DD-08 (derived, not stored), 6.5 codes `BORROW_LIMIT` and `OVERDUE_BLOCK`, 6.6 `GET /api/requests?overdue=true` | Used as written |

### 2.2 Depends on

| Feature | What F-11 needs | Status |
| --- | --- | --- |
| F-04 (#74) | `assertRequestRules` for create, with the rule order BR-04 → BR-07 → BR-08 → BR-01 (F04-D3) | On `main` (`v0.2.0`) |
| F-05 (#75) | Edit runs `assertRequestRules` excluding the request itself (F05-D3) | On `main` |
| F-07 (#77) | `ACTIVE` loans with `dueAt` (D-21) | On `main` |
| F-08 (#78) | Returns set loans to `RETURNED` and the request to `RETURNED` when all are back | On `main` |

### 2.3 Out of scope for F-11

| Item | Where |
| --- | --- |
| Reservations and expiry (`EXPIRED`, BR-13) | F-10 (#107). F-11 counts `PENDING` and `APPROVED` requests as D-20 says, whatever F-10 later does with them |
| Overdue counts in the inventory report | F-14 (#111) reads the same definition (F11-D1) |
| Fines, reminders, e-mail | Not in the SRS |
| A stored "overdue" state | Never: overdue is derived (SRS 8.2, DD-08) |

## 3. Feature-level design (Feature SDS)

### 3.1 Behaviour and workflow

1. **Overdue status.** Every request representation (`GET /api/requests`, `GET /api/requests/:id` and the bodies returned by actions) gains `overdue: boolean`. It is `true` exactly when the request is `CHECKED_OUT` and at least one of its loans is `ACTIVE` with `dueAt < now` (SDS 4.5).
2. **Overdue list.** `GET /api/requests?overdue=true` returns the overdue requests in scope (a Custodian: all; a Borrower: their own), ordered by the earliest `dueAt` of their active loans, then by `id`. A new Custodian page **Overdue** (`/overdue`) shows them with the units not yet returned.
3. **BR-15 on create and edit.** Inside the create (F-04) and edit (F-05) transaction, after the Borrower row lock (DD-05), the service reads the Borrower's overdue requests. If there is one, the call is rejected with `409 OVERDUE_BLOCK` naming the oldest overdue request. A return of every active unit of that request (F-08, early or all) lifts the block at once.
4. **BR-14 on create and edit.** In the same transaction, the service computes the units the Borrower holds (D-20): `ACTIVE` loans of the Borrower plus the quantities of the lines of the Borrower's `PENDING` and `APPROVED` requests, the edited request excluded. If held + the quantities of the body is greater than 5, the call is rejected with `409 BORROW_LIMIT`. Exactly 5 is allowed.
5. Nothing is written by a rejected call: no request, line or history entry.

### 3.2 State changes

None. F-11 adds no state and no transition. `overdue` is computed on read (DD-08).

### 3.3 Business rules and where they are enforced

| Rule | UI | Route | Service | Domain | Database |
| --- | --- | --- | --- | --- | --- |
| FR-22 overdue status | "Overdue" marker next to the status badge (4.2, 4.3) | - | Adds `overdue` to the view with the request's loans and `now` | `isOverdue(request, now)` | Index `loans (status, dueAt)` (exists) |
| FR-22 overdue list | Overdue page (4.4) | `authenticate`; query `overdue=true` | Scope as for other lists (BR-05); filter in SQL on `status = 'CHECKED_OUT'` and an `ACTIVE` loan with `dueAt < now` | - | Same index |
| BR-15 overdue block | The API message as an alert in the request form (4.5) | - | In `assertRequestRules`, first rule after the item type `404` | `firstOverdue(requests, now)` | - |
| BR-14 5-unit limit | The API message as an alert in the request form (4.5) | - | In `assertRequestRules`, after BR-08 and before BR-01 | `borrowLimitViolation(held, asked)` with `BORROW_LIMIT_UNITS = 5` | - |

### 3.4 Counting rules (D-20, BR-14)

- Counted: every `ACTIVE` loan of the Borrower (one unit each) and every line quantity of the Borrower's `PENDING` and `APPROVED` requests.
- Not counted: `CANCELLED`, `REJECTED`, `EXPIRED` and `RETURNED` requests; `RETURNED` loans; lines of a `CHECKED_OUT` request (their units are counted through their `ACTIVE` loans).
- A kit is one unit (BR-14): a line of a kit item type with quantity 1 counts 1.
- On edit (F-05), the lines of the edited request are left out of "held", and the body's lines are the request's new content.
- Worked examples (limit 5):

| Held before (what) | Body | Total | Result |
| --- | --- | --- | --- |
| 0 | 5 units in 2 lines | 5 | Allowed (boundary) |
| 3 (2 `ACTIVE` loans + a `PENDING` line of 1) | 2 | 5 | Allowed |
| 3 | 3 | 6 | `409 BORROW_LIMIT` |
| 4 (a `CANCELLED` request of 3 and a `REJECTED` one of 2 are ignored) | 1 | 5 | Allowed |
| Edit of request R (2 units) when held is 5 including R | R becomes 3 units | 3 + 3 = 6 | `409 BORROW_LIMIT` |
| Edit of request R (2 units) when held is 5 including R | R becomes 2 units of another item type | 3 + 2 = 5 | Allowed |

### 3.5 Check order (extends F04-D3)

`415` → `401` → `403` → `400` (path, body) → `404` (missing item type, first in body order) → **BR-15** → BR-04 → BR-07 → BR-08 → **BR-14** → BR-01.

BR-15 comes first because the Borrower cannot fix it by changing the request (F11-D3). BR-14 comes after the catalog limits and before availability, which changes from minute to minute (F04-D3).

### 3.6 History entries

None added. A rejected create or edit writes nothing; an overdue state has no entry because it is derived (DD-08).

### 3.7 Concurrency

Create and edit already lock the Borrower's `users` row first (DD-05), so two parallel calls of one Borrower run one after the other: the second sees the first's lines and the limit holds (AC-139). A return (F-08) does not lock the Borrower row; if it commits while a create waits, the create reads the committed loan states after the lock and is judged on them.

### 3.8 Decisions made in this contract

| ID | Decision | Rationale |
| --- | --- | --- |
| F11-D1 | `overdue` = `CHECKED_OUT` and an `ACTIVE` loan with `dueAt < now`, where `now` is the application's `new Date()` taken once per call, not the database `now()` | One definition for F-11, F-14 and the UI (SDS 4.5). Using the application clock lets tests fix it with `vi.useFakeTimers({ toFake: ["Date"] })`, as for D-21 |
| F11-D2 | At `dueAt` exactly, a loan is not yet overdue (`<`, not `≤`) | A loan due at 17:00 can still be returned at 17:00; D-21 makes every `dueAt` a business-day 17:00 |
| F11-D3 | BR-15 is checked before every other request rule | The Borrower must return units first; reporting a quantity or availability problem would send them to fix the wrong thing |
| F11-D4 | `OVERDUE_BLOCK` message: "You cannot make a new request while Request #12 is overdue. Return every unit of it first." with `details: [ { field: "body", issue: "Request #12 is overdue" } ]`, one entry per overdue request, oldest `dueAt` first; the message names the oldest. The same text is used for an edit | Names the request to return, which the Borrower can open |
| F11-D5 | `BORROW_LIMIT` message: "You can hold at most 5 units. You hold 4 and asked for 2." (singular "unit" for 1) with `details: [ { field: "lines", issue: "4 held + 2 asked > 5" } ]` | States the numbers the Borrower needs to change the request |
| F11-D6 | The limit (5) is a constant in the domain module, not a setting | BR-14 fixes the number; a setting would be configuration nobody needs |
| F11-D7 | `overdue` in `GET /api/requests` accepts only `true`; it cannot be combined with `status` (`400 VALIDATION_FAILED` naming `overdue` for any other value or the combination) | An overdue request is always `CHECKED_OUT`, so a combination would be either redundant or empty |
| F11-D8 | The overdue list's order: earliest active `dueAt` first, then `id` | The Custodian sees the longest-overdue request first |

## 4. UI specification

### 4.1 Layers changed by F-11

| Layer | Change |
| --- | --- |
| UI | "Overdue" marker on My requests, request detail and All requests; new Custodian page Overdue (`/overdue`) and nav link; request form shows the two new `409` messages like the others |
| API | `overdue` field in the request representation; `?overdue=true` on `GET /api/requests` |
| Domain | `isOverdue`, `firstOverdue`, `borrowLimitViolation`, `BORROW_LIMIT_UNITS`; two rules added to `requestRuleViolation` |
| Database | No schema change and no migration: the `loans (status, dueAt)` index exists (SDS 4.2) |

### 4.2 Borrower: My requests and request detail

| Element | Behaviour |
| --- | --- |
| Overdue marker | When `overdue` is `true`, a marker "Overdue" with a warning icon next to the "Checked out" badge, in text, not only colour (SDS 5.3) |
| Request detail | The due line reads "Due 4 Dec 2026, 17:00 · Overdue" when overdue |

### 4.3 Custodian: All requests and request detail

The same marker as 4.2 in the All requests table and on the detail page.

### 4.4 Overdue page (`/overdue`, Custodian)

| Element | Behaviour |
| --- | --- |
| Data | `GET /api/requests?overdue=true` |
| Table | Request (link), Borrower (display name and username), units not yet returned (asset tag and item type per `ACTIVE` loan), due date, days overdue ("1 day overdue", "3 days overdue", whole ICT calendar days since the due date) |
| Order | As the API returns it (F11-D8) |
| States | Loading, error with "Try again", empty: "No request is overdue." |
| Access | `RequireRole CUSTODIAN`; a Borrower gets the Forbidden page; nav link "Overdue" for Custodians |

### 4.5 Request form (New request, Edit request)

`409 OVERDUE_BLOCK` and `409 BORROW_LIMIT` are shown as the alert above the form with the API message; the lines and loan length stay as entered (as F-04 4.3 does for every `409`). No new control.

## 5. API specification

### 5.1 Request representation (changed)

Every request object gains `overdue: boolean` (F11-D1), for both roles, in lists, detail and action responses. Example: a `CHECKED_OUT` request with an `ACTIVE` loan due `2026-12-04T10:00:00.000Z`, read at `2026-12-07T03:00:00.000Z`, has `"overdue": true`.

### 5.2 `GET /api/requests?overdue=true`

| Aspect | Specification |
| --- | --- |
| Who | Signed in. Custodian: every overdue request. Borrower: their own only (BR-05) |
| Query | `overdue`: only `true` (F11-D7); not with `status`; otherwise `400 VALIDATION_FAILED` naming `overdue` |
| Success | `200 { "items": [ request, … ] }`, each with `overdue: true`, ordered by F11-D8 |
| No session | `401 UNAUTHENTICATED` |

### 5.3 `POST /api/requests` and `PATCH /api/requests/:id` (changed)

Two new `409` outcomes, in the order of 3.5:

| Code | When | Message |
| --- | --- | --- |
| `OVERDUE_BLOCK` | The Borrower has an overdue request (BR-15) | F11-D4 |
| `BORROW_LIMIT` | Held + asked > 5 (BR-14, D-20) | F11-D5 |

All other outcomes of F-04 5 and F-05 5 are unchanged.

## 6. Data specification

### 6.1 Schema and migrations

No change. `loans (status, dueAt)` and `borrow_requests (borrowerId, status)` indexes exist.

### 6.2 Tables read and written

| Table | Read | Written |
| --- | --- | --- |
| `borrow_requests`, `request_lines`, `loans` | Overdue status, overdue list, held units | Only by the existing create and edit when the checks pass |
| `users` | Borrower row lock (DD-05) | - |

## 7. Acceptance criteria

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-132 | A request is reported `overdue: true` exactly when it is `CHECKED_OUT` and has an `ACTIVE` loan with `dueAt` before now; at `dueAt` exactly, after every unit is returned, and for every other state it is `false`. Both roles see the same value for the requests they may read | FR-22, F11-D1, F11-D2 |
| AC-133 | `GET /api/requests?overdue=true` returns every overdue request for a Custodian and only the caller's own for a Borrower, earliest due first; a request that is not overdue is never listed; `overdue=false`, `overdue=yes` and `overdue=true&status=CHECKED_OUT` give `400`; no session gives `401` | FR-22, BR-05, NFR-01, F11-D7, F11-D8 |
| AC-134 | A Borrower with an overdue request cannot create a request: `409 OVERDUE_BLOCK` naming the oldest overdue request, and nothing is stored. After every unit of it is returned (early returns or return all), the same create succeeds. A loan that is due later, or due now exactly, does not block | BR-15, D-14, F11-D3, F11-D4 |
| AC-135 | The overdue block also applies to editing the Borrower's own `PENDING` request; nothing changes | BR-15, BR-10 |
| AC-136 | A create is rejected with `409 BORROW_LIMIT` when the Borrower's `ACTIVE` loans plus the line quantities of their `PENDING` and `APPROVED` requests plus the new quantities exceed 5; a total of exactly 5 is allowed; `CANCELLED`, `REJECTED` and `RETURNED` requests and `RETURNED` loans do not count; a kit counts as one unit | BR-14, D-20, F11-D5 |
| AC-137 | On edit the edited request's own current lines are not counted, so an edit that keeps the total at or below 5 succeeds and one that goes above it is rejected with `409 BORROW_LIMIT`; nothing changes on rejection | BR-14, BR-10 |
| AC-138 | The checks run in the order of 3.5: an unknown item type gives `404` before BR-15; an overdue Borrower over the limit gets `OVERDUE_BLOCK`; a Borrower with a duplicate open request and over the limit gets `DUPLICATE_OPEN_REQUEST`; a request over the limit with too few available units gets `BORROW_LIMIT` | BR-14, BR-15, F04-D3 |
| AC-139 | Two simultaneous creates by one Borrower that are each within the limit but exceed it together produce exactly one request; the other is rejected with `BORROW_LIMIT` | BR-14, NFR-05, DD-05 |
| AC-140 | The UI marks overdue requests "Overdue" on My requests, request detail and All requests, and the Custodian Overdue page lists them with the units not returned, the due date and the days overdue, with loading, empty and error states; a Borrower opening `/overdue` sees the Forbidden page and has no Overdue link | FR-22, NFR-12 |
| AC-141 | In the request form, `OVERDUE_BLOCK` and `BORROW_LIMIT` are shown as an alert with the API message and the entered lines and loan length are kept | BR-14, BR-15 |

## 8. Software Test Specification (STS)

### 8.1 Conventions

- Test data comes from the existing helpers (`createCheckoutWorld`, factories, `postRequest`, `patchRequest`); never the demo seed.
- Times are fixed with `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime(...)`; only JavaScript `Date` is faked, so database defaults (`createdAt`, `occurredAt`) are not compared with it (as F-03 v1.3 8.1).
- Loans for overdue cases are created through the real checkout at a fixed earlier time, then the clock is moved past `dueAt`; or inserted directly with a chosen `dueAt` where the test is about counting.
- "Unchanged" uses `snapshotRequestState()` (requests, lines, history count, unit states).
- **TDD**: the RED commit adds TEST-132 to TEST-141 and runs them on the pre-change code; every failure must be an assertion (for example `201` where `409` is expected, a missing `overdue` field, a missing page), not an import error. UI tests render the app with `fetch` stubbed, as the Sprint 2 UI tests do.

### 8.2 Test cases

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-132 **TDD** | AC-132 | Unit + API | Unit: `isOverdue` with loans due `2026-12-04T10:00:00.000Z`. API: request R checked out on Mon 30 Nov 2026 10:00 ICT for 3 days (due Thu 3 Dec 17:00) | Unit: (a) now = due − 1 ms; (b) now = due; (c) now = due + 1 ms; (d) the loan `RETURNED`; (e) request `RETURNED`. API: (f) read R at Thu 3 Dec 17:00:00.000 and at 17:00:00.001 as its Borrower and as a Custodian; (g) early-return the unit, read again | (a), (b) `false`; (c) `true`; (d), (e) `false`. (f) `overdue` `false` then `true`, the same for both roles; (g) `false` | `server/tests/unit/overdue.test.ts`, `server/tests/api/overdue.test.ts` |
| TEST-133 **TDD** | AC-133 | API | Borrowers B1 (overdue R1 due 1 Dec, overdue R2 due 3 Dec, not overdue R3) and B2 (overdue R4 due 2 Dec) | (a) Custodian `?overdue=true`; (b) B1 `?overdue=true`; (c) `?overdue=false`; (d) `?overdue=yes`; (e) `?overdue=true&status=CHECKED_OUT`; (f) no session | (a) IDs `[R1, R4, R2]`, each `overdue: true`; (b) `[R1, R2]`; (c), (d), (e) `400 VALIDATION_FAILED` naming `overdue`; (f) `401` | `server/tests/api/overdue.test.ts` |
| TEST-134 **TDD** | AC-134 | API | B1 with request R1 checked out (2 units), now past its due date; Arduino available | (a) B1 creates a request for an HC-SR04; (b) return one unit early, create again; (c) return the other unit, create again; (d) B2 whose loan is due in 1 day creates; (e) B2 at its `dueAt` exactly creates | (a) `409 OVERDUE_BLOCK`, message names R1, `details` one entry; Unchanged. (b) still `409`. (c) `201`. (d) `201`. (e) `201` | `server/tests/api/borrow-limits.test.ts` |
| TEST-135 **TDD** | AC-135 | API | B1 with overdue R1 and own `PENDING` request P | `PATCH /api/requests/P` with a changed quantity | `409 OVERDUE_BLOCK` naming R1; P unchanged | `server/tests/api/borrow-limits.test.ts` |
| TEST-136 **TDD** | AC-136 | Unit + API | Unit: `borrowLimitViolation`. API: B1 holds the cases of 3.4 (loans and open requests built with the helpers; `CANCELLED` and `REJECTED` requests through the real endpoints; a kit item type with `isKit`) | Unit: (a) held 0, asked 5; (b) held 3, asked 2; (c) held 3, asked 3; (d) held 5, asked 1. API: (e) to (h) the 3.4 rows 1 to 4; (i) a kit line of quantity 1 when holding 4 | Unit: (a), (b) no violation; (c), (d) violation with `{ held, asked }`. API: (e), (f), (h), (i) `201`; (g) `409 BORROW_LIMIT` with the F11-D5 message "You can hold at most 5 units. You hold 3 and asked for 3." and Unchanged | `server/tests/unit/request-rules.test.ts`, `server/tests/api/borrow-limits.test.ts` |
| TEST-137 **TDD** | AC-137 | API | B1 holds 5 units including `PENDING` request R (2 units of Arduino) | (a) PATCH R to 3 units; (b) PATCH R to 2 units of HC-SR04 | (a) `409 BORROW_LIMIT`, "You hold 3 and asked for 3."; R unchanged. (b) `200` | `server/tests/api/borrow-limits.test.ts` |
| TEST-138 **TDD** | AC-138 | API | B1 overdue and holding 5; B2 holding 5 with an open Arduino request; B3 holding 4, HC-SR04 with 1 available | (a) B1 creates with an unknown item type; (b) B1 creates 1 Arduino; (c) B2 creates 1 Arduino; (d) B3 creates 2 HC-SR04 | (a) `404`; (b) `409 OVERDUE_BLOCK`; (c) `409 DUPLICATE_OPEN_REQUEST`; (d) `409 BORROW_LIMIT` | `server/tests/api/borrow-limits.test.ts` |
| TEST-139 **TDD** | AC-139 | Integration | B1 holds 3 units; enough units of two item types | `Promise.all` of two creates of 2 units each (different item types); 5 rounds with fresh data | Each round: one `201` and one `409 BORROW_LIMIT`; B1 holds exactly 5 | `server/tests/api/borrow-limits-concurrency.test.ts` |
| TEST-140 **TDD** | AC-140 | UI | App rendered with `fetch` stubbed: requests with `overdue` true and false; overdue list with two requests and two active loans | (a) Borrower My requests and detail; (b) Custodian All requests; (c) Custodian `/overdue` loaded, empty and error; (d) Borrower opens `/overdue` | (a), (b) "Overdue" shown only for the overdue request; detail due line ends "· Overdue". (c) rows with request link, Borrower, asset tags, due date and "3 days overdue"; "No request is overdue."; error with "Try again" that reloads. (d) Forbidden page; no "Overdue" link in the Borrower nav | `client/tests/overdue.test.tsx` |
| TEST-141 **TDD** | AC-141 | UI | New request form with two lines and loan length 3 | Submit; the stub answers `409 OVERDUE_BLOCK`, then `409 BORROW_LIMIT` | The API message shown as the alert each time; both lines and "3" kept | `client/tests/NewRequestPage.test.tsx` |

### 8.3 Coverage checks

- Each AC-n has TEST-n; every new `409` has an API test with Unchanged (TEST-134 to TEST-138).
- The boundaries are tested on both sides: `dueAt` ± 1 ms (TEST-132), exactly 5 and 6 units (TEST-136, TEST-137).
- Access: the overdue list scope (TEST-133 (b)), no session (TEST-133 (f)), the page guard (TEST-140 (d)).
- Regression: the whole server, client and E2E suites run on the GREEN commit; F-04, F-05 and F-07 tests that create requests must still pass with BR-14 and BR-15 added (none of their Borrowers is overdue or near the limit; a test that needs a change is revised and listed in the PR).

## 9. Definition of Done (F-11)

- This contract reviewed by Teerakarn Noiruksa and merged into `staging` before any F-11 code.
- RED commit with TEST-132 to TEST-141 only; output kept in `docs/sprints/sprint-3/evidence/F-11/` with the commit SHA, every failure an assertion.
- GREEN implementation commit; the same tests pass; whole server, client and E2E suites pass with counts recorded.
- PR into `staging` reviewed by the other student; CI `test-and-docker` green; no test skipped or weakened.
- `docs/features.md` 6.2 and `docs/traceability.md` rows for FR-22, BR-14 and BR-15 moved to Implemented with the commits.

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-132 | FR-22 | TEST-132 | `server/tests/unit/overdue.test.ts`, `server/tests/api/overdue.test.ts` |
| AC-133 | FR-22, BR-05, NFR-01 | TEST-133 | `server/tests/api/overdue.test.ts` |
| AC-134 | BR-15, D-14 | TEST-134 | `server/tests/api/borrow-limits.test.ts` |
| AC-135 | BR-15, BR-10 | TEST-135 | `server/tests/api/borrow-limits.test.ts` |
| AC-136 | BR-14, D-20 | TEST-136 | `server/tests/unit/request-rules.test.ts`, `server/tests/api/borrow-limits.test.ts` |
| AC-137 | BR-14, BR-10 | TEST-137 | `server/tests/api/borrow-limits.test.ts` |
| AC-138 | BR-14, BR-15 | TEST-138 | `server/tests/api/borrow-limits.test.ts` |
| AC-139 | BR-14, NFR-05 | TEST-139 | `server/tests/api/borrow-limits-concurrency.test.ts` |
| AC-140 | FR-22, NFR-12 | TEST-140 | `client/tests/overdue.test.tsx` |
| AC-141 | BR-14, BR-15 | TEST-141 | `client/tests/NewRequestPage.test.tsx` |
