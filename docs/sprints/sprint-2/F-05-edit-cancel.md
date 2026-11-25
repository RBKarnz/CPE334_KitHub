# F-05 Edit and cancel requests: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-05 Edit and cancel requests |
| Sprint | 2 (due 2026-11-29) |
| Version | 1.0 |
| Status | Proposed (PR for #75); implementation starts only after this contract is reviewed and merged |
| Date | 2026-11-25 |
| Authors | Methipat Mansap (67070501071); reviewer Teerakarn Noiruksa (67070501062) |
| Baseline | SRS v1.3 (v1.4 after #71), System-Level SDS v1.8 (Sprint 2 columns from #73), F-02 contract v1.3, F-04 contract v1.0 (#74) |
| Issues | #75 this feature; #74 F-04 (body schema, rule check, `RequestForm`); #73 `loanDays` |
| Definition of Done | [Product Definition of Done](../sprint-1/definition-of-done.md) and section 9 of this contract |
| AC/TEST block | 72 to 79 (claimed in #75) |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-25 | Methipat Mansap | First contract: AC-72 to AC-79, TEST-72 to TEST-79, decisions F05-D1 to F05-D8 |

Changes after approval get a new version row with the reason. AC and TEST IDs are never reused for a different meaning.

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What F-05 does with it |
| --- | --- | --- |
| Functional | FR-11, FR-12 | A Borrower edits their own `PENDING` request (lines, quantities, loan length), recorded in history; a Borrower cancels their own `PENDING` or `APPROVED` request, which becomes `CANCELLED` |
| Business rules | BR-10, BR-16, BR-17 | Edit only own `PENDING`, cancel only own `PENDING` or `APPROVED`; history for every edit and state change; only Borrowers edit or cancel |
| Business rules (through the edit, same as a new request) | BR-01, BR-04, BR-06, BR-07, BR-08 | An edit is checked against the same rules as a new request (BR-10), with the F-04 rule order |
| Business rules (scope) | BR-05 | Another Borrower's request is `404`, as for reads |
| SRS state rows | 8.2 `PENDING` → `CANCELLED`, `APPROVED` → `CANCELLED` | The only transitions F-05 performs; an edit keeps the state |
| Non-functional | NFR-01, NFR-02, NFR-05, NFR-09, NFR-12 | Session and role checks; edit, cancel and decision races; history; UI states |

### 2.2 Depends on

| Dependency | What F-05 uses | Status on 2026-11-25 |
| --- | --- | --- |
| #73 Sprint 2 columns | `borrow_requests.loanDays` | PR #80 open |
| F-04 (#74) | Create body schema (F-04 3.4), `requestRuleViolation` with every line and the loan length, rule order F04-D3, messages F04-D4, `RequestForm` (F04-D8), `loanDays` in the representation (F04-D7) | Contract PR #84 |
| F-02 | Request detail, My requests, `StatusBadge`, Borrower scope, Borrower row lock | Done |
| F-06 (#76) | `APPROVED` requests exist; the approve and reject updates are conditional on `PENDING` (F-06 3.7) | Contract PR #81. F-05 code does not call F-06; tests create `APPROVED` requests with the factory |

### 2.3 Out of scope for F-05

| Not in F-05 | Arrives in |
| --- | --- |
| Editing an `APPROVED` request | Not allowed (BR-10). The Borrower cancels it and submits a new one (BR-04) |
| Cancelling by a Custodian | Not allowed (BR-17). A Custodian rejects a `PENDING` request instead (F-06) |
| Releasing reserved units on cancel | Sprint 3 (BR-13). In Sprint 2 a request reserves nothing (D-15), so a cancel changes no unit |
| A history view of the edits | Sprint 3, F-13 (FR-28); F-06 shows the request history to Custodians |

## 3. Feature-level design (Feature SDS)

### 3.1 Behaviour and workflow

**Edit (FR-11).**

1. On the detail of their own `PENDING` request the Borrower chooses **Edit request**, which opens `/requests/:id/edit`.
2. The page loads the request (`GET /api/requests/:id`) and the catalog, and shows `RequestForm` (F04-D8) filled with the request's lines and loan length. For a Sprint 1 request without a loan length, the field starts at the smallest maximum of its lines.
3. **Save changes** (enabled once the form differs from the loaded request) calls `PATCH /api/requests/:id` with the whole new content: `{ "lines": [ { "itemTypeId", "quantity" } ], "loanDays" }` (F05-D1).
4. The server runs `authenticate`, `requireRole("BORROWER")`, the strict schemas, then one transaction:
   1. Locks the Borrower's `users` row (SDS 4.7), then the request row (`SELECT … FOR UPDATE`), reading it only within the Borrower's scope (`404` otherwise).
   2. The request must be `PENDING` (`409 INVALID_STATE`).
   3. Reads every line's item type (`404`) and checks the F-04 rules in the F-04 order, where BR-04 ignores this request itself (F05-D3).
   4. If nothing changed, commits with no write (F05-D5). Otherwise updates `loanDays`, keeps the line of each item type that stays (with its new quantity), deletes the lines whose item type was removed, inserts the new ones, and writes one `EDITED` history entry (3.6).
5. The server returns `200` with the request. The UI goes back to `/requests/:id` and shows "Request #12 updated."

**Cancel (FR-12).**

1. On the detail of their own `PENDING` or `APPROVED` request the Borrower chooses **Cancel request**. A dialog asks "Cancel Request #12? You cannot undo this." with **Cancel request** and **Keep request** (SDS 5.3: cancel asks for confirmation).
2. The UI calls `POST /api/requests/:id/cancel` with `{}`.
3. One transaction: the request is read within the Borrower's scope (`404`); a conditional update `SET status = 'CANCELLED' WHERE id = :id AND status IN ('PENDING', 'APPROVED')`; 0 rows → re-read → `409 INVALID_STATE`; one history entry (3.6).
4. `200` with the request, now `CANCELLED`. The UI shows "Request #12 cancelled." and fetches the detail again.

Any failure rolls back: the request, its lines and the history stay as they were.

### 3.2 State changes

| Entity | From | To | SRS row | Trigger |
| --- | --- | --- | --- | --- |
| Request | `PENDING` | `PENDING` (edited) | - (BR-10, BR-16) | Edit by its Borrower; not a transition |
| Request | `PENDING` | `CANCELLED` | 8.2, Sprint 2 | Cancel by its Borrower |
| Request | `APPROVED` | `CANCELLED` | 8.2, Sprint 2 | Cancel by its Borrower |

`assertTransition("REQUEST", "PENDING" | "APPROVED", "CANCELLED")` is added to the transition table. No unit or loan changes (D-15).

### 3.3 Business rules and where they are enforced

| Rule | UI (hint only) | Route and middleware | Service (in the transaction) | Domain | Database |
| --- | --- | --- | --- | --- | --- |
| Borrower only (BR-17, NFR-02) | Edit and Cancel only for the owning Borrower | `requireRole("BORROWER")` on both | - | - | - |
| Own request only (BR-05, BR-10) | - | - | Read with `borrowerId = req.user.id`; otherwise `404`, the same as a missing request (DD-06) | - | - |
| Edit only `PENDING` (BR-10) | Edit only on `PENDING` | - | Request row locked, status checked → `409 INVALID_STATE` | - | - |
| Cancel only `PENDING` or `APPROVED` (BR-10, FR-12) | Cancel only on those states | - | Conditional update `WHERE status IN ('PENDING','APPROVED')` → `409 INVALID_STATE` | `assertTransition` | - |
| Edit checked as a new request (BR-10, BR-01, BR-04, BR-06, BR-07, BR-08) | `RequestForm` hints (F-04 4.3) | F-04 create body schema | F-04 rules and order; BR-04 ignores this request | `requestRuleViolation` | F-04 constraints |
| History (BR-16, NFR-09) | - | - | One entry per edit or cancel (3.6) | - | Append-only trigger |

### 3.4 Validation

| Input | Rule | Error |
| --- | --- | --- |
| Path `id` (edit, cancel) | Integer 1 to 2 147 483 647 | `400 VALIDATION_FAILED` naming `id` |
| Edit body | Exactly the F-04 create body (F-04 3.4): strict `{ lines, loanDays }`, 1 to 10 lines, distinct item types, quantity 1 to 10, `loanDays` 1 to 365, no `unitId`, `assetTag`, `borrowerId`, `status` or other field | `400` naming the field, as F-04 |
| Cancel body | Exactly `{}` | `400` naming the unknown field, for example `reason` |
| `Content-Type` | `application/json` (SDS 6.2) | `415` |

### 3.5 Check order

- Edit: `401` → `403` → `415` → `400` (path, then body) → transaction: lock Borrower row → `404` (request missing or not the caller's) → `409 INVALID_STATE` (not `PENDING`) → `404` (first line whose item type does not exist) → `409` rules in the F-04 order (BR-04, BR-07, BR-08, BR-01).
- Cancel: `401` → `403` → `415` → `400` (path, then body) → transaction: `404` → `409 INVALID_STATE`.

The state check comes before the rule checks so that a Borrower who edits a request that was just approved learns that, not a rule message about its lines.

### 3.6 History entries

One timestamp `now` per transaction; `actorType` `USER`, `actorUserId` the Borrower, `entityType` `REQUEST`, `requestId` the request, `unitId` and `loanId` null.

| Field | Edit | Cancel |
| --- | --- | --- |
| `action` | `EDITED` | `STATUS_CHANGED` |
| `fromStatus` → `toStatus` | null → null (no state change, SDS 4.2) | `PENDING` or `APPROVED` → `CANCELLED` |
| `details` | `{ "before": { "loanDays", "lines": [ { "itemTypeId", "quantity" } ] }, "after": { … } }`, lines ordered by `itemTypeId` (SDS 4.6) | null |

A no-change edit writes no entry (F05-D5).

### 3.7 Concurrency

| Race | Outcome |
| --- | --- |
| Two edits of the same request | The Borrower row lock runs them one after the other; both succeed, the second edit's content stays, two `EDITED` entries |
| Edit and cancel | The request row lock orders them. Edit first: both succeed and the request ends `CANCELLED` with the edited lines. Cancel first: the edit gets `409 INVALID_STATE` |
| Edit and approve (F-06) | The approve waits for the request row lock. Edit first: both succeed and the approval covers the edited request. Approve first: the edit gets `409 INVALID_STATE` |
| Cancel and approve (F-06) | Cancel first: the approve gets `409 INVALID_STATE`. Approve first: the cancel still succeeds, because `APPROVED` → `CANCELLED` is allowed (FR-12). Either way the request ends `CANCELLED` |
| Cancel and reject (F-06) | Exactly one succeeds; the other gets `409 INVALID_STATE` |
| Two cancels | Exactly one succeeds; the other gets `409 INVALID_STATE`; one history entry |
| Cancel and checkout (F-07) | Exactly one succeeds: the checkout needs `APPROVED` and the cancel moves it away, or the checkout moves it to `CHECKED_OUT` first |

In every case exactly the writes of the calls that succeeded are stored, each with its own history entry.

### 3.8 Decisions made in this contract

| ID | Decision | Reason |
| --- | --- | --- |
| F05-D1 | The edit is a `PATCH` that sends the whole new content (`lines` and `loanDays`), with the F-04 create schema | SDS 6.6 names `PATCH /api/requests/:id`. One schema and one rule check for create and edit is how BR-10 "checked against the same rules as a new request" is guaranteed. Lines have no fields of their own to patch one by one |
| F05-D2 | Every line of the edited request is checked, also the lines that did not change (BR-01 included) | BR-10 says the same rules as a new request. Nothing is reserved before Sprint 3 (D-15), so a line whose item type ran out would fail at checkout anyway |
| F05-D3 | BR-04 for an edit ignores the request being edited, and still counts the Borrower's other open requests | Otherwise every edit would conflict with itself. BR-04 tells the Borrower to edit the pending request to get more of an item type |
| F05-D4 | The line of an item type that stays keeps its `id` and gets the new quantity; removed item types lose their line row; new item types get new lines (ordered after the kept ones) | A `PENDING` request has no loans (checkout needs `APPROVED` from Sprint 2), so a removed line has nothing that points to it. The `EDITED` entry keeps the before and after lines (SDS 4.6), so the history is complete |
| F05-D5 | An edit whose lines and loan length equal the stored ones returns `200` with the request and writes nothing (no update, no history entry) | BR-16 records changes; an entry for no change would make the history noisy. The UI disables Save until something changed |
| F05-D6 | The cancel time and actor are kept only in the history entry; there is no `cancelledAt` column | #73 added `decidedAt` for the 48-hour window (BR-13); a cancel starts no window. The history entry has the time and the Borrower (BR-16) |
| F05-D7 | Messages: `409 INVALID_STATE` "Request #12 cannot be edited because it is APPROVED, not PENDING." and "Request #12 cannot be cancelled because it is CHECKED_OUT."; `404` "Request 999 does not exist." (F02-D2) | Same style as F-03 and F-06; the `404` names only the ID the caller sent (DD-06) |
| F05-D8 | Both endpoints return `200` with the request in the Borrower shape (F-02 4.5 with `loanDays`, and F-06's decision fields when F-06 has merged) | The detail page refreshes from one response |

## 4. UI specification

### 4.1 Layers changed by F-05

| Layer | Change |
| --- | --- |
| UI | Edit and Cancel on the Borrower's request detail; edit page `/requests/:id/edit` with `RequestForm`; cancel confirmation dialog |
| API | New `PATCH /api/requests/:id` and `POST /api/requests/:id/cancel` |
| Domain | Two new rows in the transition table; `requestRuleViolation` takes the request to ignore for BR-04 |
| Database | None beyond #73 |

### 4.2 Request detail additions (Borrower, own request)

| State | Shown |
| --- | --- |
| `PENDING` | **Edit request** (link to `/requests/:id/edit`) and **Cancel request** |
| `APPROVED` | **Cancel request** |
| Any other state | Neither |

A Custodian never sees Edit or Cancel.

### 4.3 Edit page (`/requests/:id/edit`, Borrower)

| Aspect | Behaviour |
| --- | --- |
| Loading | "Loading…" until the request and the catalog are loaded; a `404` shows "Request not found." with a link to My requests |
| Not editable | A request that is not `PENDING` shows "Request #12 can no longer be edited because it is APPROVED." with a link to the detail, and no form |
| Form | `RequestForm` (F-04 4.3) filled with the request; the title "Edit Request #12"; the button **Save changes**, disabled until the form differs from the loaded request |
| Submitting | Button disabled with a spinner; a double click sends one call |
| Success | Back to `/requests/12` with "Request #12 updated." |
| `409 INVALID_STATE` | The API message as an alert and a link to the detail (the request was approved, rejected or cancelled meanwhile) |
| Other `409`, `400` | As in F-04 4.3: the message as an alert or under the field; the form keeps what the Borrower entered |
| `401`, `403` | Shared behaviour (SDS 5.3). A Custodian at `/requests/:id/edit` sees the Forbidden page |

### 4.4 Cancel dialog

| Aspect | Behaviour |
| --- | --- |
| Text | "Cancel Request #12? You cannot undo this." and the request's lines |
| Buttons | **Cancel request** (danger style) and **Keep request** (closes the dialog, no call) |
| Submitting | Confirm disabled with a spinner; a double click sends one call |
| Success | Dialog closes; "Request #12 cancelled."; the detail is fetched again and shows `CANCELLED` with no Edit or Cancel |
| `409`, `404` | The API message as an alert; the detail is fetched again |

Planned files: `client/src/pages/requests/EditRequestPage.tsx`, `client/src/pages/requests/CancelRequestDialog.tsx`, changes to `client/src/pages/RequestDetailPage.tsx` and `client/src/api/requests.ts`.

## 5. API specification

### 5.1 `PATCH /api/requests/:id`

| Aspect | Specification |
| --- | --- |
| Who | Borrower, own request. Custodian: `403`. No session: `401`. Another Borrower's request: `404` |
| Body | `{ "lines": [ { "itemTypeId", "quantity" } ], "loanDays" }`, the F-04 create schema |
| Success | `200` with the request, still `PENDING` |
| Errors | `400 VALIDATION_FAILED`, `404 NOT_FOUND`, `409 INVALID_STATE`, then the F-04 rule codes `DUPLICATE_OPEN_REQUEST`, `QUANTITY_LIMIT`, `LOAN_LENGTH_LIMIT`, `ITEM_TYPE_UNAVAILABLE` (3.5) |

Example: Request 12 has Arduino Uno R3 × 2 (line 20) and Digital multimeter × 1 (line 21) for 3 days. The Borrower removes the multimeter, adds HC-SR04 × 3 and asks for 10 days:

```json
{ "lines": [ { "itemTypeId": 3, "quantity": 2 }, { "itemTypeId": 7, "quantity": 3 } ], "loanDays": 10 }
```

Response `200`: `loanDays` 10; lines `[ { "id": 20, "itemType": { "id": 3, … }, "quantity": 2 }, { "id": 22, "itemType": { "id": 7, … }, "quantity": 3 } ]`. Line 21 is gone, line 20 keeps its ID. History entry `EDITED` with:

```json
{
  "before": { "loanDays": 3, "lines": [ { "itemTypeId": 3, "quantity": 2 }, { "itemTypeId": 9, "quantity": 1 } ] },
  "after": { "loanDays": 10, "lines": [ { "itemTypeId": 3, "quantity": 2 }, { "itemTypeId": 7, "quantity": 3 } ] }
}
```

### 5.2 `POST /api/requests/:id/cancel`

| Aspect | Specification |
| --- | --- |
| Who | Borrower, own request. Custodian: `403`. No session: `401`. Another Borrower's request: `404` |
| Body | `{}` (strict) |
| Success | `200` with the request, `status` `CANCELLED` |
| Errors | `400 VALIDATION_FAILED`, `404 NOT_FOUND`, `409 INVALID_STATE` |

Example error:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Request #12 cannot be cancelled because it is CHECKED_OUT.",
    "requestId": "9b2e4c1a-7d3f-4e8a-b5c6-1f0a2d3e4b5c"
  }
}
```

## 6. Data specification

### 6.1 Schema and migrations

No migration. F-05 writes `borrow_requests.status`, `loanDays` and `updatedAt`, and `request_lines` rows of `PENDING` requests only.

### 6.2 Tables read and written

| Table | Read | Written by edit | Written by cancel |
| --- | --- | --- | --- |
| `users` | The Borrower's row (lock) and the `borrower` object | - | - |
| `borrow_requests` | The request (locked for an edit); the Borrower's other open requests for BR-04 | `loanDays`, `updatedAt` | `status`, `updatedAt` |
| `request_lines` | The request's lines | Update quantity, insert, delete (F05-D4) | - |
| `item_types`, `units` | Limits and available counts for the rules | - | - |
| `history_entries` | - | One `EDITED` entry | One `STATUS_CHANGED` entry |

## 7. Acceptance criteria

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-72 | A Borrower edits their own `PENDING` request: its lines, quantities and loan length become the new ones, the line of each item type that stays keeps its ID, the request stays `PENDING`, and exactly one `EDITED` history entry with the Borrower, the time and the before and after lines and loan length is written | FR-11, BR-10, BR-16 |
| AC-73 | An edit is checked against the same rules as a new request: a body that fails the F-04 schema gives `400 VALIDATION_FAILED`, and a quantity, loan length, availability or open-request problem gives the F-04 `409` code in the F-04 order; the request being edited does not count as an open request for BR-04, the Borrower's other open requests do; after a rejection the request, its lines and the history are unchanged | BR-10, BR-01, BR-04, BR-06, BR-07, BR-08 |
| AC-74 | Editing a request that is not `PENDING` gives `409 INVALID_STATE` naming the state; editing a request that does not exist or belongs to another Borrower gives `404 NOT_FOUND` with only the `error` object; an edit that changes nothing returns `200` and writes nothing | BR-10, BR-05, BR-16 |
| AC-75 | A Borrower cancels their own `PENDING` request and their own `APPROVED` request: each becomes `CANCELLED`, exactly one history entry from the old state to `CANCELLED` with the Borrower is written, no unit changes, and the Borrower can then request the same item type again | FR-12, BR-10, BR-04, BR-16 |
| AC-76 | Cancelling a request that is `REJECTED`, `CANCELLED`, `CHECKED_OUT` or `RETURNED` gives `409 INVALID_STATE` naming the state; a cancel body with any field gives `400`; another Borrower's request gives `404`; nothing changes | FR-12, BR-10, BR-05 |
| AC-77 | A Custodian who edits or cancels a request gets `403 FORBIDDEN`; both calls without a session get `401 UNAUTHENTICATED`; each body has only the `error` object and nothing changes | BR-17, NFR-01, NFR-02 |
| AC-78 | Simultaneous calls on one request end in a consistent state: two cancels give one success and one `409`; an edit and a cancel either both succeed (edit first) or the edit gets `409` (cancel first); an edit and an approval either both succeed (edit first) or the edit gets `409` (approval first); a cancel and a rejection give one success and one `409`; history holds one entry per successful call | NFR-05, BR-10, BR-16 |
| AC-79 | On their own request's detail a Borrower sees Edit and Cancel on `PENDING`, only Cancel on `APPROVED` and neither otherwise; the edit page starts with the request's lines and loan length, enables Save only after a change, and returns to the detail with "Request #n updated."; Cancel asks for confirmation, sends one call and shows "Request #n cancelled."; a `409` is shown as an alert with the API message; a Custodian sees neither button | FR-11, FR-12, NFR-12 |

## 8. Software Test Specification (STS)

### 8.1 Conventions

- Levels, tools and factories as in the F-04 contract 8.1. Requests in `APPROVED`, `REJECTED`, `CHECKED_OUT` and `RETURNED` are made by `createRequest` with the chosen state; F-05 tests do not depend on the F-06, F-07 or F-08 endpoints.
- "Unchanged" means the request row (all columns), its lines (IDs, item types, quantities), every unit's status and the `history_entries` count are equal before and after the call: `snapshotRequestState()` in `server/tests/helpers/requests.ts`, extended with the request's row and lines.
- The races with a Custodian decision (TEST-78 (c), (d)) use the helper `decideDirect(prisma, requestId, custodianId, status)`, which runs the F-06 conditional update (`WHERE status = 'PENDING'`) and its history entry in its own transaction, so they test the F-05 side of the race before F-06 is merged. When F-06 is on `staging`, the same cases also run through `POST /api/requests/:id/approve`.
- **TDD** marks the tests for the rules, states and races. Each is committed and run on the pre-implementation code first and must fail on an assertion (for example `404` because `PATCH /api/requests/:id` and `/cancel` do not exist yet); the failing output and the commit are kept. UI tests mock the API module with a `vi.mock` factory.

### 8.2 Test cases

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-72 **TDD** | AC-72 | API | Borrower B; `PENDING` request R (Arduino × 2 line L20, multimeter × 1 line L21, `loanDays` 3); HC-SR04 with 5 available | `PATCH /api/requests/R` with Arduino × 2, HC-SR04 × 3, `loanDays` 10 | `200`; `status` `PENDING`, `loanDays` 10; lines L20 (Arduino × 2) and a new line (HC-SR04 × 3); L21 gone. Database: same. Exactly one new history entry: `EDITED`, actor B, `fromStatus` and `toStatus` null, `details` equal to the 5.1 before/after object; `createdAt` unchanged | `server/tests/api/requests-edit.test.ts` |
| TEST-73 **TDD** | AC-73 | API | B with `PENDING` R (Arduino × 1, `loanDays` 14) and `PENDING` R2 (HC-SR04 × 1); multimeter (max 1, 3 days); Oscilloscope 0 available | Edit R to (a) two Arduino lines; (b) `loanDays` 0; (c) a line with `unitId`; (d) multimeter × 2, `loanDays` 3; (e) Arduino × 1 and multimeter × 1, `loanDays` 14; (f) Oscilloscope × 1, `loanDays` 3; (g) Arduino × 1 and HC-SR04 × 1, `loanDays` 14; (h) Arduino × 2, `loanDays` 14 (own Arduino line) | (a) to (c) `400` naming `lines[1].itemTypeId`, `loanDays`, `lines[0].unitId`. (d) `409 QUANTITY_LIMIT`. (e) `409 LOAN_LENGTH_LIMIT` naming Digital multimeter. (f) `409 ITEM_TYPE_UNAVAILABLE`. (g) `409 DUPLICATE_OPEN_REQUEST` naming R2. Unchanged after each. (h) `200`: R's own open request does not block | `server/tests/api/requests-edit.test.ts` |
| TEST-74 **TDD** | AC-74 | API | B: requests in `APPROVED`, `REJECTED`, `CANCELLED`, `CHECKED_OUT`; `PENDING` R; Borrower B2 with `PENDING` R3 | (a) B edits each non-`PENDING` request; (b) B edits R3; (c) B edits 999 999; (d) B edits R with its stored lines and `loanDays` | (a) each `409 INVALID_STATE`, "Request #n cannot be edited because it is APPROVED, not PENDING." (state per request); Unchanged. (b), (c) `404 NOT_FOUND`, only `error`, "Request <id> does not exist."; R3 unchanged. (d) `200`, no history entry, `updatedAt` unchanged | `server/tests/api/requests-edit.test.ts` |
| TEST-75 **TDD** | AC-75 | API | B: `PENDING` P (Arduino) and `APPROVED` A (HC-SR04), units of both `AVAILABLE` | (a) cancel P; (b) cancel A; (c) create a request for Arduino × 1 and HC-SR04 × 1 | (a), (b) `200`, `status` `CANCELLED`; one history entry each (`STATUS_CHANGED`, `PENDING` / `APPROVED` → `CANCELLED`, actor B, `details` null); unit statuses unchanged. (c) `201`: the cancelled requests no longer block BR-04 | `server/tests/api/requests-cancel.test.ts` |
| TEST-76 **TDD** | AC-76 | API | B: requests in `REJECTED`, `CANCELLED`, `CHECKED_OUT`, `RETURNED`; `PENDING` R; B2 with `PENDING` R3 | (a) cancel each of the four; (b) cancel R with `{ "reason": "x" }`; (c) B cancels R3 | (a) each `409 INVALID_STATE` naming the state. (b) `400` naming `reason`. (c) `404 NOT_FOUND`. Unchanged after each | `server/tests/api/requests-cancel.test.ts` |
| TEST-77 | AC-77 | API | `PENDING` R of B; Custodian C | (a) as C: edit R, cancel R; (b) no cookie and a signed-out session cookie: both calls | (a) `403 FORBIDDEN`; (b) `401 UNAUTHENTICATED`; each body only `error`; Unchanged | `server/tests/api/requests-access.test.ts` |
| TEST-78 **TDD** | AC-78 | Integration | `PENDING` request R of B (Arduino × 1), fresh per round; Custodian C; 5 rounds per case | `Promise.all` of (a) two cancels; (b) an edit (`loanDays` 7) and a cancel; (c) an edit and `decideDirect(APPROVED)`; (d) a cancel and `decideDirect(REJECTED)`; (e) a cancel and `decideDirect(APPROVED)` | (a) one `200`, one `409`; one cancel entry. (b) R `CANCELLED`; either both succeeded and `loanDays` 7 with one `EDITED` and one cancel entry, or the edit got `409` with no `EDITED` entry. (c) either both succeeded (R `APPROVED`, `loanDays` 7) or the edit got `409` (R `APPROVED`, old `loanDays`). (d) exactly one succeeded; R `CANCELLED` or `REJECTED`; one state entry. (e) R ends `CANCELLED`; the approval either succeeded first or found R cancelled | `server/tests/api/requests-edit-concurrency.test.ts` |
| TEST-79 **TDD** | AC-79 | UI | `RequestDetailPage`, `EditRequestPage` and `CancelRequestDialog` with the requests and catalog modules mocked (`vi.mock` factory) | (a) detail of own `PENDING`, `APPROVED`, `CHECKED_OUT` requests as the Borrower; (b) a `PENDING` request as a Custodian; (c) edit page: change the loan length from 3 to 2, Save; (d) edit page of an `APPROVED` request; (e) Cancel → Keep request; (f) Cancel → Cancel request, double click; (g) the cancel mock rejects with `409 INVALID_STATE` | (a) Edit and Cancel; only Cancel; neither. (b) neither. (c) Save disabled until the change; the update mock called once with the full lines and `loanDays` 2; navigation to the detail with "Request #12 updated.". (d) "Request #12 can no longer be edited because it is APPROVED." and no form. (e) no call. (f) the cancel mock called once with `12`; "Request #12 cancelled."; the detail fetched again. (g) the API message as an alert | `client/tests/request-edit-cancel.test.tsx` |

### 8.3 Coverage checks

- AC-n is verified by TEST-n for AC-72 to AC-79.
- Both new endpoints have a no-session and a wrong-role test (TEST-77) and an other-Borrower test (TEST-74 (b), TEST-76 (c)) (SDS 7.3).
- Every rejection test asserts Unchanged.
- Regression: the F-04 suites and the Sprint 1 request suites must still pass; F-05 changes no existing assertion.

## 9. Definition of Done (F-05)

| # | Item | Evidence |
| --- | --- | --- |
| 1 | AC-72 to AC-79 implemented as specified in sections 3 to 6 | PR lists each AC with its commit or file |
| 2 | TEST-72 to TEST-79 exist under their planned files (or recorded new paths) with the stated assertions, and pass | `npm test` output in `server/` and `client/` with counts and the tested commit |
| 3 | TDD tests failed on assertions before the implementation and passed after | Test-only commit SHA with failing output; implementation commit SHA with passing output |
| 4 | No test skipped, disabled or weakened | Skip count 0 |
| 5 | Reviewed by the teammate with a specific comment; CI `test-and-docker` green | GitHub review and checks |
| 6 | `docs/features.md` and `docs/traceability.md` list AC-72 to AC-79 with results | Diff in the PR |
| 7 | E2E journeys still pass | `npm run test:e2e` output |
| 8 | Known limitations disclosed: an unchanged line is checked for availability again (F05-D2); a cancel releases nothing before Sprint 3 | PR section |

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-72 | FR-11, BR-10, BR-16 | TEST-72 | `server/tests/api/requests-edit.test.ts` |
| AC-73 | BR-10, BR-01, BR-04, BR-06, BR-07, BR-08 | TEST-73 | `server/tests/api/requests-edit.test.ts` |
| AC-74 | BR-10, BR-05, BR-16 | TEST-74 | `server/tests/api/requests-edit.test.ts` |
| AC-75 | FR-12, BR-10, BR-04, BR-16 | TEST-75 | `server/tests/api/requests-cancel.test.ts` |
| AC-76 | FR-12, BR-10, BR-05 | TEST-76 | `server/tests/api/requests-cancel.test.ts` |
| AC-77 | BR-17, NFR-01, NFR-02 | TEST-77 | `server/tests/api/requests-access.test.ts` |
| AC-78 | NFR-05, BR-10, BR-16 | TEST-78 | `server/tests/api/requests-edit-concurrency.test.ts` |
| AC-79 | FR-11, FR-12, NFR-12 | TEST-79 | `client/tests/request-edit-cancel.test.tsx` |
