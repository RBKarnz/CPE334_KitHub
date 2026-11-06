# F-03 Checkout and active loan: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-03 Checkout and active loan |
| Sprint | 1 (due 2026-11-08) |
| Version | 1.0 |
| Status | Draft, in review. Becomes `Approved for implementation` when the PR for #16 is reviewed and merged into `staging` |
| Date | 2026-11-06 |
| Authors | Teerakarn Noiruksa (67070501062), Methipat Mansap (67070501071) |
| Baseline | [SRS v1.2](../../srs.md), [System-Level SDS v1.1](../../system-sds.md), [Feature inventory](../../features.md), [Traceability](../../traceability.md), [Three-sprint plan v1.2](../plan.md) |
| Issues | #16 this contract; #19 implementation; #20 end-to-end journey test |
| Definition of Done | [Product Definition of Done](definition-of-done.md) and section 4.9 of this contract |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-06 | Methipat Mansap | First contract. Adopts AC-18 to AC-26 and TEST-18 to TEST-26 from `docs/features.md` 4.3; adds AC-41 to AC-49 and TEST-41 to TEST-49; decisions F03-D1 to F03-D8 |

Changes after approval get a new version row with the reason. AC and TEST IDs are never reused for a different meaning.

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What F-03 does with it |
| --- | --- | --- |
| Functional | FR-09, FR-16 | Lists pending requests for a Custodian; records checkout of a chosen unit |
| Business rules | BR-02, BR-03, BR-16 | Only an `AVAILABLE` unit of the line's item type; one `ACTIVE` loan per unit under concurrency; history for every state change |
| Business rules (through access rules) | BR-17 | Only Custodians check out; a Borrower cannot (SRS 3.1) |
| Non-functional | NFR-02, NFR-05, NFR-09, NFR-12 | Role check on every F-03 endpoint; concurrent checkouts; history entries; list states of the pending list |
| Non-functional (through access rules) | NFR-01 | Every F-03 endpoint rejects a call without a session |
| SRS decisions | D-16, D-17 | Sprint 1 due date; no available unit means checkout is rejected and the request stays `PENDING` |
| SDS design decisions | DD-04, DD-06, DD-07, DD-10, DD-11 | Conditional updates plus partial unique index; `404` for records outside scope; append-only history; `409` with rule codes; `units` array body |

### 2.2 Depends on

| Dependency | What F-03 uses | Status on 2026-11-06 |
| --- | --- | --- |
| SR-01 (#13) | Schema and first migration (every Sprint 1 table, `loans_one_active_per_unit`, history trigger and CHECKs), `AppError` classes and the JSON error handler, `validate` middleware, Prisma client, test database setup and helpers | Open |
| F-01 (#14, #17) | `authenticate`, `requireRole("CUSTODIAN")`, `req.user = { id, role }`, the navigation bar, `RequireAuth` and `RequireRole` route guards, the Forbidden page | Contract not yet on `staging` |
| F-02 (#15, #18) | Borrow requests and request lines, `GET /api/requests` with its role scope, `GET /api/requests/:id`, the request detail screen, `StatusBadge`, `AsyncState`, the time formatter | Contract not on `staging` or in an open PR; see 2.4 |

### 2.3 Out of scope for F-03 in Sprint 1

| Not in F-03 | Arrives in |
| --- | --- |
| Approval and rejection; checkout requires `APPROVED` | Sprint 2, F-06 and F-07 |
| Checkout of several units, one per quantity (FR-17) | Sprint 2, F-07 (replaces this checkout) |
| Loan lists for Borrowers and Custodians (FR-18, FR-19) | Sprint 2, F-07 |
| Returns and unit condition (FR-20, FR-21) | Sprint 2, F-08 |
| Closing a request that cannot be checked out (reject or cancel) | Sprint 2, F-05 and F-06 (D-17 is the Sprint 1 limitation) |
| Reservation by approved requests and expiry | Sprint 3, F-10 |
| Overdue status and overdue list | Sprint 3, F-11 |
| History views per unit and per Borrower | Sprint 3, F-13 (F-03 only writes the entries) |

### 2.4 Assumptions about F-02

The F-02 contract (#15) does not exist yet. F-03 uses the SDS names below. The F-02 author confirms or corrects each item in the F-02 contract; any correction is applied to this contract as a new version before #19 starts. This PR merges after #15.

| ID | Assumption |
| --- | --- |
| F02-A1 | `GET /api/requests?status=PENDING` called by a Custodian returns `{ "items": [...] }` with the `PENDING` requests of every Borrower. Called by a Borrower, it returns only that Borrower's requests (SDS 6.1, 7.2) |
| F02-A2 | A request in a response has `id`, `status`, `createdAt`, `borrower { id, username, displayName }` (at least in the Custodian view) and `lines[]`, each with `id`, `itemType { id, name }` and `quantity`. F-03 needs `lines[].id` (sent back as `lineId`) and `lines[].itemType.id` (to list units) |
| F02-A3 | An invalid `status` value gives `400 VALIDATION_FAILED` |
| F02-A4 | `GET /api/requests/:id` returns one request in the same shape. A Borrower asking for another Borrower's request gets `404 NOT_FOUND` (DD-06) |
| F02-A5 | The request detail screen (`/requests/:id`) shows the state with `StatusBadge` for any `RequestStatus`, so `CHECKED_OUT` needs no new badge |
| F02-A6 | F-02 orders the Borrower's own list as it chooses. For a Custodian with `status=PENDING`, F-03 fixes the order (F03-D2) |
| F02-A7 | The test helpers can create a Borrower, a catalog and a `PENDING` request with its line directly in `kithub_test`. If not, #19 adds them in `server/tests/helpers/` |

If F-02 already returns `dueAt` and `lines[].loans`, section 4.5 only confirms their content.

## 3. Feature-level design (Feature SDS)

### 3.1 Behavior and workflow

From the Custodian's view, with the server sequence from SDS 4.7:

1. The Custodian signs in and lands on **Pending requests** (`/pending`). The UI calls `GET /api/requests?status=PENDING` and shows every `PENDING` request, oldest first.
2. The Custodian chooses **Check out** on a row. A dialog opens and the UI calls `GET /api/item-types/:id/units?status=AVAILABLE` for the line's item type.
3. The dialog lists the `AVAILABLE` units by asset tag. If the list is empty, the dialog says so and checkout cannot be submitted; the request stays `PENDING` (D-17).
4. The Custodian selects a unit and confirms. The UI calls `POST /api/requests/:id/checkout` with `{ "units": [ { "lineId", "unitId" } ] }`.
5. The server runs `authenticate`, `requireRole("CUSTODIAN")` and the strict body schema, then opens one transaction:
   1. Reads the request with its lines, and the chosen unit. A missing request or unit gives `404 NOT_FOUND`. A `lineId` that is not a line of this request gives `400 VALIDATION_FAILED`. The item type used next is the line's `itemTypeId` from the database, never a value from the client.
   2. Moves the request: `UPDATE borrow_requests SET status = 'CHECKED_OUT' WHERE id = :id AND status = 'PENDING'`. 0 rows → `409 INVALID_STATE`.
   3. Moves the unit: `UPDATE units SET status = 'ON_LOAN' WHERE id = :unitId AND "itemTypeId" = :lineItemTypeId AND status = 'AVAILABLE'`. 0 rows → `409 UNIT_WRONG_ITEM_TYPE` or `409 UNIT_NOT_AVAILABLE` (3.6).
   4. Inserts the loan (`ACTIVE`, `dueAt` from 3.4). A unique violation of `loans_one_active_per_unit` → `409 UNIT_NOT_AVAILABLE`.
   5. Inserts three history entries (3.10) and commits.
6. The server returns `201` with the request, now `CHECKED_OUT`, and its new loan. The UI shows a confirmation and refreshes the pending list; the request is no longer in it.
7. Any failure in step 5 rolls back every write: the request stays `PENDING`, the unit keeps its state, no loan and no history entry exist.
8. The Borrower who owns the request now sees it as `CHECKED_OUT` with the unit's asset tag and the due date, and the item type's available count in the catalog is one lower (AC-26).

### 3.2 State changes

F-03 performs exactly these three transitions from SRS section 8, together, in one transaction:

| Entity | From | To | SRS row | Trigger |
| --- | --- | --- | --- | --- |
| Request | `PENDING` | `CHECKED_OUT` | 8.2, Sprint 1 only | Checkout by a Custodian |
| Unit | `AVAILABLE` | `ON_LOAN` | 8.1 | Checkout |
| Loan | (new) | `ACTIVE` | 8.3 | Checkout of its unit |

No other transition is allowed by F-03. In particular a request in any state other than `PENDING`, and a unit in `ON_LOAN`, `MAINTENANCE` or `RETIRED`, cannot be checked out, and nothing changes (SRS 8: "Any transition that is not listed ... is rejected and nothing changes"). The service calls `assertTransition` from `server/src/domain/transitions.ts` for each row before writing it (SDS 3.5); the conditional `WHERE status = ...` clauses enforce the same rule against concurrent changes.

### 3.3 Business rules and where they are enforced

| Rule | UI (hint only) | Route and middleware | Service (in the transaction) | Domain | Database |
| --- | --- | --- | --- | --- | --- |
| Custodian only (BR-17, NFR-02) | `/pending` behind `RequireRole("CUSTODIAN")`; Borrowers have no link | `requireRole("CUSTODIAN")` on both F-03 endpoints | - | - | - |
| BR-02 unit `AVAILABLE` and of the line's item type | Dialog lists only `AVAILABLE` units of the line's item type | - | Conditional unit update on `id`, `itemTypeId` and `status = 'AVAILABLE'`; on 0 rows, picks the code (3.6) | `assertTransition("UNIT", "AVAILABLE", "ON_LOAN")` | FK `loans.unitId` |
| BR-03 one `ACTIVE` loan per unit | Submit disabled while running | - | Conditional unit update; lock order request then unit | - | Partial unique index `loans_one_active_per_unit` (backstop) |
| BR-16 history | - | - | Three entries in the same transaction (3.10) | - | Append-only trigger; CHECK on actor and subject |
| D-16 due date | Shows `dueAt` from the response | - | Calls `computeDueAt` with the line's item type `maxLoanDays` | `computeDueAt(checkedOutAt, maxLoanDays)` | `loans.dueAt` not null |
| D-17 no available unit | Empty unit list: message and checkout disabled | - | Every unit of the item type fails the conditional update → `409 UNIT_NOT_AVAILABLE`; rollback keeps the request `PENDING` | - | - |
| Request is `PENDING` (SRS 8.2) | Only `PENDING` requests are listed | - | Conditional request update → `409 INVALID_STATE` | `assertTransition("REQUEST", "PENDING", "CHECKED_OUT")` | - |
| `lineId` belongs to the request (SDS 4.7, 6.4) | Sends the line ID it received | - | Compares each `lineId` with the request's lines → `400 VALIDATION_FAILED` | - | FK `loans.requestLineId` |

### 3.4 Due-date rule (D-16)

```text
dueAt = checkedOutAt + maxLoanDays × 24 h
```

- `maxLoanDays` is `item_types.maxLoanDays` of the line's item type, read in the transaction.
- Whole days are added as 24-hour periods (SDS 4.5). Asia/Bangkok has no daylight saving time, so the due date is the same clock time on the calendar day `maxLoanDays` later.
- Pure function: `computeDueAt(checkedOutAt: Date, maxLoanDays: number): Date` in `server/src/domain/due-date.ts`. It returns `new Date(checkedOutAt.getTime() + maxLoanDays * 86_400_000)` and throws a `RangeError` when `maxLoanDays` is not an integer ≥ 1. The database CHECK already prevents such a value; the guard makes the unit test of the boundary meaningful.
- Example: checkout at `2026-11-06T07:30:00.000Z` (6 Nov 2026, 14:30 Bangkok) of an item type with 14 days gives `2026-11-20T07:30:00.000Z` (20 Nov 2026, 14:30). With 3 days (instruments) it gives `2026-11-09T07:30:00.000Z`.
- From Sprint 2 the due date uses the request's `loanDays` (BR-08, F-07); `computeDueAt` keeps its signature and receives the request's value instead.

### 3.5 Validation

Shape checks run in the `validate` middleware with strict zod schemas (DD-09) and return `400 VALIDATION_FAILED` with one `details` entry per problem (SDS 6.4).

| Input | Schema |
| --- | --- |
| Path `:id` (checkout) | Integer ≥ 1 |
| Body (checkout) | Strict object `{ units }`. `units` is an array of exactly 1 entry in Sprint 1. Each entry is a strict object `{ lineId: integer ≥ 1, unitId: integer ≥ 1 }`. Any other field, at either level, is an error |
| Path `:id` (unit list) | Integer ≥ 1 |
| Query (unit list) | Strict object `{ status? }`; `status` is one of `AVAILABLE`, `ON_LOAN`, `MAINTENANCE`, `RETIRED` |
| Query (pending list) | Defined by F-02 (F02-A3); F-03 sends `status=PENDING` only |

Rules that need data, checked by the service (SDS 6.4):

- Every `lineId` must be a line of this request. A line of another request, or an ID that is no line at all, gives `400 VALIDATION_FAILED` with `details: [ { "field": "units[0].lineId", "issue": "Not a line of request #12" } ]`.
- "Exactly one entry" is a shape check in Sprint 1 because every Sprint 1 request has exactly one line (BR-01). From Sprint 2, F-07 replaces it with "each line receives exactly its `quantity` of entries, no unit twice" (SDS 4.7 step 1).

A body that is not JSON (`415 UNSUPPORTED_MEDIA_TYPE`) and malformed JSON (`400 VALIDATION_FAILED`) are handled by SR-01 for every endpoint.

### 3.6 Failure and boundary cases

"Unchanged" means: no `loans` row is created, every request keeps its status (the target request stays `PENDING` unless stated), every unit keeps its status, and the number of `history_entries` rows is the same.

| # | Case | Status | Code | Database afterwards | AC | Test |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | No session, or an expired or signed-out session, on any F-03 call | `401` | `UNAUTHENTICATED` | Unchanged; no data returned | AC-41 | TEST-41 |
| 2 | Borrower calls the unit list or checkout | `403` | `FORBIDDEN` | Unchanged; no data returned | AC-06 | TEST-41 |
| 3 | Malformed body: unknown field, missing `units`, non-integer or negative ID, extra field in an entry | `400` | `VALIDATION_FAILED` | Unchanged | AC-44 | TEST-44 |
| 4 | Zero or two `units` entries | `400` | `VALIDATION_FAILED` | Unchanged | AC-44 | TEST-44 |
| 5 | Request ID does not exist | `404` | `NOT_FOUND` | Unchanged | AC-42 | TEST-42 |
| 6 | Unit ID does not exist (F03-D1) | `404` | `NOT_FOUND` | Unchanged | AC-46 | TEST-42 |
| 7 | `lineId` is a line of another request | `400` | `VALIDATION_FAILED` | Unchanged; the other request is also unchanged | AC-45 | TEST-44 |
| 8 | Request is not `PENDING` (already `CHECKED_OUT`) | `409` | `INVALID_STATE` | Unchanged; the request stays `CHECKED_OUT` with its one loan | AC-43 | TEST-43 |
| 9 | Unit of a different item type (in any state, F03-D4) | `409` | `UNIT_WRONG_ITEM_TYPE` | Unchanged | AC-21 | TEST-21 |
| 10 | Unit is `ON_LOAN` | `409` | `UNIT_NOT_AVAILABLE` | Unchanged | AC-20 (a) | TEST-20 |
| 11 | Unit is `MAINTENANCE` | `409` | `UNIT_NOT_AVAILABLE` | Unchanged | AC-20 (a) | TEST-20 |
| 12 | No unit of the item type is `AVAILABLE` (D-17) | `200` with `items: []` on the unit list; `409` `UNIT_NOT_AVAILABLE` on checkout with any of its units | - | Unchanged; the request stays `PENDING` | AC-20 (b) | TEST-20 |
| 13 | Two simultaneous checkouts of the same unit for two different pending requests | One `201`, one `409` | `UNIT_NOT_AVAILABLE` | Exactly one `ACTIVE` loan for the unit; the losing request stays `PENDING`; history only for the winner | AC-22 | TEST-22 |
| 14 | Two simultaneous checkouts of the same request with two different units | One `201`, one `409` | `INVALID_STATE` | Exactly one loan for the request; the losing unit stays `AVAILABLE`; history only for the winner | AC-47 | TEST-45 |
| 15 | A defect skips the unit update and a second `ACTIVE` loan is inserted | `409` | `UNIT_NOT_AVAILABLE` (mapped unique violation) | Rolled back; the index refuses the row | AC-22 | TEST-22 (b) |
| 16 | Unit list: unknown item type | `404` | `NOT_FOUND` | No change (read only) | AC-48 | TEST-46 |
| 17 | Unit list: invalid `status` value or unknown query field | `400` | `VALIDATION_FAILED` | No change (read only) | AC-48 | TEST-46 |

A unit in `RETIRED` fails the same conditional update as case 10 and gives the same result. Retiring arrives in Sprint 2 (BR-12), so F-07 and F-09 test that case.

### 3.7 Check order

When several checks fail, the first in this list decides the response (SDS 6.5):

| Step | Check | Result |
| --- | --- | --- |
| 1 | Session (`authenticate`) | `401 UNAUTHENTICATED` |
| 2 | Role (`requireRole("CUSTODIAN")`) | `403 FORBIDDEN` |
| 3 | Shape of path, query and body (`validate`) | `400 VALIDATION_FAILED` |
| 4 | The request exists | `404 NOT_FOUND` |
| 5 | The unit exists (F03-D1) | `404 NOT_FOUND` with `details` field `units[0].unitId` |
| 6 | Each `lineId` is a line of this request | `400 VALIDATION_FAILED` with `details` field `units[0].lineId` |
| 7 | The request is `PENDING` (conditional update) | `409 INVALID_STATE` |
| 8 | The unit belongs to the line's item type | `409 UNIT_WRONG_ITEM_TYPE` |
| 9 | The unit is `AVAILABLE` (conditional update), and no other `ACTIVE` loan exists (index) | `409 UNIT_NOT_AVAILABLE` |

Steps 4 to 9 run inside the transaction. Steps 8 and 9 are decided together after the unit update changes 0 rows: the service compares the unit's `itemTypeId` (read in step 5) with the line's, and reports `UNIT_WRONG_ITEM_TYPE` if they differ, otherwise `UNIT_NOT_AVAILABLE` with the unit's current state in `details`.

Malformed JSON is the one exception: the JSON body parser from SR-01 may reject it before `authenticate` runs. That response reveals nothing and changes nothing, and TEST-44 sends malformed JSON with a Custodian session, so the test passes with either parser placement.

### 3.8 Permissions

| Operation | Endpoint | Not signed in | Borrower | Custodian |
| --- | --- | --- | --- | --- |
| List pending requests | `GET /api/requests?status=PENDING` | `401` | `200`, own requests only (F-02 scope, F02-A1) | `200`, all Borrowers |
| List units of an item type | `GET /api/item-types/:id/units` | `401` | `403` | `200` |
| Record checkout | `POST /api/requests/:id/checkout` | `401` | `403` | `201` |

- The role check runs before any record is read, so a Borrower learns nothing about the request or unit (SDS 7.2 step 2).
- `loans.checkedOutById` and `history_entries.actorUserId` are always `req.user.id` from the session. The body has no field for an actor, owner or role, and the strict schema rejects one (SDS 7.2 step 5).
- Every Custodian may check out every request (A-02). Custodians have no requests of their own (BR-17).

### 3.9 Concurrency

Following SDS 4.7 and DD-04:

- **One transaction** (`prisma.$transaction(async (tx) => ...)`) at PostgreSQL's default Read Committed level. No `SERIALIZABLE` and no retry loop.
- **Conditional updates**: `tx.borrowRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "CHECKED_OUT" } })`, then `tx.unit.updateMany({ where: { id: unitId, itemTypeId: line.itemTypeId, status: "AVAILABLE" }, data: { status: "ON_LOAN" } })`. Each returns the changed row count; 0 means the state was not what was expected, and the service throws the matching `409`, which rolls the transaction back.
- **Lock order**: request first, then unit (and units in ascending ID order from Sprint 2). A second transaction on the same row waits for the first to commit, then re-checks the `WHERE` condition and sees 0 rows.
  - Same unit, two requests: both request updates succeed (different rows); the second unit update waits, then changes 0 rows → `409 UNIT_NOT_AVAILABLE`; its request update is rolled back and that request stays `PENDING`.
  - Same request, two units: the second request update waits, then changes 0 rows → `409 INVALID_STATE`; its unit is never touched.
- **Backstop**: `loans_one_active_per_unit` (partial unique index on `loans.unitId` where `status = 'ACTIVE'`). If an insert ever violates it, Prisma raises `P2002`; the service maps it to `409 UNIT_NOT_AVAILABLE` with `details: [ { "field": "units[0].unitId", "issue": "Unit already has an active loan" } ]`.

### 3.10 History entries

Written by the checkout service in the same transaction as the state changes (SDS 4.6). Let `now` be the single timestamp of the checkout (F03-D5), `R` the request ID, `U` the unit ID, `L` the new loan ID and `C` the signed-in Custodian's ID.

| Field | Request entry | Unit entry | Loan entry |
| --- | --- | --- | --- |
| `occurredAt` | `now` | `now` | `now` |
| `actorType` | `USER` | `USER` | `USER` |
| `actorUserId` | `C` | `C` | `C` |
| `entityType` | `REQUEST` | `UNIT` | `LOAN` |
| `requestId` | `R` | `R` (caused by a checkout) | `R` |
| `unitId` | null | `U` | `U` |
| `loanId` | null | null | `L` |
| `action` | `STATUS_CHANGED` | `STATUS_CHANGED` | `CREATED` |
| `fromStatus` | `PENDING` | `AVAILABLE` | null |
| `toStatus` | `CHECKED_OUT` | `ON_LOAN` | `ACTIVE` |
| `details` | null | null | null |

A rejected checkout writes no entry, because the transaction is rolled back. No F-03 code updates or deletes a history entry, and the database trigger rejects any attempt (DD-07, AC-24).

### 3.11 Decisions made in this contract

| ID | Decision | Reason |
| --- | --- | --- |
| F03-D1 | A `unitId` that does not exist gives `404 NOT_FOUND`, message "Unit 999 does not exist.", `details: [ { "field": "units[0].unitId", "issue": "Unit does not exist" } ]`. It is checked in step 1 of the transaction together with the request, before the `lineId` check | SDS 6.5 defines `404` as "the record does not exist" and places record existence before references and rules. `409` would mean the unit exists but a rule forbids it, which is false. Units are never deleted (SDS 4.2), so reading the unit before the conditional updates is safe. Units are not owned (SDS 4.4), so the `404` reveals nothing to a Custodian |
| F03-D2 | For a Custodian, `GET /api/requests?status=PENDING` is ordered by `createdAt` ascending, then `id` ascending | Oldest first matches a counter queue: the request waiting longest is served first. The `id` tie-break makes the order stable for tests. The `(status, createdAt)` index (SDS 4.2) supports it |
| F03-D3 | User-facing messages for each `409`: `INVALID_STATE`: "Request #12 cannot be checked out because it is CHECKED_OUT, not PENDING." `UNIT_WRONG_ITEM_TYPE`: "Unit KH-ESP-0001 is not a unit of Arduino Uno R3." `UNIT_NOT_AVAILABLE`: "Unit KH-ARD-0007 is not available for checkout." The UI shows the message as it is | Each message names the record and the reason, uses the state names shown on badges, and reveals nothing a Custodian cannot already see. The `UNIT_NOT_AVAILABLE` text is the SDS 6.5 example |
| F03-D4 | When a unit is both of another item type and not `AVAILABLE`, the code is `UNIT_WRONG_ITEM_TYPE` | Choosing a unit of the wrong model is the more basic mistake: that unit can never be lent on this line, whatever its state |
| F03-D5 | The service takes one timestamp `now` (`new Date()`) at the start of the transaction and uses it for `loans.checkedOutAt`, as the base of `dueAt`, and as `occurredAt` of all three history entries | One instant for one event. Tests can assert `dueAt − checkedOutAt = maxLoanDays × 24 h` exactly and that the history matches the loan |
| F03-D6 | Checkout returns `201` with the full request in the same shape as `GET /api/requests/:id` for a Custodian, including `dueAt` and the new loan in `lines[].loans` | SDS 6.3: a transition that creates a record returns `201` and the updated record. One shape for detail and checkout means one UI type and one test assertion helper. Loans sit under their line, so FR-17 (several units per line) adds entries, not fields (DD-11) |
| F03-D7 | A loan shown to a Borrower has `id`, `status`, `unit { id, assetTag }`, `checkedOutAt` and `dueAt`, without `checkedOutBy`. A Custodian also sees `checkedOutBy { id, username, displayName }` | SDS 4.4 lets Custodians see users on requests and loans, but grants Borrowers only their own profile. The Borrower needs the asset tag and due date (SDS 5.1), not the staff member's account |
| F03-D8 | `GET /api/item-types/:id/units` takes an optional `status`. Without it, every unit of the item type is returned. Items are ordered by `assetTag` ascending | The Sprint 1 UI only sends `AVAILABLE`, but Sprint 2 catalog management (F-09) lists every unit of an item type with the same endpoint. Asset tag order matches the labels on the shelf |

## 4. UI specification

### 4.1 Layers changed by F-03

| Layer | Change |
| --- | --- |
| UI | New Pending requests page and checkout dialog; the request detail screen from F-02 shows loan fields |
| API | New `GET /api/item-types/:id/units` and `POST /api/requests/:id/checkout`; F-03 relies on F-02's `GET /api/requests?status=PENDING` and adds `dueAt` and `lines[].loans` to the request representation if F-02 does not include them |
| Domain | New `computeDueAt`; F-03 rows in the transition table |
| Database | No schema change and no migration (section 4.6) |

### 4.2 Pending requests screen (`/pending`)

- Custodian landing page after sign-in (SDS 5.2). Route wrapped in `RequireAuth` and `RequireRole("CUSTODIAN")`; the "Pending requests" navigation link from F-01 points here.
- Data: `GET /api/requests?status=PENDING` on open. Rows in the API order (oldest first, F03-D2).
- Planned files: `client/src/pages/pending/PendingRequestsPage.tsx`, `client/src/pages/pending/CheckoutDialog.tsx`, `client/src/api/checkout.ts`.

| Column | Content | Example |
| --- | --- | --- |
| Request | `#` and the request ID | `#12` |
| Borrower | Display name and username | `Borrower One (borrower1)` |
| Item type | The line's item type name | `Arduino Uno R3` |
| Quantity | The line's quantity (always 1 in Sprint 1) | `1` |
| Created | `createdAt` in Asia/Bangkok, format "6 Nov 2026, 14:30" | `6 Nov 2026, 13:10` |
| Action | "Check out" button | - |

States, through the shared `AsyncState` component (SDS 5.3, NFR-12, AC-25):

| State | Shown |
| --- | --- |
| Loading | Spinner with "Loading…" until the first response |
| Empty | "No pending requests." |
| Error | The API error `message` (or the network message from SDS 5.3) and a "Try again" button that repeats the call |

### 4.3 Checkout dialog

| Aspect | Behavior |
| --- | --- |
| Title and summary | "Check out Request #12", then "Borrower One (borrower1) · Arduino Uno R3" |
| Unit list | On open, calls `GET /api/item-types/:id/units?status=AVAILABLE` for the line's item type and lists the units by asset tag as radio options, in the API order. While loading: "Loading…". On error: the message and "Try again" |
| Selection | One unit. The confirm button is disabled until a unit is selected |
| Confirmation | The confirm button names the request and the unit: "Check out KH-ARD-0007 for Request #12" (SDS 5.3 Confirmation). "Cancel" closes the dialog without a call. The dialog can be used and closed with the keyboard |
| No unit available (D-17) | "No unit of Arduino Uno R3 is available. The request stays pending." The confirm button is disabled and no checkout call is sent |
| Submitting | The confirm button is disabled and shows a spinner while the call runs, so a double click sends one call |
| `409 UNIT_NOT_AVAILABLE` or `UNIT_WRONG_ITEM_TYPE` | The API `message` as an alert at the top of the dialog; the selection is cleared and the unit list is fetched again; the dialog stays open |
| `409 INVALID_STATE` or `404 NOT_FOUND` | The API `message` as an alert; the pending list behind the dialog is fetched again, because the request has been handled or is gone |
| `400 VALIDATION_FAILED` | The API `message` as an alert (the UI never sends such a body; this only guards against a defect) |
| `401`, `403` | Shared behavior from SDS 5.3 (session ended, Forbidden message) |
| Success | Dialog closes; a confirmation "Request #12 checked out: KH-ARD-0007, due 20 Nov 2026, 14:30" built from the response (`id`, `lines[0].loans[0].unit.assetTag`, `dueAt`); the pending list is fetched again and no longer contains the request |

### 4.4 Borrower side

The request detail screen (`/requests/:id`) belongs to F-02. F-03 adds, for a request with loans:

| Field added | Source | Example |
| --- | --- | --- |
| Due date | `dueAt` | "Due 20 Nov 2026, 14:30" |
| Asset tag per loan, under its line | `lines[].loans[].unit.assetTag` | `KH-ARD-0007` |
| Checked out time per loan | `lines[].loans[].checkedOutAt` | "Checked out 6 Nov 2026, 14:30" |

The state badge shows `CHECKED_OUT` through F-02's `StatusBadge` (F02-A5). The Borrower's request list needs no change: it already shows each request's state (FR-08). A request with no loans shows no loan fields.

### 4.5 Route guard

A Borrower who opens `/pending` sees the Forbidden page (SDS 5.2). A user with no session is sent to `/login`. The guard only improves the experience; the API rejects a Borrower's unit list and checkout calls with `403` (TEST-41, TEST-32).

## 5. API specification

Conventions from SDS 6.1 to 6.5: JSON bodies, `{ "items": [...] }` for lists, users as `{ id, username, displayName }`, ISO 8601 UTC times, `Cache-Control: no-store`, and the error shape `{ "error": { "code", "message", "details", "requestId" } }`. IDs and names in the examples are illustrative.

### 5.1 `GET /api/requests?status=PENDING`

Defined by F-02 (#15). F-03 relies on the Custodian behavior below; if F-02 defines it differently, F-02's definition wins and this section is updated (2.4).

| Aspect | Specification |
| --- | --- |
| Who | Custodian: every Borrower's requests. Borrower: own requests only (F-02). No session: `401` |
| Query | `status=PENDING` |
| Order (Custodian) | `createdAt` ascending, then `id` ascending (F03-D2) |
| Fields F-03 relies on | `id`, `status`, `createdAt`, `borrower { id, username, displayName }`, `lines[] { id, itemType { id, name }, quantity }` |
| Errors | `401 UNAUTHENTICATED`; `400 VALIDATION_FAILED` for an invalid `status` (F02-A3) |

```json
{
  "items": [
    {
      "id": 12,
      "status": "PENDING",
      "createdAt": "2026-11-06T06:10:00.000Z",
      "dueAt": null,
      "borrower": { "id": 3, "username": "borrower1", "displayName": "Borrower One" },
      "lines": [
        { "id": 5, "itemType": { "id": 3, "name": "Arduino Uno R3" }, "quantity": 1, "loans": [] }
      ]
    },
    {
      "id": 13,
      "status": "PENDING",
      "createdAt": "2026-11-06T06:45:00.000Z",
      "dueAt": null,
      "borrower": { "id": 4, "username": "borrower2", "displayName": "Borrower Two" },
      "lines": [
        { "id": 6, "itemType": { "id": 6, "name": "DHT22 temperature and humidity sensor" }, "quantity": 1, "loans": [] }
      ]
    }
  ]
}
```

### 5.2 `GET /api/item-types/:id/units`

| Aspect | Specification |
| --- | --- |
| Who | Custodian only (SDS 7.1). Borrower: `403`. No session: `401` |
| Path | `id`: integer ≥ 1 |
| Query | `status` (optional): `AVAILABLE`, `ON_LOAN`, `MAINTENANCE` or `RETIRED`. Omitted: every unit of the item type (F03-D8). No other query field |
| Success | `200 { "items": [ { "id", "assetTag", "status" } ] }`, ordered by `assetTag` ascending. An item type with no matching unit gives `"items": []` |
| Order of checks | `401`, `403`, `400` (path and query), `404` (item type) |

Example: `GET /api/item-types/3/units?status=AVAILABLE`

```json
{
  "items": [
    { "id": 6, "assetTag": "KH-ARD-0006", "status": "AVAILABLE" },
    { "id": 7, "assetTag": "KH-ARD-0007", "status": "AVAILABLE" }
  ]
}
```

| Status | Code | When |
| --- | --- | --- |
| `401` | `UNAUTHENTICATED` | No valid session |
| `403` | `FORBIDDEN` | Caller is a Borrower |
| `400` | `VALIDATION_FAILED` | `id` is not an integer ≥ 1; `status` is not a `UnitStatus`; an unknown query field |
| `404` | `NOT_FOUND` | No item type with this `id`. Message: "Item type 99 does not exist." |

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request is not valid.",
    "details": [ { "field": "status", "issue": "Must be one of AVAILABLE, ON_LOAN, MAINTENANCE, RETIRED" } ],
    "requestId": "8d3f2a61-0c4e-4f7b-9a52-6e1b7c9d0f13"
  }
}
```

The generic `VALIDATION_FAILED` message comes from SR-01's `validate` middleware; tests check the code and the `details` field, not the message.

### 5.3 `POST /api/requests/:id/checkout`

| Aspect | Specification |
| --- | --- |
| Who | Custodian only. Borrower: `403`. No session: `401` |
| Path | `id`: integer ≥ 1 |
| Headers | `Content-Type: application/json` (SR-01 returns `415` otherwise) |
| Body | `{ "units": [ { "lineId": integer ≥ 1, "unitId": integer ≥ 1 } ] }`, strict, exactly one entry in Sprint 1. The array shape is for Sprint 2 (DD-11) |
| Success | `201` with the request in the Custodian detail shape: `status` is `CHECKED_OUT`, `dueAt` is set, and the new loan is in `lines[0].loans` (F03-D6) |
| Order of checks | Section 3.7 |

Request:

```json
{ "units": [ { "lineId": 5, "unitId": 7 } ] }
```

Response `201`:

```json
{
  "id": 12,
  "status": "CHECKED_OUT",
  "createdAt": "2026-11-06T06:10:00.000Z",
  "dueAt": "2026-11-20T07:30:00.000Z",
  "borrower": { "id": 3, "username": "borrower1", "displayName": "Borrower One" },
  "lines": [
    {
      "id": 5,
      "itemType": { "id": 3, "name": "Arduino Uno R3" },
      "quantity": 1,
      "loans": [
        {
          "id": 31,
          "status": "ACTIVE",
          "unit": { "id": 7, "assetTag": "KH-ARD-0007" },
          "checkedOutAt": "2026-11-06T07:30:00.000Z",
          "dueAt": "2026-11-20T07:30:00.000Z",
          "checkedOutBy": { "id": 1, "username": "custodian1", "displayName": "Custodian One" }
        }
      ]
    }
  ]
}
```

Errors:

| Status | Code | When | Message | `details` |
| --- | --- | --- | --- | --- |
| `401` | `UNAUTHENTICATED` | No valid session | From F-01 | - |
| `403` | `FORBIDDEN` | Caller is a Borrower | From F-01 | - |
| `400` | `VALIDATION_FAILED` | Body or path fails the schema (3.5) | From SR-01 | One entry per problem, for example `{ "field": "units", "issue": "Must contain exactly 1 entry" }` |
| `404` | `NOT_FOUND` | No request with this `id` | "Request #99 does not exist." | - |
| `404` | `NOT_FOUND` | No unit with this `unitId` (F03-D1) | "Unit 999 does not exist." | `{ "field": "units[0].unitId", "issue": "Unit does not exist" }` |
| `400` | `VALIDATION_FAILED` | `lineId` is not a line of this request | "Line 9 is not a line of request #12." | `{ "field": "units[0].lineId", "issue": "Not a line of request #12" }` |
| `409` | `INVALID_STATE` | Request is not `PENDING` | "Request #12 cannot be checked out because it is CHECKED_OUT, not PENDING." | - |
| `409` | `UNIT_WRONG_ITEM_TYPE` | Unit belongs to another item type | "Unit KH-ESP-0001 is not a unit of Arduino Uno R3." | `{ "field": "units[0].unitId", "issue": "Unit belongs to item type ESP32 DevKitC" }` |
| `409` | `UNIT_NOT_AVAILABLE` | Unit is not `AVAILABLE` | "Unit KH-ARD-0007 is not available for checkout." | `{ "field": "units[0].unitId", "issue": "Unit is ON_LOAN" }` (or `MAINTENANCE`, `RETIRED`) |
| `409` | `UNIT_NOT_AVAILABLE` | Unique violation of `loans_one_active_per_unit` | "Unit KH-ARD-0007 is not available for checkout." | `{ "field": "units[0].unitId", "issue": "Unit already has an active loan" }` |

Example `409`:

```json
{
  "error": {
    "code": "UNIT_NOT_AVAILABLE",
    "message": "Unit KH-ARD-0007 is not available for checkout.",
    "details": [ { "field": "units[0].unitId", "issue": "Unit is ON_LOAN" } ],
    "requestId": "c0a8012e-5f1b-4b7e-9d0a-2f6c3b1e9a44"
  }
}
```

Example `400` for a line of another request:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Line 9 is not a line of request #12.",
    "details": [ { "field": "units[0].lineId", "issue": "Not a line of request #12" } ],
    "requestId": "4b1e7c2d-93a0-4d5f-8e61-2a7c0b9f3d58"
  }
}
```

### 5.4 Request representation after checkout (`GET /api/requests/:id`)

The endpoint belongs to F-02. F-03 fixes two fields of the representation, in every response that contains a request:

| Field | Value |
| --- | --- |
| `dueAt` | The `dueAt` shared by the request's loans (SDS 4.5), or `null` when the request has no loan |
| `lines[].loans` | The line's loans, ordered by `id`; `[]` when none. Each loan as in F03-D7: Custodian view with `checkedOutBy`, Borrower view without it |

Borrower view of request #12 after checkout (only for its own Borrower; another Borrower gets `404`):

```json
{
  "id": 12,
  "status": "CHECKED_OUT",
  "createdAt": "2026-11-06T06:10:00.000Z",
  "dueAt": "2026-11-20T07:30:00.000Z",
  "lines": [
    {
      "id": 5,
      "itemType": { "id": 3, "name": "Arduino Uno R3" },
      "quantity": 1,
      "loans": [
        {
          "id": 31,
          "status": "ACTIVE",
          "unit": { "id": 7, "assetTag": "KH-ARD-0007" },
          "checkedOutAt": "2026-11-06T07:30:00.000Z",
          "dueAt": "2026-11-20T07:30:00.000Z"
        }
      ]
    }
  ]
}
```

Whether the Borrower view also carries `borrower` is F-02's choice (F02-A2).

## 6. Data specification

### 6.1 Schema and migrations

**No schema change and no migration.** The first migration from #13 creates every Sprint 1 table and column of SDS 4.2, the partial unique index `loans_one_active_per_unit`, the append-only trigger on `history_entries` and the CHECK constraints of SDS 4.3. Every field F-03 reads or writes is in SDS 4.2 with Sprint 1. The indexes F-03 queries use also exist: `borrow_requests (status, createdAt)` for the pending list, `units (itemTypeId, status)` and the unique `units.assetTag` for the unit list. No missing column or constraint was found, so no change to #13 is required.

### 6.2 Tables read and written

| Table | Read | Written by checkout |
| --- | --- | --- |
| `borrow_requests` | `id`, `status`, `createdAt`, `borrowerId` | `status = 'CHECKED_OUT'` (and `updatedAt`), only where `status = 'PENDING'` |
| `request_lines` | `id`, `requestId`, `itemTypeId`, `quantity` | - |
| `item_types` | `id`, `name`, `maxLoanDays` | - |
| `units` | `id`, `itemTypeId`, `assetTag`, `status` | `status = 'ON_LOAN'` (and `updatedAt`), only where `itemTypeId` = the line's and `status = 'AVAILABLE'` |
| `loans` | For the response and the request representation | One new row (6.3) |
| `history_entries` | - | Three new rows (section 3.10) |
| `users` | `id`, `username`, `displayName` of the Borrower and the Custodian | - |

### 6.3 Values of the new loan

| Field | Value |
| --- | --- |
| `requestLineId` | The `lineId` from the body, after the check that it is a line of this request |
| `unitId` | The `unitId` from the body, after the conditional unit update succeeded |
| `status` | `ACTIVE` |
| `checkedOutAt` | `now` (F03-D5) |
| `checkedOutById` | `req.user.id` |
| `dueAt` | `computeDueAt(now, itemType.maxLoanDays)` |
| `returnedAt`, `returnedById`, `returnCondition` | Not set (Sprint 2 columns; null) |

### 6.4 Constraints relied on

| Constraint | Used for |
| --- | --- |
| `loans_one_active_per_unit` | BR-03 backstop; a violation maps to `409 UNIT_NOT_AVAILABLE` (TEST-22 (b)) |
| History append-only trigger | BR-16; AC-24 (TEST-24) |
| History CHECKs: actor set exactly when `actorType = USER`; the reference matching `entityType` is set | BR-16; any wrong history row fails the whole checkout |
| FKs `loans.requestLineId`, `loans.unitId`, `loans.checkedOutById`, `history_entries.*` with `ON DELETE RESTRICT` | No loan or history entry points to a missing record; records are never deleted |

## 7. Acceptance criteria

### 7.1 Adopted from `docs/features.md` 4.3 (unchanged)

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-18 | A Custodian sees every `PENDING` request with its Borrower, line and creation time | FR-09 |
| AC-19 | A Custodian checks out an `AVAILABLE` unit of the requested item type; one `ACTIVE` loan is created with due date = checkout time + the item type's maximum loan length, the unit becomes `ON_LOAN` and the request becomes `CHECKED_OUT` | FR-16 |
| AC-20 | Checkout is rejected, no loan is created, the request stays `PENDING` and every unit keeps its state in both cases: (a) the chosen unit is not `AVAILABLE`; (b) no unit of the item type is `AVAILABLE` (D-17), so the unit list for the item type has no `AVAILABLE` unit and checkout with any of its units is rejected | FR-16, BR-02 |
| AC-21 | Checkout with a unit of a different item type is rejected and no loan is created | BR-02 |
| AC-22 | Two simultaneous checkouts of the same unit produce exactly one `ACTIVE` loan; the other checkout is rejected | BR-03, NFR-05 |
| AC-23 | Checkout writes history entries for the request, the unit and the loan, with the Custodian as actor and a timestamp | BR-16, NFR-09 |
| AC-24 | The data layer rejects any update or delete of a history entry | BR-16 |
| AC-25 | The Custodian's pending request list shows a loading, an empty and an error state | NFR-12 |
| AC-26 | After checkout, the Borrower sees their request as `CHECKED_OUT` and the item type's available count has dropped by one | FR-08, FR-16 |

### 7.2 Added by this contract

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-41 | A call without a valid session to the pending list, the unit list or checkout is rejected with `401 UNAUTHENTICATED`, returns no request, unit or loan data, and nothing changes | NFR-01 |
| AC-42 | Checkout of a request ID that does not exist is rejected with `404 NOT_FOUND` and nothing changes | FR-16 |
| AC-43 | Checkout of a request that is not `PENDING` (already `CHECKED_OUT`) is rejected with `409 INVALID_STATE`; the request keeps its state and its one loan, and nothing else changes | FR-16 |
| AC-44 | A checkout body that fails the schema (unknown field, missing `units`, a non-integer or non-positive ID, zero entries or two entries) is rejected with `400 VALIDATION_FAILED` naming each problem in `details`, and nothing changes | FR-16 |
| AC-45 | Checkout whose `lineId` is a line of another request is rejected with `400 VALIDATION_FAILED` naming `units[0].lineId`; neither request changes and no loan is created | FR-16, BR-02 |
| AC-46 | Checkout with a `unitId` that does not exist is rejected with `404 NOT_FOUND` naming `units[0].unitId`; the request stays `PENDING` and nothing changes | FR-16, BR-02 |
| AC-47 | Two simultaneous checkouts of the same request with two different `AVAILABLE` units produce exactly one loan; the other checkout is rejected with `409 INVALID_STATE` and its unit stays `AVAILABLE` | FR-16 |
| AC-48 | A Custodian who lists the units of an item type with `status=AVAILABLE` receives only that item type's `AVAILABLE` units, ordered by asset tag; an unknown item type gives `404 NOT_FOUND` and an invalid `status` gives `400 VALIDATION_FAILED` | FR-16, D-17 |
| AC-49 | In the checkout dialog the Custodian chooses one of the listed `AVAILABLE` units and confirms with a button that names the request and the unit. With no unit available, the dialog says so and sends no checkout. A `409` is shown as an alert with the API message and the unit list is fetched again. On success the dialog shows the asset tag and due date and the request leaves the pending list | FR-16, D-17 |

A Borrower calling the unit list or checkout is AC-06 (F-01 contract, #14); its F-03 cases are in TEST-41.

## 8. Software Test Specification (STS)

### 8.1 Conventions

- Levels and tools from SDS 10. API and Integration tests run with Vitest and Supertest against `kithub_test`, emptied with `TRUNCATE` before each file, files one at a time. UI tests use Vitest and Testing Library with the API module mocked.
- Every test creates its own data through the #13 test helpers (F02-A7), never the demo seed: two Custodians, two Borrowers, item types "Arduino Uno R3" (`maxLoanDays` 14) and "ESP32 DevKitC" (14), "Digital multimeter" (3), with units in the states each case needs, and `PENDING` requests with one line.
- "Unchanged" has the meaning from 3.6. The planned helper `snapshotCheckoutState()` reads the `loans` count, every request status, every unit status and the `history_entries` count; each rejection test compares the snapshot before and after the call.
- **TDD** marks the tests for the BR-02, BR-03 and D-16 rules. For each, #19 first commits the test, runs it and keeps the failing output with that commit's SHA, then commits the implementation and keeps the passing output (Deliverable 1, Part E).

### 8.2 Test cases

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-18 | AC-18 | API | Borrower A has `PENDING` requests R1 (older) and R3 (newer); Borrower B has `PENDING` R2 (between them) and a `CHECKED_OUT` request R4. Signed in as Custodian | `GET /api/requests?status=PENDING` | `200`; `items` IDs are exactly `[R1, R2, R3]` in that order (F03-D2); R4 absent; each item has `borrower { id, username, displayName }` matching its owner, `lines[0] { id, itemType { id, name }, quantity: 1 }` and `createdAt` as an ISO string; no item contains `passwordHash` or a field outside the documented shape | `server/tests/api/pending-requests.test.ts` |
| TEST-19 **TDD** | AC-19 | API | `PENDING` request R for "Arduino Uno R3" (`maxLoanDays` 14) with line L; unit U `AVAILABLE` of that item type. Signed in as Custodian C. Record `t0` before the call and `t1` after | `POST /api/requests/R/checkout` with `{ "units": [ { "lineId": L, "unitId": U } ] }` | `201`; body `status` `CHECKED_OUT`, `lines[0].loans` has one loan with `status` `ACTIVE`, `unit.id` U and its `assetTag`, `checkedOutBy.id` C, `checkedOutAt` within `[t0, t1]`, `dueAt − checkedOutAt` = 14 × 86 400 000 ms, top-level `dueAt` equal to the loan's. Database: R is `CHECKED_OUT`; U is `ON_LOAN`; exactly one `loans` row for L with `status` `ACTIVE`, `checkedOutById` C and the same `dueAt`; every other unit unchanged | `server/tests/api/checkout.test.ts` |
| TEST-20 **TDD** | AC-20 | API | Item type T "Arduino Uno R3" with units U1 `ON_LOAN` (with an `ACTIVE` loan for another request), U2 `MAINTENANCE`; `PENDING` request R for T. Signed in as Custodian | (a) checkout R with U1; (b) checkout R with U2; (c) `GET /api/item-types/T/units?status=AVAILABLE`, then checkout R with U1 and with U2 | (a) `409 UNIT_NOT_AVAILABLE`, `details[0]` `{ field: "units[0].unitId", issue: "Unit is ON_LOAN" }`; (b) `409 UNIT_NOT_AVAILABLE`, issue "Unit is MAINTENANCE"; (c) `200 { "items": [] }`, and both checkouts `409 UNIT_NOT_AVAILABLE`. After each call: Unchanged; R is `PENDING`; U1 `ON_LOAN` with its one loan, U2 `MAINTENANCE` | `server/tests/api/checkout.test.ts` |
| TEST-21 **TDD** | AC-21 | API | `PENDING` request R for "Arduino Uno R3"; unit E1 of "ESP32 DevKitC" `AVAILABLE`; unit E2 of "ESP32 DevKitC" `ON_LOAN`. Signed in as Custodian | (a) checkout R with E1; (b) checkout R with E2 | (a) and (b) `409 UNIT_WRONG_ITEM_TYPE` with `details[0].field` `units[0].unitId` (F03-D4 for (b)). Unchanged: no loan, R `PENDING`, E1 `AVAILABLE`, E2 `ON_LOAN` | `server/tests/api/checkout.test.ts` |
| TEST-22 **TDD** | AC-22 | Integration | (a) Unit U `AVAILABLE`; two `PENDING` requests R1 and R2 (two Borrowers) for U's item type; Custodians C1 and C2 signed in on two agents. (b) Unit V with an `ACTIVE` loan | (a) `Promise.all` of C1 checkout R1 with U and C2 checkout R2 with U; repeated 5 rounds with fresh data. (b) Insert a second `ACTIVE` loan for V directly with `prisma.loan.create` | (a) Each round: exactly one `201` and one `409 UNIT_NOT_AVAILABLE`; exactly one `ACTIVE` loan for U; U `ON_LOAN`; the winning request `CHECKED_OUT`, the losing request `PENDING`; history entries only for the winner (3 rows). (b) The insert fails with Prisma `P2002` on `loans_one_active_per_unit`; still one `ACTIVE` loan for V | `server/tests/api/checkout-concurrency.test.ts` |
| TEST-23 | AC-23 | Integration | As TEST-19; record the `history_entries` row count before the call | Checkout R with U as Custodian C | `201`; exactly three new `history_entries` rows, matching section 3.10 field by field: request entry (`REQUEST`, `STATUS_CHANGED`, `PENDING` → `CHECKED_OUT`, `requestId` R, `unitId` null, `loanId` null), unit entry (`UNIT`, `STATUS_CHANGED`, `AVAILABLE` → `ON_LOAN`, `requestId` R, `unitId` U, `loanId` null), loan entry (`LOAN`, `CREATED`, null → `ACTIVE`, `requestId` R, `unitId` U, `loanId` = new loan); all with `actorType` `USER`, `actorUserId` C, `details` null and `occurredAt` equal to the loan's `checkedOutAt` | `server/tests/api/checkout-history.test.ts` |
| TEST-24 | AC-24 | Integration | One history entry H exists (from a checkout) | (a) `prisma.$executeRaw` `UPDATE history_entries SET "toStatus" = 'RETURNED' WHERE id = H`; (b) `prisma.$executeRaw` `DELETE FROM history_entries WHERE id = H` | (a) and (b) both reject with the trigger's exception; afterwards H still exists with its original values and the row count is unchanged. The API has no route that changes or deletes history: signed in as a Custodian, `PATCH` and `DELETE` on `/api/history/H` return `404 NOT_FOUND` | `server/tests/api/checkout-history.test.ts` |
| TEST-25 | AC-25 | UI | `PendingRequestsPage` rendered with the requests API module mocked | (a) mock returns a promise that has not resolved; (b) mock resolves `{ items: [] }`; (c) mock rejects with an API error `{ code: "INTERNAL_ERROR", message: "Something went wrong." }`, then resolves with one request when called again; (d) mock resolves request 12 of Borrower One (`borrower1`) with one line, "Arduino Uno R3", quantity 1, created at `2026-11-06T06:10:00.000Z` | (a) "Loading…" is shown; (b) "No pending requests." is shown; (c) "Something went wrong." and a "Try again" button are shown; clicking it calls the API a second time and the row appears; (d) the row shows `#12`, `Borrower One (borrower1)`, `Arduino Uno R3`, `1`, `6 Nov 2026, 13:10` and a "Check out" button | `client/tests/PendingRequestsPage.test.tsx` |
| TEST-26 | AC-26 | API | Borrower B's `PENDING` request R for item type T with 3 `AVAILABLE` units; `GET /api/categories` as B shows T with available count 3 | Custodian checks out R with one unit U of T; then, as B, `GET /api/requests/R` and `GET /api/categories`; then, as Borrower B2, `GET /api/requests/R` | B sees `status` `CHECKED_OUT`, `dueAt` set, `lines[0].loans[0]` with `unit.assetTag` of U, `checkedOutAt` and `dueAt`, and no `checkedOutBy` (F03-D7); T's available count is 2. B2 gets `404 NOT_FOUND` with no request fields | `server/tests/api/checkout.test.ts` |
| TEST-41 | AC-41, AC-06 | API | `PENDING` request R with line L, `AVAILABLE` unit U, item type T | (a) With no cookie, and with a cookie of a signed-out session: `GET /api/requests?status=PENDING`, `GET /api/item-types/T/units?status=AVAILABLE`, `POST /api/requests/R/checkout` with a valid body. (b) Signed in as a Borrower: the unit list and the checkout call | (a) Every call `401 UNAUTHENTICATED`; the body has only the `error` object, with no request, unit or loan fields. (b) Both calls `403 FORBIDDEN` with only the `error` object. After all calls: Unchanged; R `PENDING`, U `AVAILABLE` | `server/tests/api/checkout-access.test.ts` |
| TEST-42 | AC-42, AC-46 | API | `PENDING` request R with line L; unit U `AVAILABLE`; no request with ID 999 999 and no unit with ID 999 999. Signed in as Custodian | (a) checkout request 999 999 with `{ lineId: L, unitId: U }`; (b) checkout R with `{ lineId: L, unitId: 999999 }`; (c) checkout request 999 999 with unit 999 999 | (a) `404 NOT_FOUND`; (b) `404 NOT_FOUND` with `details[0]` `{ field: "units[0].unitId", issue: "Unit does not exist" }`; (c) `404 NOT_FOUND` without unit details (request is checked first, 3.7). After each: Unchanged; R `PENDING`; U `AVAILABLE` | `server/tests/api/checkout.test.ts` |
| TEST-43 | AC-43 | API | Request R already checked out with unit U1 (one `ACTIVE` loan); unit U2 `AVAILABLE` of the same item type. Signed in as Custodian | Checkout R again with U2 (same `lineId`) | `409 INVALID_STATE`, message "Request #R cannot be checked out because it is CHECKED_OUT, not PENDING." R still `CHECKED_OUT` with exactly one loan (U1); U2 `AVAILABLE`; no new history entry | `server/tests/api/checkout.test.ts` |
| TEST-44 | AC-44, AC-45 | API | `PENDING` requests R (line L) and R2 (line L2, another Borrower); units U and U2 `AVAILABLE` of R's item type. Signed in as Custodian | Checkout R with: (a) `{}`; (b) `{ "units": [] }`; (c) two entries `[ { L, U }, { L, U2 } ]`; (d) `{ "units": [ { "lineId": L, "unitId": U, "borrowerId": 3 } ] }`; (e) a valid `units` entry plus a top-level `"checkedOutById": 1`; (f) `unitId: "7"` (string) and `unitId: 0`; (g) malformed JSON `{"units": [`; (h) `{ "units": [ { "lineId": L2, "unitId": U } ] }`; (i) path `/api/requests/abc/checkout` with a valid body | (a) to (g) and (i): `400 VALIDATION_FAILED` with at least one `details` entry ((g) may have none); (b) and (c) name `units`, (f) names `units[0].unitId`, (i) names `id`. (h): `400 VALIDATION_FAILED` with `details[0]` `{ field: "units[0].lineId", issue: "Not a line of request #R" }`. After each: Unchanged; R and R2 `PENDING`; U `AVAILABLE` | `server/tests/api/checkout.test.ts` |
| TEST-45 | AC-47 | Integration | `PENDING` request R with line L; units U1 and U2 `AVAILABLE` of its item type; Custodians C1 and C2 on two agents | `Promise.all` of C1 checkout R with U1 and C2 checkout R with U2; repeated 5 rounds with fresh data | Each round: one `201` and one `409 INVALID_STATE`; exactly one loan for L; R `CHECKED_OUT`; exactly one of U1 and U2 `ON_LOAN` (the one in the `201` body), the other `AVAILABLE`; exactly 3 new history entries | `server/tests/api/checkout-concurrency.test.ts` |
| TEST-46 | AC-48 | API | Item type T with units `KH-ARD-0003` `AVAILABLE`, `KH-ARD-0001` `AVAILABLE`, `KH-ARD-0002` `ON_LOAN`, `KH-ARD-0004` `MAINTENANCE`; item type T2 with an `AVAILABLE` unit. Signed in as Custodian | (a) `GET /api/item-types/T/units?status=AVAILABLE`; (b) `GET /api/item-types/T/units`; (c) `GET /api/item-types/999999/units?status=AVAILABLE`; (d) `?status=BROKEN`; (e) `?colour=red`; (f) `/api/item-types/abc/units` | (a) `200`, `items` asset tags exactly `["KH-ARD-0001", "KH-ARD-0003"]`, each item exactly `{ id, assetTag, status: "AVAILABLE" }`, no T2 unit; (b) `200`, all four T units in asset-tag order; (c) `404 NOT_FOUND`; (d), (e), (f) `400 VALIDATION_FAILED` with `details` naming `status`, `colour`, `id` | `server/tests/api/units.test.ts` |
| TEST-47 | AC-49 | UI | `CheckoutDialog` for request #12 (Borrower One, line 5, "Arduino Uno R3", item type 3) with the units and checkout API modules mocked | (a) units mock resolves `KH-ARD-0006`, `KH-ARD-0007`; (b) select `KH-ARD-0007`, click confirm twice quickly; (c) units mock resolves `[]`; (d) checkout mock rejects with `409 UNIT_NOT_AVAILABLE` "Unit KH-ARD-0007 is not available for checkout."; (e) checkout mock resolves the 5.3 example | (a) Both asset tags listed as options; confirm button disabled. (b) Button reads "Check out KH-ARD-0007 for Request #12"; checkout mock called once with `(12, { units: [ { lineId: 5, unitId: 7 } ] })`; button disabled while pending. (c) "No unit of Arduino Uno R3 is available. The request stays pending." shown; confirm disabled; checkout mock never called. (d) The message shown as an alert; units mock called a second time; dialog still open. (e) Dialog closes; "Request #12 checked out: KH-ARD-0007, due 20 Nov 2026, 14:30" shown; the pending list reload callback is called | `client/tests/CheckoutDialog.test.tsx` |
| TEST-48 **TDD** | AC-19 | Unit | `computeDueAt` from `server/src/domain/due-date.ts` | (a) `2026-11-06T07:30:00.000Z`, 14; (b) same, 3; (c) same, 1; (d) `2026-11-25T07:30:00.000Z`, 14 (crosses a month end); (e) 0, −1 and 1.5 | (a) `2026-11-20T07:30:00.000Z`; (b) `2026-11-09T07:30:00.000Z`; (c) `2026-11-07T07:30:00.000Z`; (d) `2026-12-09T07:30:00.000Z`; (e) each throws `RangeError`. The input `Date` is not modified | `server/tests/unit/due-date.test.ts` |
| TEST-49 | AC-19, AC-20, AC-43 | Unit | `assertTransition` from `server/src/domain/transitions.ts` | (a) `("REQUEST", "PENDING", "CHECKED_OUT")`, `("UNIT", "AVAILABLE", "ON_LOAN")`, `("LOAN", null, "ACTIVE")`; (b) `("REQUEST", "CHECKED_OUT", "CHECKED_OUT")`, `("REQUEST", "CHECKED_OUT", "PENDING")`, `("UNIT", "ON_LOAN", "ON_LOAN")`, `("UNIT", "MAINTENANCE", "ON_LOAN")`, `("UNIT", "RETIRED", "ON_LOAN")`, `("LOAN", "ACTIVE", "ACTIVE")` | (a) Each returns without error. (b) Each throws the invalid-transition error that the error handler maps to `409 INVALID_STATE` | `server/tests/unit/transitions.test.ts` |

### 8.3 Coverage checks

- Every AC in section 7 has at least one test: AC-18 TEST-18; AC-19 TEST-19, TEST-48, TEST-49; AC-20 TEST-20, TEST-49; AC-21 TEST-21; AC-22 TEST-22; AC-23 TEST-23; AC-24 TEST-24; AC-25 TEST-25; AC-26 TEST-26; AC-41 TEST-41; AC-42 TEST-42; AC-43 TEST-43, TEST-49; AC-44 TEST-44; AC-45 TEST-44; AC-46 TEST-42; AC-47 TEST-45; AC-48 TEST-46; AC-49 TEST-47.
- Every new F-03 endpoint has a no-session test and a wrong-role test (SDS 7.3): unit list and checkout in TEST-41 (a) and (b). The pending list has a no-session test in TEST-41 (a); its Borrower scope is F-02's (AC-13, TEST-13).
- Every rejection test asserts the database afterwards (Unchanged).
- Every failure case in 3.6 has a test (column "Test").
- End-to-end coverage of F-03 is in #20: TEST-30 (journey including checkout and the Borrower seeing `CHECKED_OUT`) and TEST-32 (a Borrower cannot reach checkout in the UI, and the API rejects it).

## 9. Definition of Done (F-03)

The #19 PR satisfies the [Product Definition of Done](definition-of-done.md) and each item below, with the evidence named.

| # | Item | Evidence |
| --- | --- | --- |
| 1 | Every AC in section 7 (AC-18 to AC-26, AC-41 to AC-49) is implemented as specified in sections 3 to 6 | PR description lists each AC with the commit or file that implements it |
| 2 | Every test in section 8.2 exists under its planned file (or a recorded new path), has its stated assertions, and passes | `npm test` output in `server/` and `client/` with test names, pass, fail and skip counts, and the tested commit SHA, pasted in the PR |
| 3 | TDD tests (TEST-19, TEST-20, TEST-21, TEST-22, TEST-48) failed before the implementation and passed after | For each: the test-only commit SHA with its failing output, and the implementation commit SHA with its passing output |
| 4 | No required test is skipped, disabled or weakened | Skip count 0, or each skipped test listed with the reason in the PR |
| 5 | The PR into `staging` is reviewed by the teammate with a specific comment (a check performed, a question or a finding), not only an approval | GitHub review on the PR |
| 6 | This contract, `docs/features.md` and `docs/traceability.md` still match the code; any difference is a new contract version with its reason | Reviewer confirms; revision row if changed |
| 7 | README updated if setup, scripts or environment variables changed | README diff, or "no setup change" in the PR |
| 8 | Incomplete work and known limitations are disclosed | "Known limitations" section in the PR (at least D-17) |

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-18 | FR-09 | TEST-18 | `server/tests/api/pending-requests.test.ts` |
| AC-19 | FR-16, D-16 | TEST-19, TEST-48, TEST-49 | `server/tests/api/checkout.test.ts`, `server/tests/unit/due-date.test.ts`, `server/tests/unit/transitions.test.ts` |
| AC-20 | FR-16, BR-02, D-17 | TEST-20, TEST-49 | `server/tests/api/checkout.test.ts`, `server/tests/unit/transitions.test.ts` |
| AC-21 | BR-02 | TEST-21 | `server/tests/api/checkout.test.ts` |
| AC-22 | BR-03, NFR-05 | TEST-22 | `server/tests/api/checkout-concurrency.test.ts` |
| AC-23 | BR-16, NFR-09 | TEST-23 | `server/tests/api/checkout-history.test.ts` |
| AC-24 | BR-16 | TEST-24 | `server/tests/api/checkout-history.test.ts` |
| AC-25 | NFR-12 | TEST-25 | `client/tests/PendingRequestsPage.test.tsx` |
| AC-26 | FR-08, FR-16 | TEST-26 | `server/tests/api/checkout.test.ts` |
| AC-41 | NFR-01 | TEST-41 | `server/tests/api/checkout-access.test.ts` |
| AC-06 (F-01) | NFR-02 | TEST-41 (b) | `server/tests/api/checkout-access.test.ts` |
| AC-42 | FR-16 | TEST-42 | `server/tests/api/checkout.test.ts` |
| AC-43 | FR-16 | TEST-43, TEST-49 | `server/tests/api/checkout.test.ts`, `server/tests/unit/transitions.test.ts` |
| AC-44 | FR-16 | TEST-44 | `server/tests/api/checkout.test.ts` |
| AC-45 | FR-16, BR-02 | TEST-44 | `server/tests/api/checkout.test.ts` |
| AC-46 | FR-16, BR-02 | TEST-42 | `server/tests/api/checkout.test.ts` |
| AC-47 | FR-16 | TEST-45 | `server/tests/api/checkout-concurrency.test.ts` |
| AC-48 | FR-16, D-17 | TEST-46 | `server/tests/api/units.test.ts` |
| AC-49 | FR-16, D-17 | TEST-47 | `client/tests/CheckoutDialog.test.tsx` |
