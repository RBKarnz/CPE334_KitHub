# F-10 Reservation and expiry of approved requests: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-10 Reservation and expiry of approved requests |
| Sprint | 3 (due 2026-12-13); implementation planned 30 Nov to 6 Dec (`plan.md` 6.3) |
| Version | 1.1 |
| Status | Proposed (PR for #107); implementation starts only after this contract is reviewed and merged |
| Date | 2026-11-27 |
| Authors | Teerakarn Noiruksa (67070501062); reviewer Methipat Mansap (67070501071) |
| Baseline | SRS v1.7 (D-22, D-23), System-Level SDS v1.15 (4.5, 4.7; both changed in this PR), F-04 v1.0, F-05 v1.0, F-06 v1.1, F-07 v1.0, F-11 v1.2, F-12 v1.1, F-14 v1.1 |
| Issues | #107 this feature; #106 (Q-07, Q-09 settled as D-22, D-23); #76 F-06 (approval starts the window), #77 F-07 (checkout ends it) |
| Definition of Done | [Product Definition of Done](../sprint-1/definition-of-done.md) and section 9 of this contract |
| AC/TEST block | 122 to 131 (claimed in #107) |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-27 | Teerakarn Noiruksa | First contract: AC-122 to AC-131, TEST-122 to TEST-131, decisions F10-D1 to F10-D9 |
| 1.1 | 2026-11-27 | Teerakarn Noiruksa | Review of PR #119: expiry locks the ended requests with `SELECT … ORDER BY id FOR UPDATE` before the update, because an `UPDATE … ANY($ids)` locks in plan order, not array order (3.5, 3.8); the available count is one SQL statement, so a checkout committing in between cannot be missed (3.6, 3.8, F10-D10); 3.3 lists `GET /api/history` (F13-D5); baseline SRS v1.7, SDS v1.15. No AC changed |

Changes after approval get a new version row with the reason. AC and TEST IDs are never reused for a different meaning.

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What F-10 does with it |
| --- | --- | --- |
| Functional | FR-15 | An `APPROVED` request not checked out within its pickup window becomes `EXPIRED`, recorded with the System actor; its reservation is released |
| Functional (rule added from Sprint 3) | FR-07, FR-10, FR-11, FR-13, FR-17 | Create, edit and approval count reserved quantities (BR-01); checkout of an expired request is rejected (BR-13) |
| Business rules | BR-01 (reserved units), BR-13, BR-16 | Available = `AVAILABLE` units minus the quantities of `APPROVED` requests; 48-hour pickup window; the expiry has a history entry |
| Business rules (kept) | BR-04, BR-09, BR-10, BR-14 | An `EXPIRED` request is not open, so it no longer blocks BR-04 and no longer counts for BR-14 (D-20) |
| Non-functional | NFR-05, NFR-09 | Two approvals cannot reserve the same last unit; a request is expired once, with one entry |
| SRS decisions | D-15, D-20, D-22, D-23 | D-15 moves reservations to Sprint 3; D-22 sets the window; D-23 applies expiry on use |
| SDS | 4.5 "Available units" and "Expiry of approved requests", 4.7 "Reservations", 6.5 `REQUEST_EXPIRED`, 6.6 "Expiry of approved requests", DD-04, DD-08, DD-13 | Used as written in SDS v1.15, which this PR brings in line with 3.5, F10-D6 and F10-D10 |

### 2.2 Depends on

| Feature | What F-10 needs | Status |
| --- | --- | --- |
| F-06 (#76) | `decidedAt` of an approval; the approve transaction | On `main` (`v0.2.0`) |
| F-07 (#77) | The checkout transaction and its check order | On `main` |
| F-04, F-05 (#74, #75) | `assertRequestRules` (BR-01) for create and edit | On `main` |
| F-11 (#108) | `assertRequestRules` with BR-14 and BR-15; F-11 2.3 expects create and edit to expire first | On `staging` (PR #117) |
| F-12 (#109) | `GET /api/item-types` returns `availableCount`; when F-12 is in, it uses the same count | Contract merged; code planned (Teerakarn) |

### 2.3 Out of scope for F-10

| Item | Where |
| --- | --- |
| A scheduled job, Cloud Scheduler or any new GCP component | Not used (D-23) |
| Holidays | No holiday calendar (D-22, as D-21) |
| Reminders before expiry, e-mail | Not in the SRS |
| A setting for the window length | The 48 hours are fixed by BR-13 (F10-D8) |
| The inventory report | F-14 counts unit states and `CHECKED_OUT` requests only, so it does not apply expiry (F14-D6) |
| History pages | F-13 (#110) shows the expiry entries that F-10 writes |

## 3. Feature-level design (Feature SDS)

### 3.1 Behaviour and workflow

1. **Pickup window (D-22).** When a Custodian approves a request (F-06), `decidedAt` is the approval time. The window ends after 48 hours counted only on Monday to Friday (ICT): `pickupWindowEnd(decidedAt)` (3.4). Nothing is stored; the end is computed when needed (DD-08).
2. **Reservation (BR-01, BR-13).** While a request is `APPROVED`, its line quantities are reserved: the available count of an item type is its `AVAILABLE` units minus the quantities on lines of `APPROVED` requests for it, and never below 0 (F10-D2). A `PENDING` request reserves nothing (D-15).
3. **Expiry on use (D-23).** The services listed in 3.3 first call `expireEndedRequests(tx, now)` in their transaction: it reads the `APPROVED` requests, keeps those with `now >= pickupWindowEnd(decidedAt)`, and runs one conditional update for them (3.5). Only the IDs that the update returns get a history entry.
4. **Checkout of an expired request.** In the checkout transaction, expiry runs first; a request that is then `EXPIRED` is rejected with `409 REQUEST_EXPIRED` (BR-13) and nothing is created.
5. **Approval with reservations.** Approval locks the item type rows of the request's lines, computes the available count of each (2.), and rejects with `409 ITEM_TYPE_UNAVAILABLE` if a line needs more than is available. Otherwise the request becomes `APPROVED` as in F-06, which reserves its quantities.
6. **Release.** A reservation ends when its request leaves `APPROVED`: checkout (the reserved units become loans), cancel by the Borrower, or expiry. Nothing has to be written for the release, because the count is derived.

### 3.2 State changes

| From | To | Trigger | Actor | Sprint |
| --- | --- | --- | --- | --- |
| `APPROVED` | `EXPIRED` | The pickup window has ended (`now >= windowEnd`) and a read or action of 3.3 runs | System (`actorType = SYSTEM`, no user, DD-13) | 3 |

`EXPIRED` is final (SRS 8.2). Approve, reject, edit, cancel, checkout and return of an `EXPIRED` request are rejected (`409 INVALID_STATE`, except checkout: `409 REQUEST_EXPIRED`).

### 3.3 Where expiry is applied (D-23)

| Call | Why it depends on request states or availability | Expiry runs |
| --- | --- | --- |
| `GET /api/requests` (all filters, also `?overdue=true`), `GET /api/requests/:id` | Shows request states | In one transaction with the read |
| `GET /api/categories`, `GET /api/item-types/:id`, `GET /api/item-types` (F-12) | Shows available counts | In one transaction with the read |
| `POST /api/requests`, `PATCH /api/requests/:id` | BR-01, BR-04, BR-14 depend on open requests | First statement after the Borrower row lock (DD-05) |
| `POST /api/requests/:id/approve`, `/reject` | Approval reserves; both need `PENDING` | First statement of the transaction |
| `POST /api/requests/:id/cancel` | Needs `PENDING` or `APPROVED` | After the Borrower row lock |
| `POST /api/requests/:id/checkout` | Needs `APPROVED` (BR-13) | First statement of the transaction |
| `GET /api/history` (F-13) | Shows request states and their history | In one transaction with the read (F13-D5) |
| Not applied: `GET /api/loans`, returns, unit and catalog management, `GET /api/reports/inventory`, auth | They read or change loans, units or the catalog only, never an `APPROVED` request | - |

A rejected action rolls back its transaction, and the expiry in it too. That is harmless: the next call expires the same requests again with the same `occurredAt` (the window end), so the stored result is the same (F10-D7).

### 3.4 Pickup window (D-22)

`pickupWindowEnd(decidedAt)`: start at `decidedAt` in ICT; if it is on a Saturday or Sunday, start at the next Monday 00:00 ICT. Add 48 hours, counting only the time on Monday to Friday; whole Saturdays and Sundays are skipped, night hours count. The request is expired from the end itself (`now >= windowEnd`). Worked examples (checked with a script before writing this table):

| Approved (ICT) | `decidedAt` (UTC) | Window ends (ICT) | Window end (UTC) |
| --- | --- | --- | --- |
| Mon 30 Nov 2026 10:00 | `2026-11-30T03:00:00.000Z` | Wed 2 Dec 10:00 | `2026-12-02T03:00:00.000Z` |
| Mon 30 Nov 23:00 | `2026-11-30T16:00:00.000Z` | Wed 2 Dec 23:00 (D-22 example) | `2026-12-02T16:00:00.000Z` |
| Wed 2 Dec 00:00 | `2026-12-01T17:00:00.000Z` | Fri 4 Dec 00:00 | `2026-12-03T17:00:00.000Z` |
| Thu 3 Dec 10:00 | `2026-12-03T03:00:00.000Z` | Mon 7 Dec 10:00 (24 h Thu–Fri, 24 h Fri–Mon over the weekend) | `2026-12-07T03:00:00.000Z` |
| Fri 4 Dec 15:00 | `2026-12-04T08:00:00.000Z` | Tue 8 Dec 15:00 (D-22 example) | `2026-12-08T08:00:00.000Z` |
| Fri 4 Dec 23:30 | `2026-12-04T16:30:00.000Z` | Tue 8 Dec 23:30 | `2026-12-08T16:30:00.000Z` |
| Sat 5 Dec 10:00 | `2026-12-05T03:00:00.000Z` | Wed 9 Dec 00:00 (counts from Mon 00:00) | `2026-12-08T17:00:00.000Z` |
| Sun 6 Dec 23:59 | `2026-12-06T16:59:00.000Z` | Wed 9 Dec 00:00 | `2026-12-08T17:00:00.000Z` |

The function works on ICT calendar dates (UTC+7, no daylight saving), so it does not depend on the server time zone, as `computeDueAt` (D-21).

### 3.5 Expiry statement (SDS 4.5)

```sql
SELECT id FROM borrow_requests
WHERE id = ANY($ids) AND status = 'APPROVED'
ORDER BY id
FOR UPDATE;

UPDATE borrow_requests
SET status = 'EXPIRED', "updatedAt" = $now
WHERE id = ANY($ids) AND status = 'APPROVED'
RETURNING id;
```

- `$ids` are the ended requests found by the read of 3.1 step 3. The `SELECT … ORDER BY id FOR UPDATE` locks them in ascending ID first, so two transactions that expire overlapping sets take the locks in the same order. The `UPDATE` alone would lock rows in the order its plan visits them (a sequential scan visits heap order, which is not ID order once rows have been updated), so the order would not be guaranteed.
- A row that another transaction expired meanwhile is returned by neither statement (READ COMMITTED re-checks `status = 'APPROVED'` after the lock), so it gets no second entry.
- `"updatedAt"` is set in the statement because Prisma's `@updatedAt` is filled only for calls through the client, not for raw SQL, and there is no trigger.
- For each returned ID, one history entry: `entityType = REQUEST`, `action = STATUS_CHANGED`, `fromStatus = APPROVED`, `toStatus = EXPIRED`, `actorType = SYSTEM`, `actorUserId = null`, `requestId`, `occurredAt` = that request's window end (set explicitly, not the database default), `details = null`.
- When `$ids` is empty, no statement runs.

### 3.6 Business rules and where they are enforced

| Rule | UI | Route | Service | Domain | Database |
| --- | --- | --- | --- | --- | --- |
| D-22 window | "Pick up by …" (4.2) | - | Adds `pickupBy` to the view | `pickupWindowEnd(decidedAt)`, `isPickupWindowEnded(decidedAt, now)` | - |
| FR-15, BR-13 expiry | "Expired" badge (exists) and "Not picked up by …" | - | `expireEndedRequests(tx, now)` in every call of 3.3 | The same two functions | Conditional update (3.5); index `(status, createdAt)` serves the read of `APPROVED` requests |
| BR-01 reserved units | The counts the API returns | - | One SQL statement (one snapshot, F10-D10): `AVAILABLE` units per item type minus `APPROVED` line quantities, used by the catalog, create, edit and approve | `availableAfterReservations(available, reserved)` = `max(0, available − reserved)` | - |
| BR-13 checkout of an expired request | The API message in the checkout dialog | - | In checkout, after expiry: status `EXPIRED` → `409 REQUEST_EXPIRED` | - | - |
| BR-01 on approval | The API message in the approve dialog | - | Lock item types, then compare each line with the available count | `requestRuleViolation` lines check reused | `SELECT ... FROM item_types WHERE id = ANY($ids) ORDER BY id FOR UPDATE` |

### 3.7 Check orders (changed)

- **Create and edit** (F-11 3.5): `415` → `401` → `403` → `400` → Borrower row lock → **expiry** → `404` → BR-15 → BR-04 → BR-07 → BR-08 → BR-14 → BR-01 (with reservations). An expired request is no longer open, so it does not trigger BR-04 and does not count for BR-14.
- **Approve**: `401` → `403` → `400` → **expiry** → `404` → `409 INVALID_STATE` (not `PENDING`) → **lock item types** → `409 ITEM_TYPE_UNAVAILABLE` (BR-01 with reservations of other `APPROVED` requests; the request itself is `PENDING`, so it reserves nothing yet).
- **Checkout** (F-07): `401` → `403` → `400` → **expiry** → `404` → `400` (line references) → **`409 REQUEST_EXPIRED`** when the request is `EXPIRED` → `409 INVALID_STATE` for every other state that is not `APPROVED` → unit checks as F-07.

### 3.8 Concurrency (SDS 4.7)

- **Lock order.** Every transaction takes its locks in this order: the Borrower's `users` row (create, edit, cancel) → the ended `APPROVED` requests in ascending ID (the expiry's `SELECT … ORDER BY id FOR UPDATE`, 3.5) → the request acted on → item types in ascending ID (approval) → units in ascending ID (checkout). The same order everywhere prevents deadlocks. The request acted on can be one of the expired ones (checkout of an ended request); then it is already locked by the expiry.
- **Expired once (AC-129).** Two calls that find the same ended request run the same conditional update. Under READ COMMITTED the second waits for the first's row lock, then re-checks `status = 'APPROVED'`, gets no row and writes no entry.
- **Two approvals of the last units (AC-130).** Both lock the item type rows, so the second computes the count after the first commits and sees its reservation.
- **The available count is one statement (F10-D10).** Checkout does not take the item type lock, so a checkout of another request R′ can commit while an approval runs. If the count were two statements under READ COMMITTED (`AVAILABLE` units, then `APPROVED` quantities), the first could still count R′'s units as `AVAILABLE` and the second no longer see R′ as `APPROVED`, so R′'s units would look free and the approval could over-reserve. One statement reads one snapshot, which sees R′ either before its checkout (units `AVAILABLE` and reserved) or after it (units `ON_LOAN`, not reserved); both give the same free count. The same holds for create and edit, as for F-11's held count (PR #117).
- **Create does not lock item types (F10-D6).** A create reserves nothing; BR-01 at create is a check at that moment (SRS), and approval is the step that must not over-reserve.
- **Checkout and reservations.** A checkout gives each line exactly its quantity (F-07) from `AVAILABLE` units, and its own request's reservation ends at the same moment, so the available count of other requests does not change. Approval never reserves more than `AVAILABLE` units (5.), so the units of every `APPROVED` request are there at checkout, unless a Custodian moved a unit out of `AVAILABLE` meanwhile (F10-D2).

### 3.9 Decisions made in this contract

| ID | Decision | Rationale |
| --- | --- | --- |
| F10-D1 | `now` is the application's `new Date()`, taken once per call; the window end comes from `decidedAt` with `pickupWindowEnd` | One clock per call, which tests can fix with `vi.useFakeTimers({ toFake: ["Date"] })`, as F11-D1 and D-21 |
| F10-D2 | The available count is `max(0, AVAILABLE units − APPROVED line quantities)`. Retiring or repairing units is not blocked by reservations; if a Custodian takes a reserved unit out of `AVAILABLE`, the count shows 0 and the checkout of that request may find too few units (`409 UNIT_NOT_AVAILABLE`, as today) | BR-12 and FR-26 do not mention reservations; a negative count would confuse Borrowers; the Custodian who retires the unit knows why |
| F10-D3 | Every request representation gains `pickupBy`: the window end for `APPROVED` and `EXPIRED` requests, `null` for every other state | The Borrower and the Custodian see the deadline; an expired request shows when it ended |
| F10-D4 | `REQUEST_EXPIRED` message: "Request #12 has expired: it was not checked out within 48 hours of approval." No `details` | The Custodian learns why the checkout failed; the Borrower must submit a new request |
| F10-D5 | The approval rejection reuses `ITEM_TYPE_UNAVAILABLE` and the F-04 message ("Arduino Uno R3 has only 1 available unit; you asked for 2."), with one `details` entry per short line (`field: "lines[i].itemTypeId"`, `issue: "1 available"`) | Same rule (BR-01), same code and text the UI already shows (DD-10) |
| F10-D6 | Approval locks the item type rows; create and edit do not. SDS 4.7 "Reservations" is changed to say so (SDS v1.15) | Only approval reserves, so only approval can over-reserve; a lock on create would serialize Borrowers of the same item type for no gain |
| F10-D7 | Expiry runs inside the transaction of the call, as D-23 says, and is rolled back with a rejected action; the next call writes the same result | Keeps one transaction per call; `occurredAt` is the window end, not the time of the check, so a later expiry gives the same history |
| F10-D8 | 48 hours is a constant in the domain module, not a setting | BR-13 fixes the number (as F11-D6) |
| F10-D9 | Expiry reads every `APPROVED` request, not only the caller's | The available counts of every Borrower depend on every reservation; the number of `APPROVED` requests at a time is small (a few per Custodian per day) |
| F10-D10 | The available count with reservations is computed in one SQL statement (subqueries for `AVAILABLE` units and `APPROVED` quantities per item type), with a code comment saying why, so it is never split into two Prisma calls | Two statements see two snapshots and can miss a checkout that commits between them (3.8) |

## 4. UI specification

### 4.1 Layers changed by F-10

| Layer | Change |
| --- | --- |
| UI | "Pick up by …" for `APPROVED` and "Not picked up by …" for `EXPIRED` requests on My requests, request detail and All requests; the Custodian detail history shows the System entry (exists: `actor` null is shown as "System") |
| API | `pickupBy` in the request representation; `409 REQUEST_EXPIRED` from checkout; `409 ITEM_TYPE_UNAVAILABLE` from approve; reserved units subtracted from `availableCount` |
| Domain | `pickupWindowEnd`, `isPickupWindowEnded`, `availableAfterReservations`, `PICKUP_WINDOW_HOURS = 48` |
| Database | No schema change and no migration (SDS 4.5: no stored column) |

### 4.2 Borrower: My requests and request detail

| Element | Behaviour |
| --- | --- |
| `APPROVED` request | Under the status badge: "Pick up by 8 Dec 2026, 15:00" (SDS 5.3 time format) |
| `EXPIRED` request | The "Expired" badge (exists) and "Not picked up by 8 Dec 2026, 15:00" |
| Catalog, item type detail, request form | Unchanged; the available counts already come from the API |

### 4.3 Custodian: All requests, request detail and checkout dialog

| Element | Behaviour |
| --- | --- |
| All requests and detail | The same two lines as 4.2 |
| Detail history | The expiry entry: time = window end, actor "System", "Approved → Expired" (the existing history table) |
| Checkout dialog | `409 REQUEST_EXPIRED` is shown as the dialog's alert with the API message (SDS 5.3 "Rule rejection"); closing the dialog reloads the request, which now shows "Expired" |
| Approve dialog | `409 ITEM_TYPE_UNAVAILABLE` is shown as the dialog's alert; the request stays `PENDING` |

## 5. API specification

### 5.1 Request representation (changed)

Every request object gains `pickupBy: string | null` (F10-D3). Example: approved at `2026-12-04T08:00:00.000Z` (Fri 15:00 ICT) → `"pickupBy": "2026-12-08T08:00:00.000Z"`, `status` `APPROVED` until that instant, `EXPIRED` from it.

### 5.2 Endpoints with changed results

| Endpoint | Change |
| --- | --- |
| `GET /api/requests`, `GET /api/requests/:id` | Expiry first (3.3); `pickupBy` |
| `GET /api/categories`, `GET /api/item-types/:id`, `GET /api/item-types` | Expiry first; `availableCount` subtracts reservations (F10-D2) |
| `POST /api/requests`, `PATCH /api/requests/:id` | Expiry first; BR-01 uses the reserved count, so `409 ITEM_TYPE_UNAVAILABLE` can come from a reservation |
| `POST /api/requests/:id/approve` | New outcome `409 ITEM_TYPE_UNAVAILABLE` (F10-D5); request stays `PENDING` |
| `POST /api/requests/:id/reject`, `/cancel` | Expiry first; an ended request is `EXPIRED`, so `409 INVALID_STATE` ("… because it is EXPIRED") |
| `POST /api/requests/:id/checkout` | New outcome `409 REQUEST_EXPIRED` (F10-D4) |

No new endpoint. Expiry has no route (SDS 6.6).

## 6. Data specification

### 6.1 Schema and migrations

No change. `borrow_requests.decidedAt` (Sprint 2) starts the window; `updatedAt` exists; `RequestStatus.EXPIRED` and `ActorType.SYSTEM` exist since the first migration.

### 6.2 Tables read and written

| Table | Read | Written |
| --- | --- | --- |
| `borrow_requests` | `APPROVED` requests with `decidedAt`; states | `status`, `updatedAt` by the expiry statement only |
| `request_lines` | Quantities of `APPROVED` requests per item type | - |
| `units` | `AVAILABLE` counts per item type | - (checkout as F-07) |
| `item_types` | Row lock on approval | - |
| `history_entries` | - | One `STATUS_CHANGED` entry per expired request (System actor) |

## 7. Acceptance criteria

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-122 | `pickupWindowEnd` gives the window end of every row of 3.4 (48 hours on Monday to Friday ICT, weekends skipped, a weekend approval counted from Monday 00:00) | FR-15, D-22 |
| AC-123 | An `APPROVED` request read 1 ms before its window end is `APPROVED` with `pickupBy` = the window end; read at the window end it is `EXPIRED`, for its Borrower and for a Custodian, in the list and the detail. Exactly one history entry is written: `STATUS_CHANGED` `APPROVED` → `EXPIRED`, System actor, `occurredAt` = the window end; a second read writes none | FR-15, BR-13, BR-16, NFR-09, D-23, F10-D3 |
| AC-124 | `availableCount` in `GET /api/categories` and `GET /api/item-types/:id` is the `AVAILABLE` units minus the quantities of `APPROVED` requests, never below 0; a `PENDING` request reserves nothing; checkout, cancel and expiry each release the reservation | BR-01, BR-13, D-15, F10-D2 |
| AC-125 | A create or edit that needs more units than the unreserved count is rejected with `409 ITEM_TYPE_UNAVAILABLE` and nothing is stored; once the reserving request has expired, the same create succeeds. An expired request no longer blocks the same item type (BR-04) and no longer counts toward the 5-unit limit (BR-14) | BR-01, BR-04, BR-14, D-20, D-23 |
| AC-126 | Approving a request whose line needs more units than are available after the other `APPROVED` requests' reservations is rejected with `409 ITEM_TYPE_UNAVAILABLE` naming the first short line, with one `details` entry per short line; the request stays `PENDING` and nothing is written | BR-01, BR-13, F10-D5 |
| AC-127 | Checkout of a request whose window has ended is rejected with `409 REQUEST_EXPIRED`; no loan is created and no unit changes; the request then reads as `EXPIRED` with one System entry. Checkout 1 ms before the window end succeeds | BR-13, FR-17, F10-D4 |
| AC-128 | After the window end, cancel and reject of the request give `409 INVALID_STATE` naming `EXPIRED`, and nothing else changes | BR-10, SRS 8.2 |
| AC-129 | Two simultaneous reads of an ended `APPROVED` request leave it `EXPIRED` with exactly one history entry | NFR-05, NFR-09, D-23 |
| AC-130 | Two simultaneous approvals of two requests that each fit the unreserved units but not together give one `200` and one `409 ITEM_TYPE_UNAVAILABLE`; the reserved quantity never exceeds the `AVAILABLE` units | BR-01, BR-13, NFR-05, F10-D6 |
| AC-131 | The UI shows "Pick up by …" for `APPROVED` requests and "Not picked up by …" with the Expired badge for `EXPIRED` ones on My requests, request detail and All requests; the Custodian history shows the System entry; `REQUEST_EXPIRED` in the checkout dialog and `ITEM_TYPE_UNAVAILABLE` in the approve dialog are shown as the dialog's alert | FR-15, BR-13, NFR-12 |

## 8. Software Test Specification (STS)

### 8.1 Conventions

- Test data comes from the existing helpers (`createCheckoutWorld`, factories, `postRequest`, `postDecision`, `postCheckout`, `snapshotRequestState`); never the demo seed.
- Approvals go through the real `POST /api/requests/:id/approve` at a fixed clock, so `decidedAt` is the clock's time. Times are fixed with `vi.useFakeTimers({ toFake: ["Date"] })` and moved with `vi.setSystemTime(...)`; only JavaScript `Date` is faked. A test that moves the clock past 8 hours signs in again (session lifetime, F-11 evidence note).
- The expiry entry's `occurredAt` is compared with the window end exactly, because the service sets it (3.5); other database defaults are not compared with the fake clock.
- **TDD**: the RED commit adds TEST-122 to TEST-131 and runs them on the pre-change code. Every failure must be an assertion (a missing function read through a loose module view, as F-11's unit test; `APPROVED` where `EXPIRED` is expected; `201` where `409` is expected; a missing `pickupBy`), not an import or type error.

### 8.2 Test cases

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-122 **TDD** | AC-122 | Unit | The eight `decidedAt` values of 3.4 | `pickupWindowEnd(decidedAt)`; `isPickupWindowEnded(decidedAt, end − 1 ms)` and `(decidedAt, end)` for row 5 | Each end as in 3.4; `false` then `true` | `server/tests/unit/pickup-window.test.ts` |
| TEST-123 **TDD** | AC-123 | API | B1's request R (1 Arduino), approved Fri 4 Dec 15:00 ICT (`2026-12-04T08:00:00.000Z`) | (a) at `2026-12-08T07:59:59.999Z`: Borrower detail and list, Custodian detail; (b) at `2026-12-08T08:00:00.000Z`: Borrower list, then detail, then Custodian detail; (c) count entries of R | (a) `APPROVED`, `pickupBy` `2026-12-08T08:00:00.000Z`, no expiry entry. (b) `EXPIRED` in every read, `pickupBy` unchanged. (c) exactly one entry `STATUS_CHANGED` `APPROVED` → `EXPIRED`, `actorType` `SYSTEM`, `actorUserId` null, `occurredAt` `2026-12-08T08:00:00.000Z`; R's `updatedAt` = the read time | `server/tests/api/expiry.test.ts` |
| TEST-124 **TDD** | AC-124 | API | Item type A with 3 `AVAILABLE` units; B1 request P1 (2 of A, `PENDING`); B2 request P2 (1 of A) approved Mon 30 Nov 10:00 ICT | (a) categories and item type detail; (b) approve P1 at 10:05; read; (c) B2 cancels P2; read; (d) P1 checked out with 2 units; read; (e) new B2 request for 1 of A approved, clock to its window end; read | (a) A: 2 (3 − P2's 1; P1 reserves nothing). (b) 0 (3 − 2 − 1). (c) 1. (d) 1 (1 unit `AVAILABLE`, nothing reserved). (e) before the end 0, at the end 1. Both endpoints give the same number each time | `server/tests/api/reservations.test.ts` |
| TEST-125 **TDD** | AC-125 | API | A with 2 `AVAILABLE` units; B2's request R2 (2 of A) approved Mon 30 Nov 10:00 ICT; B1 holds 3 units and B2 3 `ACTIVE` loans (F-11 helper, loans due Thu 10 Dec, so nobody is overdue) | (a) at Tue 1 Dec 10:00 ICT B1 creates 1 of A; (b) B1 has a `PENDING` request P (1 of another item type) and edits it to 1 of A; (c) at Wed 2 Dec 10:00 ICT (R2's window end) B1 creates 1 of A; (d) B2 creates 2 of A | (a) `409 ITEM_TYPE_UNAVAILABLE` "Arduino Uno R3 has no available units."; Unchanged. (b) `409 ITEM_TYPE_UNAVAILABLE`; P unchanged. (c) `201`; R2 now `EXPIRED`. (d) `201`: R2 no longer blocks BR-04 and B2 holds 3 + 2 = 5 (R2's 2 not counted, BR-14) | `server/tests/api/reservations.test.ts` |
| TEST-126 **TDD** | AC-126 | API | A with 3 `AVAILABLE` units, B with 1; requests of three Borrowers: B1's R1 (2 of A) approved; B2's R2 `PENDING` (2 of A, 1 of B); B3's R3 `PENDING` (1 of A) | (a) approve R2; (b) approve R3 | (a) `409 ITEM_TYPE_UNAVAILABLE` "Arduino Uno R3 has only 1 available unit; you asked for 2.", `details` `[{ field: "lines[0].itemTypeId", issue: "1 available" }]`; R2 `PENDING`; no history entry. (b) `200`; A's count 0 | `server/tests/api/reservations.test.ts` |
| TEST-127 **TDD** | AC-127 | API | A has 4 `AVAILABLE` units; B1's R and B2's R' (2 of A each) approved Thu 3 Dec 10:00 ICT (window end Mon 7 Dec 10:00 ICT, `2026-12-07T03:00:00.000Z`) | (a) at `2026-12-07T02:59:59.999Z` check out R' with two units; (b) at `2026-12-07T03:00:00.000Z` check out R with the other two; snapshot before and after; (c) read R | (a) `201`, R' `CHECKED_OUT`. (b) `409 REQUEST_EXPIRED` with the F10-D4 message; no loan, both units `AVAILABLE`. (c) `EXPIRED`, one System entry with `occurredAt` `2026-12-07T03:00:00.000Z` | `server/tests/api/expiry.test.ts` |
| TEST-128 **TDD** | AC-128 | API | R approved Mon 30 Nov 10:00 ICT; another request Q `PENDING` | At Wed 2 Dec 10:00 ICT: (a) B1 cancels R; (b) a Custodian rejects R; (c) a Custodian approves Q | (a), (b) `409 INVALID_STATE`, message names `EXPIRED`; R unchanged after its one expiry entry. (c) `200` (expiry of R ran first and did not block Q) | `server/tests/api/expiry.test.ts` |
| TEST-129 **TDD** | AC-129 | Integration | R approved; clock at its window end | `Promise.all` of `GET /api/requests/R` as the Borrower and `GET /api/requests` as a Custodian; 5 rounds with fresh data | Each round: both `200` with `EXPIRED`; exactly one expiry entry for R | `server/tests/api/expiry-concurrency.test.ts` |
| TEST-130 **TDD** | AC-130 | Integration | A with 3 `AVAILABLE` units; `PENDING` R1 (2 of A) and R2 (2 of A) of two Borrowers | `Promise.all` of approving R1 and R2; 5 rounds with fresh data | Each round: one `200`, one `409 ITEM_TYPE_UNAVAILABLE`; A's count is 1; reserved (2) ≤ `AVAILABLE` (3) | `server/tests/api/expiry-concurrency.test.ts` |
| TEST-131 **TDD** | AC-131 | UI | App rendered with `fetch` stubbed: an `APPROVED` request with `pickupBy` `2026-12-08T08:00:00.000Z`, an `EXPIRED` one, a Custodian detail whose history has an entry with `actor` null | (a) Borrower My requests and detail; (b) Custodian All requests and detail; (c) checkout dialog, the stub answers `409 REQUEST_EXPIRED`; (d) approve dialog, the stub answers `409 ITEM_TYPE_UNAVAILABLE` | (a), (b) "Pick up by 8 Dec 2026, 15:00"; "Expired" and "Not picked up by …"; (b) the history row "System", "Approved → Expired". (c), (d) the API message as the dialog's alert; the dialog stays open | `client/tests/expiry.test.tsx` |

### 8.3 Coverage checks

- Each AC-n has TEST-n; every new `409` has an API test with Unchanged (TEST-125 to TEST-128).
- The boundaries are tested on both sides: window end ± 1 ms (TEST-122, TEST-123, TEST-127); a weekend inside the window (TEST-127) and a weekend approval (TEST-122).
- Concurrency: TEST-129 (expired once) and TEST-130 (no over-reservation), 5 rounds each.
- Regression: the whole server, client and E2E suites run on the GREEN commit. Existing tests that approve and then read later (F-06, F-07, F-08, F-14) must not cross a window end by accident; a test that needs a fixed clock because of F-10 is revised and listed in the PR.

## 9. Definition of Done (F-10)

- This contract reviewed by Methipat Mansap and merged into `staging` before any F-10 code.
- RED commit with TEST-122 to TEST-131 only; output kept in `docs/sprints/sprint-3/evidence/F-10/` with the commit SHA, every failure an assertion.
- GREEN implementation commit; the same tests pass; whole server, client and E2E suites pass with counts recorded.
- PR into `staging` reviewed by the other student; CI `test-and-docker` green; no test skipped or weakened.
- `docs/features.md` 6.1 and the `docs/traceability.md` rows for FR-15 and BR-13 moved to Implemented with the commits.

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-122 | FR-15, D-22 | TEST-122 | `server/tests/unit/pickup-window.test.ts` |
| AC-123 | FR-15, BR-13, BR-16, NFR-09 | TEST-123 | `server/tests/api/expiry.test.ts` |
| AC-124 | BR-01, BR-13 | TEST-124 | `server/tests/api/reservations.test.ts` |
| AC-125 | BR-01, BR-04, BR-14 | TEST-125 | `server/tests/api/reservations.test.ts` |
| AC-126 | BR-01, BR-13 | TEST-126 | `server/tests/api/reservations.test.ts` |
| AC-127 | BR-13, FR-17 | TEST-127 | `server/tests/api/expiry.test.ts` |
| AC-128 | BR-10 | TEST-128 | `server/tests/api/expiry.test.ts` |
| AC-129 | NFR-05, NFR-09 | TEST-129 | `server/tests/api/expiry-concurrency.test.ts` |
| AC-130 | BR-01, NFR-05 | TEST-130 | `server/tests/api/expiry-concurrency.test.ts` |
| AC-131 | FR-15, BR-13 | TEST-131 | `client/tests/expiry.test.tsx` |
