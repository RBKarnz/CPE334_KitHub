# F-06 Approve and reject requests; all-requests view: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-06 Approve and reject requests; all-requests view |
| Sprint | 2 (due 2026-11-29) |
| Version | 1.0 |
| Status | Proposed (PR for #76); implementation starts only after this contract is reviewed and merged |
| Date | 2026-11-25 |
| Authors | Teerakarn Noiruksa (67070501062); reviewer Methipat Mansap (67070501071) |
| Baseline | SRS v1.3 (v1.4 after #71), System-Level SDS v1.8 (Sprint 2 columns from #73), F-02 contract v1.3, F-03 contract v1.2 |
| Issues | #76 this feature; #73 Sprint 2 columns (`decidedById`, `decidedAt`, `rejectionReason`) |
| Definition of Done | [Product Definition of Done](../sprint-1/definition-of-done.md) and section 9 of this contract |
| AC/TEST block | 80 to 89 (claimed in #76) |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-25 | Teerakarn Noiruksa | First contract: AC-80 to AC-89, TEST-80 to TEST-89, decisions F06-D1 to F06-D7 |

Changes after approval get a new version row with the reason. AC and TEST IDs are never reused for a different meaning.

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What F-06 does with it |
| --- | --- | --- |
| Functional | FR-13, FR-14, FR-30 | Approve a `PENDING` request; reject it with a reason the Borrower can see; list all requests in any state with a state filter and open any request with its lines, Borrower and history |
| Business rules | BR-09, BR-16 | A request is approved or rejected as a whole; rejection needs a non-empty reason; every decision writes a history entry |
| Business rules (through access rules) | BR-05, BR-17 | Only Custodians decide; a Borrower still sees only their own requests |
| Non-functional | NFR-01, NFR-02, NFR-09, NFR-12 | No session rejected; role check on every new endpoint; history entries; list states of the new page |
| SRS state rows | 8.2 `PENDING` → `APPROVED`, `PENDING` → `REJECTED` | The only transitions F-06 performs |

### 2.2 Depends on

| Dependency | What F-06 uses | Status on 2026-11-25 |
| --- | --- | --- |
| #73 Sprint 2 columns | `borrow_requests.decidedById`, `decidedAt`, `rejectionReason`, CHECK `borrow_requests_rejectionReason_check` | PR #80 open |
| F-01 | `authenticate`, `requireRole("CUSTODIAN")`, navigation bar, route guards | Done |
| F-02 | `GET /api/requests`, `GET /api/requests/:id`, request representation (F-02 4.5), request detail page, `StatusBadge` | Done |
| F-03 | Transition table `assertTransition`, `snapshotCheckoutState()` test helper pattern | Done |

### 2.3 Out of scope for F-06

| Not in F-06 | Arrives in |
| --- | --- |
| Checkout requires `APPROVED`; the Sprint 1 checkout of `PENDING` is removed | F-07 (#77). Until F-07 merges, a Custodian can still check out a `PENDING` request (Sprint 1 FR-16), and checkout of an `APPROVED` request answers `409 INVALID_STATE` |
| Cancelling an `APPROVED` request | F-05 (#75) |
| Expiry 48 hours after approval (`decidedAt` starts the window) | Sprint 3, F-10 |
| History views per unit and per Borrower | Sprint 3, F-13. F-06 shows the history of one request only |
| Paging, search and sorting options for the all-requests list | Not planned for Sprint 2; the list is ordered as F02-D4 |

## 3. Feature-level design (Feature SDS)

### 3.1 Behaviour and workflow

1. A Custodian opens **All requests** (`/requests`) from the navigation bar. The UI calls `GET /api/requests` (all states) or `GET /api/requests?status=<state>` when a state is chosen in the filter.
2. The Custodian opens a request (`/requests/:id`). The detail shows its state, Borrower, lines, loan length when set, decision fields and its history, oldest entry first.
3. For a `PENDING` request the detail shows **Approve** and **Reject**.
4. **Approve** asks for confirmation ("Approve Request #12 for Borrower One?") and calls `POST /api/requests/:id/approve` with `{}`. In one transaction the server sets `status = 'APPROVED'`, `decidedById`, `decidedAt` with a conditional update `WHERE status = 'PENDING'`, and writes one history entry (3.6).
5. **Reject** opens a dialog with a required reason (1 to 500 characters after trimming). The confirm button stays disabled until the reason is not blank. The UI calls `POST /api/requests/:id/reject` with `{ "reason": "..." }`. The server sets `status = 'REJECTED'`, `decidedById`, `decidedAt` and `rejectionReason` (trimmed) the same way and writes one history entry with the reason in `details`.
6. The server returns `200` with the request in its new state. The UI shows "Request #12 approved." or "Request #12 rejected." and refreshes the detail.
7. The Borrower who owns the request sees the new state in My requests and on the detail; a rejected request shows "Rejected: <reason>".
8. Any failure rolls back: the request keeps its state and no history entry is written.

### 3.2 State changes

| Entity | From | To | SRS row | Trigger |
| --- | --- | --- | --- | --- |
| Request | `PENDING` | `APPROVED` | 8.2, Sprint 2 | Approve by a Custodian |
| Request | `PENDING` | `REJECTED` | 8.2, Sprint 2 | Reject with a reason by a Custodian |

No unit or loan changes: approval reserves nothing in Sprint 2 (reservation is BR-13, Sprint 3). `assertTransition("REQUEST", "PENDING", "APPROVED" | "REJECTED")` is added to the transition table; every other `from` state is rejected with `409 INVALID_STATE`.

### 3.3 Business rules and where they are enforced

| Rule | UI (hint only) | Route and middleware | Service (in the transaction) | Domain | Database |
| --- | --- | --- | --- | --- | --- |
| Custodian only (BR-17, NFR-02) | Buttons and the All requests link only for Custodians | `requireRole("CUSTODIAN")` on approve and reject | - | - | - |
| Whole request only (BR-09) | No per-line control | Strict body schemas: approve `{}`, reject `{ reason }`; any other field (for example `lineIds`) → `400` | Updates the request row only | - | - |
| Non-empty reason (BR-09) | Confirm disabled while the reason is blank | Schema: `reason` string, trimmed length 1 to 500 | Stores the trimmed reason | - | CHECK `borrow_requests_rejectionReason_check` (#73) |
| Only `PENDING` can be decided (SRS 8.2) | Buttons only on `PENDING` | - | Conditional update `WHERE id = :id AND status = 'PENDING'`; 0 rows → re-read → `409 INVALID_STATE` (or `404`) | `assertTransition` | - |
| History for each decision (BR-16) | - | - | One entry in the same transaction (3.6) | - | Append-only trigger |
| Borrower sees only own requests (BR-05) | - | Existing F-02 scope | Existing F-02 query | - | - |

### 3.4 Validation

| Input | Rule | Error |
| --- | --- | --- |
| Path `id` (approve, reject, detail) | Integer ≥ 1 | `400 VALIDATION_FAILED` naming `id` |
| Approve body | Exactly `{}`; any field is unknown | `400 VALIDATION_FAILED` naming the field |
| Reject body | `{ "reason": string }`, strict; `reason` after trimming has 1 to 500 characters | `400 VALIDATION_FAILED` naming `reason` ("Must not be blank", "Must be at most 500 characters") or the unknown field |
| `GET /api/requests` query | Optional `status`, one `RequestStatus`; no other parameter (unchanged from F-02) | `400 VALIDATION_FAILED` naming the parameter |
| `Content-Type` on POST | `application/json` (SR-01) | `415` |

### 3.5 Check order (approve and reject)

`401` (no session) → `403` (not a Custodian) → `415` → `400` (path, then body) → transaction: `404` (request does not exist) → `409 INVALID_STATE` (not `PENDING`). The same order as F-03 3.7, so tests can rely on it.

### 3.6 History entries

One entry per decision, written in the same transaction as the update. `now` is one timestamp taken at the start of the transaction and used for both `decidedAt` and `occurredAt` (as F02-D5).

| Field | Approve | Reject |
| --- | --- | --- |
| `occurredAt` | `now` | `now` |
| `actorType` / `actorUserId` | `USER` / the Custodian | `USER` / the Custodian |
| `entityType` / `requestId` | `REQUEST` / the request | `REQUEST` / the request |
| `unitId`, `loanId` | null | null |
| `action` | `STATUS_CHANGED` | `STATUS_CHANGED` |
| `fromStatus` → `toStatus` | `PENDING` → `APPROVED` | `PENDING` → `REJECTED` |
| `details` | null | `{ "reason": "<trimmed reason>" }` |

### 3.7 Concurrency

Two Custodians deciding the same request at the same time (approve and approve, approve and reject, reject and reject): the conditional update lets exactly one succeed; the other gets `409 INVALID_STATE` with the state the winner set, after a re-read in the transaction. Exactly one history entry is written. A Borrower cancelling (F-05) uses the same conditional pattern, so a decision and a cancel cannot both succeed.

### 3.8 Decisions made in this contract

| ID | Decision | Reason |
| --- | --- | --- |
| F06-D1 | Approve and reject are two endpoints, `POST /api/requests/:id/approve` and `/reject` (SDS 6.6), not a `PATCH` of `status` | One action per URL with its own body schema; a client cannot set any other state |
| F06-D2 | Both return `200` with the request in the Custodian detail shape (F06-D4) | The UI shows the new state without a second call |
| F06-D3 | The reason is trimmed and limited to 500 characters | Leading and trailing spaces add nothing; 500 is enough for one explanation and keeps the list readable |
| F06-D4 | The request representation (F-02 4.5) gains `loanDays`, `decidedAt`, `decidedBy { id, username, displayName }` and `rejectionReason` for both roles; `null` when not set. The Custodian detail (`GET /api/requests/:id` as a Custodian) also has `history[]` | The Borrower must see the reason (BR-09); FR-30 asks for the history in the Custodian view. Lists do not carry `history` |
| F06-D5 | `history[]` items: `id`, `occurredAt`, `actor { id, username, displayName }` or `null` for the System actor, `entityType`, `action`, `fromStatus`, `toStatus`, `details`; oldest first (`occurredAt`, then `id`) | Shows who did what and when, without database IDs of other tables |
| F06-D6 | Messages: `409 INVALID_STATE`: "Request #12 cannot be approved because it is APPROVED, not PENDING." (or "rejected"); `404`: "Request #999 does not exist." | Same style as F-03 |
| F06-D7 | The all-requests page reuses `GET /api/requests`; without `status` a Custodian gets every request (oldest first, F02-D4) | No new list endpoint; FR-30 is the Custodian scope that F-02 already has |

## 4. UI specification

### 4.1 Layers changed by F-06

| Layer | Change |
| --- | --- |
| UI | New All requests page `/requests` (Custodian); Approve and Reject on the request detail; reject dialog; decision fields and history on the detail; "All requests" navigation link for Custodians |
| API | New `POST /api/requests/:id/approve` and `/reject`; `GET /api/requests/:id` adds the decision fields for both roles and `history[]` for Custodians; list items add the decision fields |
| Domain | Two new rows in the transition table |
| Database | None beyond #73 |

### 4.2 All requests page (`/requests`, Custodian)

- Route wrapped in `RequireAuth` and `RequireRole("CUSTODIAN")`; a Borrower who opens `/requests` sees the Forbidden page.
- State filter: "All states" (default) and each `RequestStatus` value; changing it calls `GET /api/requests?status=<state>` (or without `status`).
- Columns: Request (`#12`, link to the detail), Borrower (`Borrower One (borrower1)`), Items (one line per item type with quantity, for example `Arduino Uno R3 × 2`), State (`StatusBadge`), Created (Asia/Bangkok, "6 Nov 2026, 13:10").
- States through `AsyncState` (NFR-12): "Loading…", empty "No requests." (or "No requests in state APPROVED." with a filter), error message with "Try again".
- Planned files: `client/src/pages/requests/AllRequestsPage.tsx`, `client/src/api/requests.ts` (extended).

### 4.3 Request detail additions

| Element | Shown to | Content |
| --- | --- | --- |
| Loan length | Both | "Loan length: 7 days" when `loanDays` is set |
| Decision | Both | `APPROVED`: "Approved by Custodian One, 21 Nov 2026, 09:00". `REJECTED`: "Rejected by Custodian One, 21 Nov 2026, 10:00" and "Reason: <reason>" |
| Approve, Reject buttons | Custodian, `PENDING` only | Approve opens a confirmation; Reject opens the reason dialog |
| History | Custodian | Table: time, actor ("Custodian One" or "System"), what ("Request PENDING → APPROVED", "Created", "Unit AVAILABLE → ON_LOAN"), and the reason for a rejection |

### 4.4 Approve confirmation and reject dialog

| Aspect | Approve | Reject |
| --- | --- | --- |
| Text | "Approve Request #12 for Borrower One?" | "Reject Request #12 for Borrower One" and a required "Reason" text area (counter "n/500") |
| Confirm button | "Approve Request #12" | "Reject Request #12", disabled while the reason is blank or longer than 500 characters |
| Submitting | Button disabled with a spinner; a double click sends one call | Same |
| Success | Dialog closes; "Request #12 approved." / "Request #12 rejected."; the detail is fetched again | Same |
| `409 INVALID_STATE`, `404` | The API message as an alert; the detail is fetched again | Same |
| `400` | The API message as an alert (the UI never sends such a body) | Same |
| `401`, `403` | Shared behaviour (SDS 5.3) | Same |

## 5. API specification

Conventions from SDS 6.1 to 6.5 (JSON, ISO 8601 UTC times, error shape `{ "error": { "code", "message", "details", "requestId" } }`).

### 5.1 `POST /api/requests/:id/approve`

| Aspect | Specification |
| --- | --- |
| Who | Custodian only. Borrower: `403`. No session: `401` |
| Body | `{}` (strict) |
| Success | `200` with the request in the Custodian detail shape: `status` `APPROVED`, `decidedAt`, `decidedBy`, `rejectionReason` null, `history[]` ending with the approval entry |
| Errors | `400 VALIDATION_FAILED` (path or body), `404 NOT_FOUND`, `409 INVALID_STATE` |

Response `200` (abridged):

```json
{
  "id": 12,
  "status": "APPROVED",
  "createdAt": "2026-11-20T03:00:00.000Z",
  "loanDays": 7,
  "decidedAt": "2026-11-21T02:00:00.000Z",
  "decidedBy": { "id": 1, "username": "custodian1", "displayName": "Custodian One" },
  "rejectionReason": null,
  "dueAt": null,
  "borrower": { "id": 3, "username": "borrower1", "displayName": "Borrower One" },
  "lines": [ { "id": 5, "itemType": { "id": 3, "name": "Arduino Uno R3" }, "quantity": 2, "loans": [] } ],
  "history": [
    { "id": 40, "occurredAt": "2026-11-20T03:00:00.000Z", "actor": { "id": 3, "username": "borrower1", "displayName": "Borrower One" }, "entityType": "REQUEST", "action": "CREATED", "fromStatus": null, "toStatus": "PENDING", "details": null },
    { "id": 41, "occurredAt": "2026-11-21T02:00:00.000Z", "actor": { "id": 1, "username": "custodian1", "displayName": "Custodian One" }, "entityType": "REQUEST", "action": "STATUS_CHANGED", "fromStatus": "PENDING", "toStatus": "APPROVED", "details": null }
  ]
}
```

### 5.2 `POST /api/requests/:id/reject`

| Aspect | Specification |
| --- | --- |
| Who | Custodian only. Borrower: `403`. No session: `401` |
| Body | `{ "reason": string }` (strict); trimmed length 1 to 500 |
| Success | `200` with the request: `status` `REJECTED`, `decidedAt`, `decidedBy`, `rejectionReason` (trimmed), `history[]` ending with the rejection entry (`details.reason`) |
| Errors | `400 VALIDATION_FAILED` naming `reason` or the unknown field; `404 NOT_FOUND`; `409 INVALID_STATE` |

Example error:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request is not valid.",
    "details": [ { "field": "reason", "issue": "Must not be blank" } ],
    "requestId": "2f1c0b7e-6d4a-4b8f-9e21-5a3c7d0e9b14"
  }
}
```

### 5.3 Changes to `GET /api/requests` and `GET /api/requests/:id`

| Endpoint | Change |
| --- | --- |
| `GET /api/requests` | Unchanged scope and order (F02-D4). Every item gains `loanDays`, `decidedAt`, `decidedBy`, `rejectionReason`. A Custodian without `status` gets every request in every state (FR-30) |
| `GET /api/requests/:id` | Gains the same fields for both roles. As a Custodian it also has `history[]` (F06-D5). A Borrower's response has no `history` field. A Borrower asking for another Borrower's request still gets `404` (DD-06) |

## 6. Data specification

### 6.1 Schema and migrations

No migration in F-06. It uses the #73 columns `decidedById` (FK users), `decidedAt`, `rejectionReason` and the CHECK that a `REJECTED` request has a non-blank reason.

### 6.2 Tables read and written

| Table | Read | Written by approve / reject |
| --- | --- | --- |
| `borrow_requests` | Every field of the representation | `status`, `decidedById`, `decidedAt`, `rejectionReason` (reject only), `updatedAt`, only where `status = 'PENDING'` |
| `request_lines`, `item_types`, `loans`, `units` | For the representation | - |
| `history_entries` | For the Custodian detail | One new row (3.6) |
| `users` | Borrower, decider and history actors (`id`, `username`, `displayName` only) | - |

## 7. Acceptance criteria

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-80 | A Custodian who lists requests without a filter receives every request of every Borrower in every state, oldest first; with `status=<state>` only that state; each item carries `loanDays`, `decidedAt`, `decidedBy` and `rejectionReason`. A Borrower's list still holds only their own requests | FR-30, BR-05 |
| AC-81 | A Custodian who opens any request receives its lines, Borrower, decision fields and its history entries oldest first, each with time, actor, action and states; a Borrower opening their own request receives the decision fields and no history | FR-30, NFR-09 |
| AC-82 | A Custodian approves a `PENDING` request: it becomes `APPROVED` with `decidedBy` the Custodian and `decidedAt` the decision time, exactly one history entry `PENDING` → `APPROVED` is written with the same time, and no unit, line or loan changes | FR-13, BR-09, BR-16 |
| AC-83 | A Custodian rejects a `PENDING` request with a reason: it becomes `REJECTED` with the trimmed reason, `decidedBy` and `decidedAt`; one history entry `PENDING` → `REJECTED` has the reason in `details`; the owning Borrower sees the state and the reason | FR-14, BR-09, BR-16 |
| AC-84 | A reject with no reason, a blank reason, a reason over 500 characters after trimming, or an unknown field, and an approve with any field, is rejected with `400 VALIDATION_FAILED` naming the field, and nothing changes | FR-13, FR-14, BR-09 |
| AC-85 | Approving or rejecting a request that is not `PENDING` (`APPROVED`, `REJECTED`, `CHECKED_OUT`) is rejected with `409 INVALID_STATE` naming the current state, and nothing changes; a request ID that does not exist gives `404 NOT_FOUND` | FR-13, FR-14 |
| AC-86 | Two simultaneous decisions on the same `PENDING` request (approve with approve, approve with reject) produce exactly one success and one `409 INVALID_STATE`, and exactly one decision history entry | FR-13, FR-14, NFR-05 |
| AC-87 | Approve and reject called by a Borrower give `403 FORBIDDEN`, and without a session `401 UNAUTHENTICATED`; the body has only the `error` object and nothing changes | NFR-01, NFR-02, BR-17 |
| AC-88 | The All requests page lists requests with Borrower, items, state and creation time, filters by state, and shows a loading, an empty and an error state; a Borrower who opens `/requests` sees the Forbidden page | FR-30, NFR-12 |
| AC-89 | On a `PENDING` request a Custodian can approve after confirming, or reject with a reason (confirm disabled while the reason is blank); the detail then shows the new state and the decision; a Borrower's detail of a rejected request shows "Rejected" and the reason, and never shows Approve or Reject | FR-13, FR-14, BR-09 |

## 8. Software Test Specification (STS)

### 8.1 Conventions

- Levels and tools from SDS 10, as in the F-03 contract 8.1. API and Integration tests run against `kithub_test` with data from the test factories, never the demo seed.
- "Unchanged" means: the request's row (all columns), every unit's status, the `loans` count and the `history_entries` count are equal before and after the call (helper `snapshotRequestState()` extended with `decidedById`, `decidedAt`, `rejectionReason`).
- **TDD** marks the tests for the rules (approve, reject, reason validation, state, concurrency). Each is committed and run on the pre-implementation code first, failing on an assertion (for example `404` because the route does not exist, or a missing field), and the failing output and commit are kept. UI tests mock the API module with a `vi.mock` factory so they do not import functions that do not exist yet.

### 8.2 Test cases

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-80 **TDD** | AC-80 | API | Borrower A: requests R1 `PENDING`, R2 `APPROVED` (decided by C), R3 `REJECTED` with a reason; Borrower B: R4 `CHECKED_OUT`, R5 `CANCELLED`. Custodian C | (a) as C `GET /api/requests`; (b) `?status=APPROVED`; (c) `?status=REJECTED`; (d) as A `GET /api/requests` | (a) `200`, IDs exactly R1 to R5 oldest first, each item has `loanDays`, `decidedAt`, `decidedBy`, `rejectionReason`; R2 `decidedBy.id` C; R3 `rejectionReason` set. (b) only R2. (c) only R3. (d) only R1 to R3, newest first | `server/tests/api/requests-decide.test.ts` |
| TEST-81 **TDD** | AC-81 | API | R2 from TEST-80 with its entries (created, approved) | (a) as C `GET /api/requests/R2`; (b) as A `GET /api/requests/R2`; (c) as B `GET /api/requests/R2` | (a) `200` with `history` of 2 items oldest first: `CREATED` (actor A, `toStatus` `PENDING`), `STATUS_CHANGED` `PENDING` → `APPROVED` (actor C); each item exactly the F06-D5 fields; no `passwordHash` anywhere. (b) `200` with decision fields and no `history` key. (c) `404 NOT_FOUND` with only `error` | `server/tests/api/requests-decide.test.ts` |
| TEST-82 **TDD** | AC-82 | API | `PENDING` request R of Borrower A with 2 lines; units of both item types `AVAILABLE`; Custodian C | `POST /api/requests/R/approve` with `{}` | `200`; `status` `APPROVED`, `decidedBy.id` C, `decidedAt` within the call window, `rejectionReason` null. Database: R `APPROVED`, `decidedById` C; exactly one new history entry (`REQUEST`, `STATUS_CHANGED`, `PENDING` → `APPROVED`, actor C, `occurredAt` = `decidedAt`, `details` null); lines, units and loans unchanged | `server/tests/api/requests-decide.test.ts` |
| TEST-83 **TDD** | AC-83 | API + UI | API: `PENDING` request R of A. UI: request detail with the requests module mocked returning a `REJECTED` request with reason "Only one unit left." | API: (a) reject R with `{ "reason": "  Only one unit left.  " }`; (b) as A `GET /api/requests/R`. UI: (c) render `/requests/R` as A | (a) `200`, `status` `REJECTED`, `rejectionReason` "Only one unit left." (trimmed), `decidedBy.id` C; one history entry with `details` `{ "reason": "Only one unit left." }`. (b) A sees `REJECTED` and the reason. (c) "Rejected by Custodian One, …" and "Reason: Only one unit left." shown; no Approve or Reject button | `server/tests/api/requests-decide.test.ts`, `client/tests/request-decision.test.tsx` |
| TEST-84 **TDD** | AC-84 | API | `PENDING` request R; Custodian C | Reject R with (a) `{}`; (b) `{ "reason": "   " }`; (c) 501 × "x"; (d) `{ "reason": "ok", "lineIds": [1] }`; approve R with (e) `{ "lineIds": [1] }`; (f) reject with exactly 500 × "x" on another `PENDING` request R2 | (a) to (e) `400 VALIDATION_FAILED`; (a), (b), (c) name `reason`; (d), (e) name `lineIds`. After each: Unchanged, R `PENDING`. (f) `200`, reason stored with 500 characters | `server/tests/api/requests-decide.test.ts` |
| TEST-85 **TDD** | AC-85 | API | Requests R_A `APPROVED`, R_R `REJECTED`, R_C `CHECKED_OUT`; no request 999 999 | Approve and reject each; approve 999 999 | Each of the six `409 INVALID_STATE`, message names the current state ("… because it is APPROVED, not PENDING."); Unchanged. 999 999: `404 NOT_FOUND` "Request #999999 does not exist." | `server/tests/api/requests-decide.test.ts` |
| TEST-86 **TDD** | AC-86 | Integration | `PENDING` request R; Custodians C1 and C2 on two agents | (a) `Promise.all` of C1 approve and C2 approve; (b) C1 approve and C2 reject with a reason; 5 rounds each with fresh data | Each round: one `200`, one `409 INVALID_STATE`; R ends in the winner's state with the winner as `decidedBy`; exactly one decision history entry; for (b) `rejectionReason` set only when reject won | `server/tests/api/requests-decide-concurrency.test.ts` |
| TEST-87 | AC-87 | API | `PENDING` request R of Borrower A | (a) as A approve R and reject R; (b) with no cookie, and with a signed-out session cookie, both calls | (a) `403 FORBIDDEN`, (b) `401 UNAUTHENTICATED`; each body only `error`; Unchanged | `server/tests/api/requests-decide-access.test.ts` |
| TEST-88 | AC-88 | UI | `AllRequestsPage` with the requests module mocked (`vi.mock` factory) | (a) pending promise; (b) `{ items: [] }`; (c) rejects with an API error, then resolves; (d) resolves R1 `PENDING` (Borrower One, Arduino Uno R3 × 2) and R2 `APPROVED`; (e) choose "APPROVED" in the filter; (f) render `/requests` as a Borrower | (a) "Loading…"; (b) "No requests."; (c) the error and "Try again", which calls again; (d) both rows with `#`, Borrower, items, `StatusBadge` and time; (e) the mock called with `status: "APPROVED"`; (f) Forbidden page | `client/tests/AllRequestsPage.test.tsx` |
| TEST-89 **TDD** | AC-89 | UI | Request detail as a Custodian with the module mocked: `PENDING` request 12 of Borrower One | (a) render; (b) click Approve, then confirm; (c) click Reject, type "   ", then "Broken cable."; confirm twice quickly; (d) the reject mock rejects with `409 INVALID_STATE` | (a) Approve and Reject shown. (b) approve mock called once with `12`; "Request #12 approved." shown; detail fetched again. (c) confirm disabled while the reason is blank; enabled after typing; reject mock called once with `(12, "Broken cable.")`. (d) the API message as an alert; detail fetched again | `client/tests/request-decision.test.tsx` |

### 8.3 Coverage checks

- AC-n is verified by TEST-n for AC-80 to AC-89.
- Both new endpoints have a no-session and a wrong-role test (TEST-87).
- Every rejection test asserts Unchanged in the database.
- Regression: the Sprint 1 request and checkout suites (TEST-08 to TEST-26, TEST-33 to TEST-52) and the E2E journeys must still pass; the representation gains fields, so tests that compare the exact key set of a request (for example TEST-18 and TEST-26) are updated to include `loanDays`, `decidedAt`, `decidedBy` and `rejectionReason`, with the reason in the PR.

## 9. Definition of Done (F-06)

| # | Item | Evidence |
| --- | --- | --- |
| 1 | AC-80 to AC-89 implemented as specified in sections 3 to 6 | PR lists each AC with its commit or file |
| 2 | TEST-80 to TEST-89 exist under their planned files (or recorded new paths) with the stated assertions, and pass | `npm test` output in `server/` and `client/` with counts and the tested commit |
| 3 | TDD tests failed on assertions before the implementation and passed after | Test-only commit SHA with failing output; implementation commit SHA with passing output |
| 4 | No test skipped, disabled or weakened; changed key-set assertions explained | Skip count 0; PR note |
| 5 | Reviewed by the teammate with a specific comment | GitHub review |
| 6 | `docs/features.md` and `docs/traceability.md` list AC-80 to AC-89 with results | Diff in the PR |
| 7 | E2E journeys still pass | `npm run test:e2e` output |
| 8 | Known limitations disclosed (Sprint 1 checkout of `PENDING` stays until F-07) | PR section |

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-80 | FR-30, BR-05 | TEST-80 | `server/tests/api/requests-decide.test.ts` |
| AC-81 | FR-30, NFR-09 | TEST-81 | `server/tests/api/requests-decide.test.ts` |
| AC-82 | FR-13, BR-09, BR-16 | TEST-82 | `server/tests/api/requests-decide.test.ts` |
| AC-83 | FR-14, BR-09, BR-16 | TEST-83 | `server/tests/api/requests-decide.test.ts`, `client/tests/request-decision.test.tsx` |
| AC-84 | FR-13, FR-14, BR-09 | TEST-84 | `server/tests/api/requests-decide.test.ts` |
| AC-85 | FR-13, FR-14 | TEST-85 | `server/tests/api/requests-decide.test.ts` |
| AC-86 | FR-13, FR-14, NFR-05 | TEST-86 | `server/tests/api/requests-decide-concurrency.test.ts` |
| AC-87 | NFR-01, NFR-02, BR-17 | TEST-87 | `server/tests/api/requests-decide-access.test.ts` |
| AC-88 | FR-30, NFR-12 | TEST-88 | `client/tests/AllRequestsPage.test.tsx` |
| AC-89 | FR-13, FR-14, BR-09 | TEST-89 | `client/tests/request-decision.test.tsx` |
