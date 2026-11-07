# KitHub: Engineering Contract F-02, Browse catalog and borrow request

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-02 Browse catalog and borrow request |
| Sprint | 1 |
| Issue | #15 (contract), #18 (implementation) |
| Version | 1.2 |
| Status | Agreed (PR #30 merged into `staging`); implemented in #18 (PR #32) |
| Date | 2026-11-07 |
| Authors | Teerakarn Noiruksa (67070501062) |
| Baseline | [SRS v1.2](../../srs.md), [System-Level SDS v1.1](../../system-sds.md), [Feature inventory](../../features.md) section 4.2, [Sprint plan v1.2](../plan.md), [Contract F-01 v1.2](F-01-auth.md) |

### Version history

| Version | Date | Author | Change | Reason |
| --- | --- | --- | --- | --- |
| 1.0 | 2026-11-06 | Teerakarn Noiruksa | First contract. Adopts AC-08 to AC-17 and TEST-08 to TEST-17 from `docs/features.md` 4.2; adds AC-33 to AC-40 and TEST-33 to TEST-40 in the block reserved for F-02; decisions F02-D1 to F02-D7; answers the F-03 assumptions F02-A1 to F02-A7 | Part E: contract before implementation |
| 1.1 | 2026-11-06 | Teerakarn Noiruksa | AC-39, TEST-14 and TEST-39 compare the `404` form (same `code` and keys, message "Request <id> does not exist." with the requested ID) instead of equal bodies; TEST-37 resets state per iteration; TEST-38 marked **TDD**; DoD path is a link now that #28 is merged | PR #30 review |
| 1.2 | 2026-11-07 | Teerakarn Noiruksa, Methipat Mansap | Status (1) reads "Agreed (PR #30 merged into `staging`); implemented in #18 (PR #32)" instead of "Proposed". Header only: no behavior, AC or TEST change | The contract was merged and implemented; matches the F-03 status line (PR #37 review) |

A change after this version is merged gets a new row here, and an AC or TEST change is also recorded in `docs/traceability.md` section 5. AC and TEST IDs are never reused for a different meaning.

## 2. Scope

### 2.1 Linked requirements

| Type | IDs | What F-02 does for them |
| --- | --- | --- |
| FR | FR-04, FR-07, FR-08 | Catalog with available counts; a Borrower requests one unit of one item type; a Borrower lists and opens their own requests |
| BR | BR-01, BR-04, BR-05, BR-16, BR-17 | Request only what is available; no two open requests with the same item type; owner always the signed-in Borrower and no cross-Borrower access; history entry for request creation; only Borrowers create requests |
| NFR | NFR-02, NFR-09, NFR-12 | Cross-Borrower and cross-role access rejected; history for every state change; loading, empty and error states in the catalog and the Borrower's request list |
| NFR (through access rules) | NFR-01 | Every F-02 endpoint rejects a call without a session |
| SRS decisions | A-04, D-08, D-15 | Available means `AVAILABLE` units; a pending request reserves nothing before Sprint 3 |
| SDS design decisions | DD-05, DD-06, DD-07, DD-08, DD-09, DD-10, DD-11 | Borrower row lock for BR-04; `404` outside scope; append-only history; derived availability; strict schemas; `409` rule codes; `lines` array body |

### 2.2 In scope

- `GET /api/categories`, `POST /api/requests`, `GET /api/requests`, `GET /api/requests/:id`
- The request representation used by every endpoint that returns a request (section 4.5), which F-03 extends with loans
- Catalog screen, request action, My requests screen, request detail screen
- History entry for request creation

### 2.3 Out of scope

| Not in F-02 | Arrives in |
| --- | --- |
| Item type detail page (FR-05) | Sprint 2, F-04 |
| Several lines, quantity above 1, loan length chosen by the Borrower (FR-10) | Sprint 2, F-04 |
| Editing and cancelling a request (FR-11, FR-12) | Sprint 2, F-05 |
| Custodian's all-requests view with a state filter in the UI (FR-30) | Sprint 2, F-06. The API filter used by `/pending` is in F-02 (section 4.3) |
| Checkout, loans, due date | Sprint 1, F-03 (#16). F-02 returns `dueAt: null` and `loans: []` until F-03 fills them |
| Reservations, borrowing limit, overdue block (BR-13, BR-14, BR-15) | Sprint 3, F-10 and F-11 |
| Search and filter (FR-06) | Sprint 3, F-12 |

### 2.4 Dependencies

| Depends on | What F-02 uses | Status on 2026-11-06 |
| --- | --- | --- |
| SR-01 (#13) | Schema and first migration (`categories`, `item_types`, `units`, `borrow_requests`, `request_lines`, `history_entries` with its trigger and CHECKs), `AppError` classes, the JSON error handler, `validate` middleware, Prisma client, test database and helpers | Open |
| F-01 (#14, #17) | `authenticate`, `requireRole`, `req.user = { id, role }`, the navigation bar, `RequireAuth` and `RequireRole`, the shared API test helper (F-01 section 8) | Contract v1.2 merged (#27); implementation open |

F-03 (#16, #19) depends on F-02 for the request list, the request detail and the request representation. Section 3.6 answers its assumptions.

## 3. Behavior

### 3.1 Create a request (FR-07)

```mermaid
sequenceDiagram
  actor B as Borrower
  participant UI
  participant API
  participant DB as PostgreSQL
  B->>UI: Press Request on an item type in the catalog
  UI->>API: POST /api/requests { lines: [ { itemTypeId, quantity: 1 } ] }
  API->>API: authenticate (401), requireRole BORROWER (403), schema (400)
  API->>DB: BEGIN; lock the Borrower's users row (DD-05)
  API->>DB: Read the item type (404 if missing)
  API->>DB: Open request of this Borrower with this item type? (409 DUPLICATE_OPEN_REQUEST)
  API->>DB: Count AVAILABLE units of the item type (409 ITEM_TYPE_UNAVAILABLE if fewer than quantity)
  API->>DB: Insert request (PENDING, borrowerId = req.user.id), line, history entry; COMMIT
  API-->>UI: 201 request
  UI-->>B: "Request #12 submitted"; catalog refreshed
```

Any failure rolls back the transaction, so a rejected request stores nothing: no request, no line and no history entry.

### 3.2 Rules

| Rule | Behavior | Source |
| --- | --- | --- |
| Available units | The count of the item type's units in `AVAILABLE`. `ON_LOAN`, `MAINTENANCE` and `RETIRED` units do not count. Never stored (DD-08) | FR-04, A-04, SDS 4.5 |
| BR-01 | A request is rejected when the item type has fewer `AVAILABLE` units than the line's quantity (1 in Sprint 1) at the moment of the request | BR-01 |
| No reservation | A `PENDING` request reserves nothing. Two Borrowers may both request the last unit; only one can be checked out (F-03) | A-04, D-15 |
| BR-04 | A Borrower may not create a request whose item type is already on one of their own open requests (`PENDING` or `APPROVED`). Requests in `CHECKED_OUT` or any final state do not block. Other Borrowers' requests do not block | BR-04, SRS glossary "Open request" |
| BR-04 under concurrency | The create transaction locks the Borrower's `users` row first, so two parallel submissions by one Borrower run one after the other and the second sees the first request. Different Borrowers do not block each other | SDS 4.7, DD-05 |
| BR-05 owner | `borrowerId` is always `req.user.id`. A body that names an owner, user or role fails the strict schema with `400` (DD-09) | BR-05 |
| BR-05 scope | For a Borrower, every read filters on `borrowerId = req.user.id`. Another Borrower's request is `404`, with the same message form as a request that does not exist: "Request <id> does not exist.", naming only the requested ID (DD-06) | BR-05, NFR-02 |
| BR-17 | `POST /api/requests` has `requireRole("BORROWER")`; a Custodian gets `403 FORBIDDEN` before the body is read | BR-17 |
| BR-16 | Creation writes one history entry in the same transaction (section 3.4) | BR-16, NFR-09 |

### 3.3 Check order

From SDS 6.5, applied to `POST /api/requests`:

| Step | Check | Result |
| --- | --- | --- |
| 1 | Session (`authenticate`) | `401 UNAUTHENTICATED` |
| 2 | Role (`requireRole("BORROWER")`) | `403 FORBIDDEN` |
| 3 | Body schema | `400 VALIDATION_FAILED` |
| 4 | Item type exists | `404 NOT_FOUND`, `details` names `lines[0].itemTypeId` |
| 5 | BR-04: no open request of this Borrower with this item type | `409 DUPLICATE_OPEN_REQUEST` |
| 6 | BR-01: enough `AVAILABLE` units | `409 ITEM_TYPE_UNAVAILABLE` |

`415 UNSUPPORTED_MEDIA_TYPE` for a body that is not JSON is handled by SR-01 for every endpoint.

### 3.4 History entry for request creation

Written in the same transaction as the insert (SDS 4.6). `now` is one timestamp taken at the start of the transaction and used for both `borrow_requests.createdAt` and `occurredAt` (F02-D5).

| Field | Value |
| --- | --- |
| `occurredAt` | `now` |
| `actorType` | `USER` |
| `actorUserId` | The signed-in Borrower's ID |
| `entityType` | `REQUEST` |
| `requestId` | The new request's ID |
| `unitId`, `loanId` | null |
| `action` | `CREATED` |
| `fromStatus` | null |
| `toStatus` | `PENDING` |
| `details` | null |

Reads write no history. No F-02 code updates or deletes a history entry, and the database trigger rejects any attempt (DD-07, AC-24).

### 3.5 Decisions made in this contract

| ID | Decision | Reason |
| --- | --- | --- |
| F02-D1 | When both BR-04 and BR-01 fail, the code is `DUPLICATE_OPEN_REQUEST` | It depends only on the Borrower's own records, so it does not change from minute to minute, and it points the Borrower to the request they already have |
| F02-D2 | Messages: `ITEM_TYPE_UNAVAILABLE`: "Arduino Uno R3 has no available units." `DUPLICATE_OPEN_REQUEST`: "You already have an open request for Arduino Uno R3 (Request #12)." `NOT_FOUND` for an item type: "Item type 999 does not exist." `NOT_FOUND` for a request: "Request 999 does not exist." The UI shows them as they are | Each names the record and the reason. The `ITEM_TYPE_UNAVAILABLE` text is the SDS 5.3 example. The request message has the same form for a missing request and another Borrower's request and names only the ID that was asked for, so it shows nothing the caller did not already send (DD-06) |
| F02-D3 | Catalog order: categories by `name`, item types by `name` within each category. Every item type is listed, including those with 0 available units, and every category, including one with no item types | Borrowers should see that an item exists even when none is free, so the "None available" state is visible (BR-01). Name order is stable for tests |
| F02-D4 | Request list order: a Borrower's list is newest first (`createdAt` descending, then `id` descending); a Custodian's list is oldest first (`createdAt` ascending, then `id` ascending) for any `status` | A Borrower looks for what they just did. A Custodian serves the longest-waiting request first; this generalizes F03-D2 |
| F02-D5 | One timestamp `now` per create, used for `createdAt` and the history `occurredAt` | One instant for one event; tests can compare them exactly |
| F02-D6 | The Borrower view of a request also has `borrower { id, username, displayName }`, which is the Borrower themself | One request shape for both roles, so the UI and the tests need one type. A Borrower may see their own profile (SDS 4.4) |
| F02-D7 | The catalog response has no unit IDs, asset tags or unit lists, for either role | Units and asset tags are for Custodians (SDS 4.4, 7.1) and are listed by `GET /api/item-types/:id/units` in F-03. One catalog shape for both roles |

### 3.6 Answers to the F-03 assumptions (F-03 contract section 2.4)

| ID | Answer |
| --- | --- |
| F02-A1 | Confirmed. A Custodian gets every Borrower's requests, filtered by `status`; a Borrower gets only their own (section 4.3) |
| F02-A2 | Confirmed, with `borrower` in both views (F02-D6), and `dueAt` and `lines[].loans` in every request (section 4.5) |
| F02-A3 | Confirmed. An invalid `status` gives `400 VALIDATION_FAILED` naming `status` |
| F02-A4 | Confirmed (section 4.4) |
| F02-A5 | Confirmed. `StatusBadge` shows every `RequestStatus` value with its text (section 5) |
| F02-A6 | Confirmed. A Borrower's list is newest first; a Custodian's list is oldest first for any `status`, which includes F03-D2 for `PENDING` (F02-D4) |
| F02-A7 | Confirmed. #18 adds `createUser`, `createCatalog` and `createRequest` (with a chosen state) to `server/tests/helpers/` if #13 does not have them. F-03 tests use the same helpers |

No answer changes the F-03 contract, so F-03 needs no new version because of F-02.

## 4. API

Conventions from SDS 6.1 to 6.5 and contract F-01 section 4: JSON bodies; every `POST` sends `Content-Type: application/json`; lists are `{ "items": [...] }`; users are `{ id, username, displayName }`; times are ISO 8601 UTC; `Cache-Control: no-store`; errors use the SDS 6.5 shape. Every endpoint below needs a session (`401 UNAUTHENTICATED` otherwise). IDs and names in the examples are illustrative.

### 4.1 `GET /api/categories`

| Item | Value |
| --- | --- |
| Who | Signed in (either role) |
| Query | None. Any query parameter gives `400 VALIDATION_FAILED` |
| Success | `200 { "items": [ category ] }`, ordered as in F02-D3 |
| Category | `id`, `name`, `description` (string or null), `itemTypes` |
| Item type | `id`, `name`, `description`, `isKit`, `maxLoanDays`, `maxQuantityPerRequest`, `availableCount` |

```json
{
  "items": [
    {
      "id": 6,
      "name": "Instruments",
      "description": null,
      "itemTypes": [
        { "id": 9, "name": "Digital multimeter", "description": "", "isKit": false, "maxLoanDays": 3, "maxQuantityPerRequest": 1, "availableCount": 3 },
        { "id": 10, "name": "Oscilloscope", "description": "", "isKit": false, "maxLoanDays": 3, "maxQuantityPerRequest": 1, "availableCount": 0 }
      ]
    },
    {
      "id": 1,
      "name": "Microcontroller boards",
      "description": null,
      "itemTypes": [
        { "id": 3, "name": "Arduino Uno R3", "description": "", "isKit": false, "maxLoanDays": 14, "maxQuantityPerRequest": 2, "availableCount": 5 }
      ]
    }
  ]
}
```

`availableCount` is computed by one grouped count on `units (itemTypeId, status)` (SDS 4.2 index), not one query per item type.

### 4.2 `POST /api/requests`

| Item | Value |
| --- | --- |
| Who | Borrower (`requireRole("BORROWER")`) |
| Body | `{ "lines": [ { "itemTypeId": int, "quantity": 1 } ] }`. Strict at both levels: no other field, such as `borrowerId` or `loanDays`. In Sprint 1 `lines` has exactly one entry, `itemTypeId` is a positive integer and `quantity` is exactly 1 (BR-01, DD-11) |
| Success | `201` with the new request (section 4.5), `status` `PENDING`, `dueAt` null, the line's `loans` empty |

| Error | Status and code | `details` and message |
| --- | --- | --- |
| No session | `401 UNAUTHENTICATED` | From F-01 |
| Custodian | `403 FORBIDDEN` | "You do not have permission to do this." |
| Body fails the schema | `400 VALIDATION_FAILED` | One entry per problem, for example `{ "field": "lines", "issue": "Sprint 1 allows exactly one line" }`, `{ "field": "lines[0].quantity", "issue": "Must be 1" }`, `{ "field": "borrowerId", "issue": "Unknown field" }` |
| Item type does not exist | `404 NOT_FOUND` | `{ "field": "lines[0].itemTypeId", "issue": "Item type does not exist" }`; "Item type 999 does not exist." |
| BR-04 | `409 DUPLICATE_OPEN_REQUEST` | `{ "field": "lines[0].itemTypeId", "issue": "Open request #12 has this item type" }`; message from F02-D2 |
| BR-01 | `409 ITEM_TYPE_UNAVAILABLE` | `{ "field": "lines[0].itemTypeId", "issue": "0 available" }`; message from F02-D2 |

### 4.3 `GET /api/requests`

| Item | Value |
| --- | --- |
| Who | Borrower: own requests only. Custodian: every Borrower's requests |
| Query | Optional `status`, one `RequestStatus` value. Any other parameter, or an unknown `status` value, gives `400 VALIDATION_FAILED` naming the parameter |
| Success | `200 { "items": [ request ] }` in the order of F02-D4, no paging in Sprint 1 |

The Custodian's `/pending` screen (F-03) calls `GET /api/requests?status=PENDING`. A Borrower who calls the same URL gets only their own pending requests, not `403`, because the scope depends on the role (SDS 6.1).

### 4.4 `GET /api/requests/:id`

| Item | Value |
| --- | --- |
| Who | Borrower: own request. Custodian: any request |
| Path | `id` a positive integer; otherwise `400 VALIDATION_FAILED` naming `id` |
| Success | `200` with the request (section 4.5) |
| Not found | `404 NOT_FOUND`, "Request 999 does not exist.", for a request that does not exist and, for a Borrower, for another Borrower's request. The body has only the `error` object (DD-06) |

### 4.5 Request representation

Every response that contains a request uses this shape, for both roles.

| Field | Value |
| --- | --- |
| `id` | Request ID |
| `status` | `RequestStatus` |
| `createdAt` | ISO 8601 UTC |
| `dueAt` | The `dueAt` shared by the request's loans (SDS 4.5), or `null` when it has none. Always `null` until F-03 creates loans |
| `borrower` | `{ id, username, displayName }` (F02-D6) |
| `lines[]` | Ordered by `id`. Each has `id`, `itemType { id, name }`, `quantity` and `loans` |
| `lines[].loans` | The line's loans as defined by F-03 (F-03 contract F03-D7); `[]` when none |

```json
{
  "id": 12,
  "status": "PENDING",
  "createdAt": "2026-11-06T06:10:00.000Z",
  "dueAt": null,
  "borrower": { "id": 3, "username": "borrower1", "displayName": "Borrower One" },
  "lines": [
    { "id": 5, "itemType": { "id": 3, "name": "Arduino Uno R3" }, "quantity": 1, "loans": [] }
  ]
}
```

Services select these fields explicitly; no response contains `passwordHash`, `borrowerId` as a raw column, or another Borrower's data (SDS 6.3).

## 5. UI

| Screen or element | Behavior |
| --- | --- |
| Catalog `/catalog` (both roles) | One section per category with its name, then one row per item type: name, a "Kit" label when `isKit`, and the available count as "3 available" or "None available". Uses `AsyncState`: "Loading…", the empty message "The catalog is empty." and the error message with "Try again" (NFR-12) |
| Request action (Borrower only) | A "Request" button on each item type row. Disabled when `availableCount` is 0; the API still checks (SDS 3.5). Pressing it sends `POST /api/requests` with that item type and quantity 1; while it runs the button is disabled with a spinner, so a double click sends one call. No confirmation dialog (SDS 5.3 lists none for requests) |
| After a request | Success: "Request #12 submitted" with a link to My requests, and the catalog is fetched again. `409`: an alert at the top of the catalog with the API message, and the catalog is fetched again because the count may have changed. `401`: the F-01 session-ended behavior |
| Custodian on the catalog | Same list without the Request button |
| My requests `/requests` (Borrower) | Own requests newest first. Each row: "Request #12", each line as "Arduino Uno R3 × 1", a `StatusBadge` and the creation time as "6 Nov 2026, 13:10" (Asia/Bangkok). A row opens the detail. Empty: "You have no requests yet." with a link to the catalog. Loading and error as in the catalog |
| Request detail `/requests/:id` (Borrower own, Custodian) | Title "Request #12" with its `StatusBadge`, the creation time and the lines. After checkout, each line also shows its unit's asset tag and the due date (fields from F-03). A `404` shows "Request not found." with a link to My requests |
| `StatusBadge` | Shows the state's text for every `RequestStatus` value, never color alone (SDS 5.3) |
| Navigation | Borrower links: Catalog, My requests. A Borrower lands on `/catalog` after sign-in (SDS 5.2). `/requests` and `/requests/:id` use `RequireRole` for the Borrower list; the detail route allows both roles |

## 6. Data

| Layer | Change |
| --- | --- |
| Tables read | `categories`, `item_types`, `units` (count only), `borrow_requests`, `request_lines`, `users` (lock and the `borrower` object), `loans` (from F-03, for `dueAt` and `lines[].loans`) |
| Tables written | `borrow_requests` (insert), `request_lines` (insert), `history_entries` (insert) |
| Schema | As in SDS 4.2. `borrow_requests.loanDays`, `decidedById`, `decidedAt` and `rejectionReason` stay null in Sprint 1 |
| Constraints relied on | `request_lines (requestId, itemTypeId)` unique; `quantity` CHECK ≥ 1; history CHECKs and append-only trigger (SDS 4.3) |
| Indexes relied on | `units (itemTypeId, status)` for available counts; `borrow_requests (borrowerId, status)` for BR-04 and the Borrower list; `(status, createdAt)` for the Custodian list |
| Migration | None in #18 if #13's first migration has the tables, constraints and indexes above. Anything missing is added by #18 in an additive migration (DD-14) and recorded here as a new version |
| Seed | No change; the catalog and demo Borrowers come from #13 (SDS 4.8). The Oscilloscope with 0 available units is the fixed BR-01 case for demos and E2E |
| Configuration | No new variable |

## 7. Acceptance criteria

### 7.1 Adopted from `docs/features.md` 4.2 (unchanged)

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-08 | A signed-in user sees categories, their item types and the available unit count of each | FR-04 |
| AC-09 | A Borrower requests one unit of an item type with available units; the request is stored as `PENDING` and its owner is the signed-in Borrower | FR-07, BR-05 |
| AC-10 | A request for an item type with 0 available units is rejected and nothing is stored | BR-01 |
| AC-11 | A Borrower with an open request for an item type cannot create a second request for the same item type | BR-04 |
| AC-12 | A request that names another Borrower as its owner is rejected | BR-05 |
| AC-13 | A Borrower's request list contains only their own requests, each with its lines, state and creation time, and they can open each one to see its details | FR-08 |
| AC-14 | A Borrower who opens another Borrower's request by ID is rejected and receives none of its fields | BR-05, NFR-02 |
| AC-15 | A Custodian who creates a request is rejected and nothing is stored | BR-17, NFR-02 |
| AC-16 | Creating a request writes a history entry with the Borrower as actor and a timestamp | BR-16, NFR-09 |
| AC-17 | The catalog and the Borrower's request list show a loading, an empty and an error state | NFR-12 |

### 7.2 Added by this contract

Numbers 33 to 40 are the block reserved for F-02 (`docs/features.md` section 1, from PR #28).

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-33 | A call without a valid session to the catalog, request creation, the request list or a request's detail is rejected with `401 UNAUTHENTICATED`, returns no catalog or request data, and nothing is stored | NFR-01 |
| AC-34 | A create body that fails the schema (missing `lines`, zero or two lines, `quantity` other than 1, a non-integer or non-positive `itemTypeId`, an unknown field such as `loanDays`) is rejected with `400 VALIDATION_FAILED` naming each problem in `details`, and nothing is stored | FR-07 |
| AC-35 | A create with an `itemTypeId` that does not exist is rejected with `404 NOT_FOUND` naming `lines[0].itemTypeId`, and nothing is stored | FR-07 |
| AC-36 | BR-04 blocks only the Borrower's own open requests with the same item type: with an open request for item type A, the Borrower can still request item type B; after their request for A is `CHECKED_OUT`, they can request A again; another Borrower's open request for A does not block them | BR-04 |
| AC-37 | Two simultaneous create calls by the same Borrower for the same item type store exactly one request; the other is rejected with `409 DUPLICATE_OPEN_REQUEST` | BR-04 |
| AC-38 | When the item type has 0 available units and the Borrower already has an open request for it, the rejection is `409 DUPLICATE_OPEN_REQUEST`; each `409` message names the item type, and the duplicate message also names the open request | BR-01, BR-04 |
| AC-39 | A Borrower's list holds their own requests in every state, newest first, and `?status=PENDING` narrows it to their own pending requests; a Custodian's list is oldest first; an unknown `status` or query parameter, or a non-integer request ID, gives `400 VALIDATION_FAILED`; a request ID that does not exist gives `404 NOT_FOUND` in the same form as another Borrower's request: the same `code`, only the `error` object, and the message "Request <id> does not exist." with the requested ID | FR-08, BR-05 |
| AC-40 | In the catalog, a Borrower's Request button is disabled with "None available" when the count is 0; pressing an enabled button once sends one request, shows "Request #n submitted" and refreshes the catalog; a `409` is shown as an alert with the API message; a Custodian sees no Request button | FR-07, BR-01, BR-17 |

## 8. Software Test Specification

### 8.1 Conventions

- Levels and tools from SDS section 10. API and Integration tests run with Vitest and Supertest against `kithub_test`, emptied with `TRUNCATE` before each file, files one at a time. UI tests use Vitest and Testing Library with the API module mocked.
- Every test creates its own data with the helpers in F02-A7, never the demo seed: two Borrowers (B1, B2), one Custodian (C), item types "Arduino Uno R3" (A) and "ESP32 DevKitC" (E) with units in the states each case needs, and "Oscilloscope" (O) with one `MAINTENANCE` unit. All sign-in and sign-out goes through the shared helper from contract F-01 section 8.
- "Nothing is stored" means the planned helper `snapshotRequestState()` (counts of `borrow_requests`, `request_lines` and `history_entries`) is equal before and after the call.
- **TDD** marks the tests for BR-01 and BR-04, including TEST-38 for the rule order of F02-D1 that `requestRuleViolation` implements (issue #18). For each, #18 first commits the test, runs it and keeps the failing output with that commit's SHA, then commits the implementation and keeps the passing output.
- Supporting unit tests of the domain rule `requestRuleViolation({ hasOpenRequest, availableCount, quantity })` in `server/src/domain/` run inside TEST-10, TEST-11 and TEST-38 (level Unit + API).

### 8.2 Test cases

| Test | AC | Level | Precondition / input | Action | Expected result | File |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-08 | AC-08 | API | Two categories. A has units `AVAILABLE` ×2, `ON_LOAN` ×1, `MAINTENANCE` ×1, `RETIRED` ×1; O has one `MAINTENANCE` unit; a third category has no item types | `GET /api/categories` as B1, then as C | `200`; both bodies equal; categories and item types ordered by name; A `availableCount` 2, O 0; the empty category is listed with `itemTypes: []`; no unit ID or asset tag anywhere in the body (F02-D7) | `server/tests/api/catalog.test.ts` |
| TEST-09 | AC-09 | API | A has 2 `AVAILABLE` units; B1 signed in | `POST /api/requests` with `{ lines: [ { itemTypeId: A, quantity: 1 } ] }` | `201`; body `status` `PENDING`, `borrower.id` = B1, one line for A with quantity 1, `dueAt` null, `loans` `[]`; one new `borrow_requests` row with `borrowerId` = B1; unit states unchanged | `server/tests/api/requests-create.test.ts` |
| TEST-10 | AC-10 | Unit + API | Unit: `requestRuleViolation` with `availableCount` 0 and 1. API: O has 0 available; B1 signed in | Unit: call the rule. API: `POST /api/requests` for O | Unit: 0 gives `ITEM_TYPE_UNAVAILABLE`, 1 gives none. API: `409 ITEM_TYPE_UNAVAILABLE`, message "Oscilloscope has no available units."; nothing stored. **TDD** | `server/tests/unit/request-rules.test.ts`, `server/tests/api/requests-create.test.ts` |
| TEST-11 | AC-11 | Unit + API | Unit: `hasOpenRequest` true and false. API: B1 has a `PENDING` request for A; a second case with an `APPROVED` request for A | Unit: call the rule. API: `POST /api/requests` for A | Unit: true gives `DUPLICATE_OPEN_REQUEST`. API: `409 DUPLICATE_OPEN_REQUEST` in both cases; nothing stored. **TDD** | `server/tests/unit/request-rules.test.ts`, `server/tests/api/requests-create.test.ts` |
| TEST-12 | AC-12 | API | B1 signed in | `POST /api/requests` with the valid line plus `borrowerId: B2`; a second case with `role: "CUSTODIAN"` | `400 VALIDATION_FAILED` with `details` naming `borrowerId` and `role`; nothing stored; no request owned by B2 exists | `server/tests/api/requests-create.test.ts` |
| TEST-13 | AC-13 | API | B1 has requests R1 (`PENDING`) and R2 (`CHECKED_OUT`); B2 has R3 | `GET /api/requests` as B1, then `GET /api/requests/R1` and `/R2` | List has exactly R1 and R2, each with `lines` (item type and quantity), `status` and `createdAt`; each detail `200` with the same fields as its list entry | `server/tests/api/requests-read.test.ts` |
| TEST-14 | AC-14 | API | B2 has R3; B1 signed in | `GET /api/requests/R3` as B1 | `404 NOT_FOUND`; the body has only the `error` object, with no field of R3; `code` is `NOT_FOUND` and the message is "Request <R3> does not exist." with R3's ID, the same form as for a request ID that does not exist (TEST-39) | `server/tests/api/requests-access.test.ts` |
| TEST-15 | AC-15 | API | C signed in; A has available units | `POST /api/requests` for A as C | `403 FORBIDDEN`; nothing stored | `server/tests/api/requests-access.test.ts` |
| TEST-16 | AC-16 | Integration | B1 signed in | Create a request for A, then read `history_entries` for it | Exactly one entry: `entityType` `REQUEST`, `action` `CREATED`, `fromStatus` null, `toStatus` `PENDING`, `actorType` `USER`, `actorUserId` B1, `occurredAt` equal to the request's `createdAt` (F02-D5) | `server/tests/api/requests-history.test.ts` |
| TEST-17 | AC-17 | UI | API module mocked: slow, empty and failing responses | Render the catalog and My requests | Each shows "Loading…" first; empty shows its message ("The catalog is empty.", "You have no requests yet." with a catalog link); error shows the API message and "Try again", which calls the API again | `client/tests/catalog.test.tsx`, `client/tests/my-requests.test.tsx` |
| TEST-33 | AC-33 | API | No cookie; then a cookie of a signed-out session | `GET /api/categories`, `POST /api/requests` (valid body), `GET /api/requests`, `GET /api/requests/1` | Every call `401 UNAUTHENTICATED` with only the `error` object; nothing stored | `server/tests/api/requests-access.test.ts` |
| TEST-34 | AC-34 | API | B1 signed in | `POST /api/requests` with: no `lines`; `lines: []`; two lines; `quantity: 2`; `itemTypeId: "A"`; `itemTypeId: 0`; extra `loanDays: 7` | Each `400 VALIDATION_FAILED` with a `details` entry for the field named; nothing stored | `server/tests/api/requests-create.test.ts` |
| TEST-35 | AC-35 | API | B1 signed in; item type 999999 does not exist | `POST /api/requests` for 999999 | `404 NOT_FOUND`, `details` names `lines[0].itemTypeId`; nothing stored | `server/tests/api/requests-create.test.ts` |
| TEST-36 | AC-36 | API | B1 has a `PENDING` request for A and a `CHECKED_OUT` request for E; B2 has no request; A and E have `AVAILABLE` units | (a) As B1: request E. (b) As B2: request A. (c) As B1: request A | (a) `201`: the `CHECKED_OUT` request for E does not block, and the open request for A does not block another item type. (b) `201`: B1's open request does not block B2. (c) `409 DUPLICATE_OPEN_REQUEST`. **TDD** | `server/tests/api/requests-create.test.ts` |
| TEST-37 | AC-37 | Integration | A has 2 `AVAILABLE` units; B1 signed in | Send two `POST /api/requests` for A as B1 at the same time (`Promise.all`) | One `201` and one `409 DUPLICATE_OPEN_REQUEST`; exactly one `borrow_requests` row for B1 and one history entry. Run 20 times in the test to catch an ordering that passes by chance; each iteration starts clean (tables truncated, B1 and A seeded again) and the counts are checked per iteration. **TDD** | `server/tests/api/requests-concurrency.test.ts` |
| TEST-38 | AC-38 | Unit + API | Unit: `hasOpenRequest` true with `availableCount` 0. API: B1 has a `PENDING` request R1 for O (created through the helper); O has 0 available | Unit: call the rule. API: `POST /api/requests` for O | Unit: `DUPLICATE_OPEN_REQUEST`. API: `409 DUPLICATE_OPEN_REQUEST`, message "You already have an open request for Oscilloscope (Request #R1)."; nothing stored. **TDD** | `server/tests/unit/request-rules.test.ts`, `server/tests/api/requests-create.test.ts` |
| TEST-39 | AC-39 | API | B1 has R1 (`PENDING`, older), R2 (`CHECKED_OUT`), R4 (`PENDING`, newest); B2 has R3 (`PENDING`) | As B1: `GET /api/requests`, `?status=PENDING`, `?status=WAITING`, `?foo=1`, `GET /api/requests/abc`, `GET /api/requests/999999`. As C: `GET /api/requests?status=PENDING` | B1 list R4, R2, R1; B1 pending R4, R1; unknown status and unknown parameter `400` naming the parameter; `abc` `400` naming `id`; `999999` `404` with the same keys and `code` as TEST-14's body and the message "Request 999999 does not exist.". C pending list R1, R3, R4 (oldest first) | `server/tests/api/requests-read.test.ts` |
| TEST-40 | AC-40 | UI | API module mocked; catalog with A (2 available) and O (0) | As a Borrower: press Request on A twice quickly; then a mocked `409` on A. As a Custodian: render the catalog | O's button disabled with "None available"; one create call for the double press; "Request #12 submitted" shown and the catalog fetched again; on `409` the alert shows the API message and the catalog is fetched again; the Custodian view has no Request button | `client/tests/catalog.test.tsx` |

The E2E tests in #20 cover F-02 through the UI: requesting an item and seeing it `PENDING` in TEST-30, and the duplicate request refused with the rule's message in TEST-31.

### 8.3 Coverage checks

- Every AC in section 7 has a test with the same number: AC-08 to AC-17 by TEST-08 to TEST-17, AC-33 to AC-40 by TEST-33 to TEST-40.
- Every F-02 endpoint has a no-session test (TEST-33). The Borrower-only endpoint has a wrong-role test (TEST-15). Every endpoint that returns Borrower-owned records has a cross-Borrower test: the detail in TEST-14, the list in TEST-13 and TEST-39 (SDS 7.3).
- Every rejection test checks that nothing is stored, not only the status code.

## 9. Definition of Done

The product-level Definition of Done for Sprint 1 is [`definition-of-done.md`](definition-of-done.md), added by contract F-03 (#28); it applies to F-02 as well. The items below are what F-02 must show for it.

F-02 is done when all of the following are true and recorded in the PR for #18:

1. The behavior in sections 3 to 6 is implemented; any difference is recorded in the version history with its reason.
2. The failing tests marked **TDD** (TEST-10, TEST-11, TEST-36, TEST-37, TEST-38) were committed before the implementation, and the failing and passing runs are recorded with their commit SHAs.
3. TEST-08 to TEST-17 and TEST-33 to TEST-40 pass; the command, the counts (passed, failed, skipped) and the tested commit are in the PR. Failed or skipped tests are disclosed, not removed.
4. No password, token or secret is in the repository, the logs or any API response, and no response contains another Borrower's data.
5. The PR into `staging` is reviewed by the teammate with a specific check or finding, and CI passes.
6. The README setup steps still work from a clean clone, and the traceability rows for F-02 are updated.
7. Known incomplete work is listed in the PR.
