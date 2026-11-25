# F-04 Multi-line requests and item type detail: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-04 Multi-line requests and item type detail |
| Sprint | 2 (due 2026-11-29) |
| Version | 1.0 |
| Status | Proposed (PR for #74); implementation starts only after this contract is reviewed and merged |
| Date | 2026-11-25 |
| Authors | Methipat Mansap (67070501071); reviewer Teerakarn Noiruksa (67070501062) |
| Baseline | SRS v1.3 (v1.4 after #71), System-Level SDS v1.8 (Sprint 2 columns from #73), F-02 contract v1.3 |
| Issues | #74 this feature; #73 `borrow_requests.loanDays` and its CHECK (PR #80) |
| Definition of Done | [Product Definition of Done](../sprint-1/definition-of-done.md) and section 9 of this contract |
| AC/TEST block | 62 to 71 (claimed in #74) |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-25 | Methipat Mansap | First contract: AC-62 to AC-71, TEST-62 to TEST-71, decisions F04-D1 to F04-D9. Replaces the Sprint 1 create rule "exactly one line with quantity 1" (F-02 4.2, AC-34) |

Changes after approval get a new version row with the reason. AC and TEST IDs are never reused for a different meaning.

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What F-04 does with it |
| --- | --- | --- |
| Functional | FR-05, FR-10 | Item type detail with description, limits and available count; a request with one or more lines and one loan length for the whole request, with the item type that sets the maximum shown in the UI |
| Business rules | BR-01, BR-04, BR-06, BR-07, BR-08 | Enough available units per line; no item type on two open requests; the Borrower never names a unit; quantity 1 to the item type's maximum; loan length 1 to the smallest maximum among the lines |
| Business rules (unchanged, still enforced) | BR-05, BR-16, BR-17 | Owner is the signed-in Borrower; one `CREATED` history entry; only Borrowers create requests |
| SRS decisions | D-06, D-08, D-15, D-19 | One state and one loan length per request; default limits; no reservation before Sprint 3; a request within 3 clicks from the catalog (NFR-10) |
| Non-functional | NFR-01, NFR-02, NFR-10, NFR-12 | Session and role checks; 3-click request; loading, empty and error states |

### 2.2 Depends on

| Dependency | What F-04 uses | Status on 2026-11-25 |
| --- | --- | --- |
| #73 Sprint 2 columns | `borrow_requests.loanDays` (nullable, CHECK ≥ 1) | PR #80 open |
| F-01 | `authenticate`, `requireRole`, route guards, navigation bar | Done |
| F-02 | `POST /api/requests`, `requestRuleViolation`, the Borrower row lock (SDS 4.7), request representation (F-02 4.5), catalog page | Done |

F-05 (#75) reuses the body schema, the rule check and the request form of this contract for the edit. F-07 (#77) checks out the requests that F-04 creates, so its body limit follows F04-D2 and F09-D3 (at most 10 lines × 10 units).

### 2.3 Out of scope for F-04

| Not in F-04 | Arrives in |
| --- | --- |
| Editing or cancelling a request | F-05 (#75) |
| The 5-unit limit per Borrower (BR-14) and the overdue block (BR-15) | Sprint 3 |
| Quantities reserved by `APPROVED` requests in the available count (BR-13) | Sprint 3, F-10 |
| Search and filter in the catalog (FR-06) | Sprint 3 |
| Changing an item type's limits | F-09 (#79); F-04 only reads them |

## 3. Feature-level design (Feature SDS)

### 3.1 Behaviour and workflow

**Item type detail (FR-05).**

1. In the catalog, each item type name links to `/catalog/item-types/:id`. The UI calls `GET /api/item-types/:id`.
2. The page shows the name, the "Kit" label when `isKit`, the category, the description, "Maximum loan length: 14 days", "Maximum per request: 2" and "3 available" (or "None available").
3. A Borrower also sees **Request**, disabled when none is available. It opens the request form with this item type on its first line (F04-D5).

**Create a request (FR-10).**

1. A Borrower opens **New request** (`/requests/new`), from the navigation bar, from **Request** in the catalog or from the item type detail. With `?itemTypeId=3` the form starts with that item type, quantity 1 and the loan length set to its maximum.
2. The Borrower adds lines (item type and quantity), removes lines and chooses one loan length in days. The form shows the largest allowed loan length and the item type that sets it: "Loan length: up to 3 days (limited by Digital multimeter)". When the lines have different maximums it adds: "Need Arduino Uno R3 for longer? Submit it as a separate request." (FR-10).
3. **Submit request** calls `POST /api/requests` with `{ "lines": [ { "itemTypeId", "quantity" } ], "loanDays" }`.
4. The server runs `authenticate`, `requireRole("BORROWER")`, the strict body schema, then one transaction:
   1. Locks the Borrower's `users` row (SDS 4.7, DD-05).
   2. Reads every line's item type (`404` for the first missing one in body order).
   3. Checks the rules in the order of 3.5 and stops at the first rule that fails.
   4. Inserts the request (`PENDING`, `borrowerId` from the session, `loanDays`), one `request_lines` row per line and one history entry (3.6), all with one `now`.
5. The server returns `201` with the request. The UI goes to `/requests/:id` and shows "Request #12 submitted."
6. Any failure rolls back: no request, no line and no history entry is stored.

### 3.2 State changes

| Entity | From | To | SRS row | Trigger |
| --- | --- | --- | --- | --- |
| Request | (new) | `PENDING` | 8.2, Sprint 1 | Created by its Borrower (unchanged from F-02) |

No unit or loan changes. A `PENDING` request reserves nothing (D-15).

### 3.3 Business rules and where they are enforced

| Rule | UI (hint only) | Route and middleware | Service (in the transaction) | Domain | Database |
| --- | --- | --- | --- | --- | --- |
| Borrower only (BR-17, NFR-02) | Form and Request buttons only for Borrowers | `requireRole("BORROWER")` | - | - | - |
| Owner is self (BR-05) | - | Strict schema: `borrowerId` or any other field → `400` | `borrowerId = req.user.id` | - | FK |
| No unit chosen by the Borrower (BR-06) | No unit or asset tag in the form | Strict line schema: `unitId`, `assetTag` → `400` | - | - | - |
| One line per item type | Each item type can be picked once | Schema: `itemTypeId` values distinct → `400` | - | - | `request_lines (requestId, itemTypeId)` unique |
| Quantity 1 to the item type's maximum (BR-07) | Quantity choice limited to 1..max | Schema: integer 1 to 10 (F09-D3 upper bound) | `quantity ≤ maxQuantityPerRequest` → `409 QUANTITY_LIMIT` | `requestRuleViolation` | CHECK `quantity ≥ 1` |
| One loan length, 1 to the smallest maximum (BR-08) | Input limited to 1..smallest max; the limiting item type is named | Schema: integer 1 to 365 | `loanDays ≤ min(maxLoanDays)` → `409 LOAN_LENGTH_LIMIT` | `requestRuleViolation` | CHECK `loanDays ≥ 1` (#73) |
| Enough available units per line (BR-01) | "None available" disables Request; the form shows each line's available count | - | `availableCount ≥ quantity` for every line → `409 ITEM_TYPE_UNAVAILABLE` | `requestRuleViolation` | - |
| No item type on two open requests (BR-04) | - | - | No line's item type is on another `PENDING` or `APPROVED` request of the Borrower → `409 DUPLICATE_OPEN_REQUEST` | `requestRuleViolation` | Borrower row lock |
| History (BR-16) | - | - | One `CREATED` entry in the same transaction | - | Append-only trigger |

### 3.4 Validation

| Input | Rule | Error |
| --- | --- | --- |
| `GET /api/item-types/:id` path `id` | Integer 1 to 2 147 483 647 | `400 VALIDATION_FAILED` naming `id` |
| `GET /api/item-types/:id` query | None allowed | `400` naming the parameter |
| Create body | Strict `{ lines, loanDays }`; both required | `400` naming the missing or unknown field |
| `lines` | Array of 1 to 10 strict entries `{ itemTypeId, quantity }` (F04-D2) | `400` naming `lines` ("Must have 1 to 10 lines") or the unknown field, for example `lines[0].unitId` |
| `lines[i].itemTypeId` | Integer 1 to 2 147 483 647; no value twice in `lines` | `400` naming `lines[i].itemTypeId` ("Must be a positive integer", "Item type 3 is listed twice") |
| `lines[i].quantity` | Integer 1 to 10 | `400` naming `lines[i].quantity` ("Must be an integer from 1 to 10") |
| `loanDays` | Integer 1 to 365 | `400` naming `loanDays` ("Must be an integer from 1 to 365") |
| `Content-Type` on POST | `application/json` (SDS 6.2) | `415` |

The schema bounds (10 lines, quantity 10, 365 days) only reject absurd input. The real limits come from the item types and are checked by the service with `409` (DD-10), because they depend on data.

### 3.5 Check order

`401` (no session) → `403` (not a Borrower) → `415` → `400` (body shape) → transaction: lock the Borrower row → `404` (first line whose item type does not exist, in body order) → `409 DUPLICATE_OPEN_REQUEST` (BR-04) → `409 QUANTITY_LIMIT` (BR-07) → `409 LOAN_LENGTH_LIMIT` (BR-08) → `409 ITEM_TYPE_UNAVAILABLE` (BR-01).

Rules that depend only on the Borrower's own records or on the catalog limits come before the rule that changes from minute to minute (F04-D3, extends F02-D1). Each `409` names the first line that breaks the rule, in body order, in its message, and lists every line that breaks the same rule in `details`.

### 3.6 History entry

Unchanged from F-02 3.4: one entry, `actorType` `USER`, `actorUserId` the Borrower, `entityType` `REQUEST`, `action` `CREATED`, `fromStatus` null, `toStatus` `PENDING`, `details` null, `occurredAt` = `createdAt` = `now`. The lines and loan length are in the request row, so the entry does not copy them.

### 3.7 Concurrency

- Two creates by the same Borrower that share an item type (for example A + B and B + C): the Borrower row lock makes them run one after the other, so the second sees the first as an open request with B and gets `409 DUPLICATE_OPEN_REQUEST`. Exactly one request is stored (extends AC-37 to several lines).
- Two Borrowers who both request the last unit of an item type both succeed, as in Sprint 1. Requests reserve nothing before Sprint 3 (D-15), and checkout is the step that cannot double-allocate (BR-03).

### 3.8 Decisions made in this contract

| ID | Decision | Reason |
| --- | --- | --- |
| F04-D1 | `loanDays` is required in every create from Sprint 2. Requests created in Sprint 1 keep `loanDays` null; F-07 (F07-D3) gives them the smallest `maxLoanDays` of their item types | SDS 4.2: "Required by the API from Sprint 2 (BR-08)". FR-10 asks the Borrower to choose the length |
| F04-D2 | A request has 1 to 10 lines; quantity per line is 1 to 10 at schema level, so a request holds at most 100 units | One line per item type; 10 lines covers a lab kit list and keeps the form usable. With the F09-D3 cap of 10 per item type, 100 is the largest checkout F-07 must accept |
| F04-D3 | Rule order BR-04 → BR-07 → BR-08 → BR-01 | BR-04 points the Borrower to the request they already have (F02-D1). BR-07 and BR-08 depend on catalog limits that the Borrower can see, so they are reported before the availability, which can change a minute later |
| F04-D4 | `409` messages. `QUANTITY_LIMIT`: "You can request at most 1 Digital multimeter at a time." `LOAN_LENGTH_LIMIT`: "The loan length can be at most 3 days because of Digital multimeter." `ITEM_TYPE_UNAVAILABLE`: "Arduino Uno R3 has no available units." when 0 are available (F02-D2), otherwise "Arduino Uno R3 has only 1 available unit; you asked for 2." `DUPLICATE_OPEN_REQUEST` unchanged from F02-D2 | Each names the item type and the limit the Borrower can act on. `QUANTITY_LIMIT` and `LOAN_LENGTH_LIMIT` are the codes SDS 6.5 reserves for BR-07 and BR-08 |
| F04-D5 | The catalog's **Request** button and the item type detail's **Request** button open `/requests/new?itemTypeId=<id>` with quantity 1 and the loan length set to the item type's maximum. **Submit request** sends it. That is 2 clicks from the catalog | Sprint 1 sent the request from the catalog directly, but a Sprint 2 request needs a loan length the Borrower can see and change (FR-10). 2 clicks meets NFR-10 (D-19, 3 clicks) |
| F04-D6 | `GET /api/item-types/:id` returns `id`, `name`, `description`, `isKit`, `maxLoanDays`, `maxQuantityPerRequest`, `availableCount` and `category { id, name }`, the same for both roles, with no unit IDs or asset tags | The catalog item shape (F-02 4.1) plus the category for the page title. Units are for Custodians (F02-D7) |
| F04-D7 | The request representation (F-02 4.5) gains `loanDays` (integer, or `null` for Sprint 1 requests) for both roles. Lines stay ordered by `id`, which is the body order of the create | The Borrower and the Custodian both need the loan length (FR-10, FR-13). F-06 (F06-D4) adds the same field; whichever PR merges second keeps one definition |
| F04-D8 | The new request form is one component, `RequestForm`, used by `/requests/new` here and by `/requests/:id/edit` in F-05 | FR-11: an edit is checked against the same rules as a new request; one form keeps the hints the same |
| F04-D9 | Sprint 1 tests that create a request send `loanDays` from now on: the helper `oneLine(itemTypeId)` becomes `{ lines: [ { itemTypeId, quantity: 1 } ], loanDays: 1 }`. AC-34 and TEST-34 are revised: two lines, a quantity above 1 and `loanDays` are now valid; a missing `loanDays`, eleven lines and a repeated item type are the new shape failures. AC-40 and TEST-40 are revised for F04-D5: **Request** in the catalog opens the form instead of sending the request. E2E TEST-30 and TEST-31 submit through the form | The requirement changed (FR-07 one line → FR-10 several lines). The rules those tests protect (BR-01, BR-04, BR-05, BR-17) do not change, and none of their rule assertions is removed |

## 4. UI specification

### 4.1 Layers changed by F-04

| Layer | Change |
| --- | --- |
| UI | New item type detail page; new request page with `RequestForm`; catalog names link to the detail; catalog **Request** opens the form; "New request" in the Borrower navigation; loan length on the request detail and in My requests |
| API | New `GET /api/item-types/:id`; `POST /api/requests` accepts several lines, quantities and `loanDays`; the request representation adds `loanDays` |
| Domain | `requestRuleViolation` takes every line and the loan length and returns the first broken rule with the lines that break it |
| Database | None beyond #73 |

### 4.2 Item type detail (`/catalog/item-types/:id`, both roles)

- Title: the item type name, with the "Kit" label when `isKit`; under it the category name.
- Body: the description (or "No description." when empty), "Maximum loan length: 14 days", "Maximum per request: 2", and "3 available" or "None available".
- Borrower: **Request** (disabled with "None available" when 0), which opens `/requests/new?itemTypeId=<id>`. Custodian: no Request button.
- States through `AsyncState`: "Loading…"; a `404` shows "Item type not found." with a link to the catalog; other errors show the message and "Try again".
- Planned files: `client/src/pages/ItemTypePage.tsx`, `client/src/api/catalog.ts` (extended with `getItemType`).

### 4.3 New request (`/requests/new`, Borrower)

| Element | Behaviour |
| --- | --- |
| Lines | One row per line: item type (a select of every item type, grouped by category; an item type already on another line of the form is not offered) with its "n available", and quantity (a select from 1 to the item type's `maxQuantityPerRequest`). **Add line** (hidden at 10 lines) and **Remove** (hidden when only one line is left) |
| Loan length | Number input from 1 to the smallest `maxLoanDays` among the lines; the hint "Loan length: up to 3 days (limited by Digital multimeter)". When the form's lines have different maximums, also "Need Arduino Uno R3 for longer? Submit it as a separate request." naming the item type with the largest maximum |
| Starting values | Without a query: one empty line and no loan length. With `?itemTypeId=3`: that item type, quantity 1, loan length = its `maxLoanDays` |
| Submit | **Submit request**, disabled until every line has an item type and the loan length is set. While submitting, the button is disabled with a spinner, so a double click sends one call |
| Success | Navigates to `/requests/12`, which shows "Request #12 submitted." |
| `409` | An alert at the top of the form with the API message; the item types are fetched again because counts may have changed. The form keeps what the Borrower entered |
| `400` | The `details` shown under the matching fields (SDS 5.3). The UI never sends such a body, but the API is the authority |
| Loading the item types | Uses `GET /api/categories`; "Loading…" and the error with "Try again" as in the catalog. With an empty catalog: "The catalog is empty." and no Submit |
| `401`, `403` | Shared behaviour (SDS 5.3). A Custodian who opens `/requests/new` sees the Forbidden page |

Planned files: `client/src/pages/requests/NewRequestPage.tsx`, `client/src/pages/requests/RequestForm.tsx`, `client/src/api/requests.ts` (extended).

### 4.4 Other screens

| Screen | Change |
| --- | --- |
| Catalog | Each item type name links to its detail. **Request** opens `/requests/new?itemTypeId=<id>` (F04-D5) |
| Navigation (Borrower) | "New request" after "Catalog" |
| My requests | Each row shows every line ("Arduino Uno R3 × 2, HC-SR04 ultrasonic sensor × 1") and "7 days" when `loanDays` is set |
| Request detail | "Loan length: 7 days" when `loanDays` is set; one row per line with its quantity |

## 5. API specification

Conventions from SDS 6.1 to 6.5 (JSON, ISO 8601 UTC times, error shape `{ "error": { "code", "message", "details", "requestId" } }`, `Cache-Control: no-store`).

### 5.1 `GET /api/item-types/:id` (new)

| Aspect | Specification |
| --- | --- |
| Who | Signed in (either role). No session: `401` |
| Path / query | `id` integer ≥ 1; no query parameter |
| Success | `200` with the item type (F04-D6) |
| Errors | `400 VALIDATION_FAILED`, `404 NOT_FOUND` "Item type 999 does not exist." |

```json
{
  "id": 9,
  "name": "Digital multimeter",
  "description": "Handheld digital multimeter.",
  "isKit": false,
  "maxLoanDays": 3,
  "maxQuantityPerRequest": 1,
  "availableCount": 3,
  "category": { "id": 6, "name": "Instruments" }
}
```

`availableCount` is the count of the item type's units in `AVAILABLE` (SDS 4.5), the same value the catalog shows.

### 5.2 `POST /api/requests` (changed)

| Aspect | Specification |
| --- | --- |
| Who | Borrower only. Custodian: `403`. No session: `401` |
| Body | `{ "lines": [ { "itemTypeId": int, "quantity": int } ], "loanDays": int }`, strict at both levels (3.4) |
| Success | `201` with the new request (F-02 4.5 plus `loanDays`, F04-D7), `status` `PENDING`, `dueAt` null, every line's `loans` empty |
| Errors | `400 VALIDATION_FAILED`, `404 NOT_FOUND`, `409 DUPLICATE_OPEN_REQUEST`, `409 QUANTITY_LIMIT`, `409 LOAN_LENGTH_LIMIT`, `409 ITEM_TYPE_UNAVAILABLE`, in the order of 3.5 |

Example: Borrower One asks for 2 Arduino Uno R3 (maximum 2, 14 days) and 1 HC-SR04 ultrasonic sensor (maximum 4, 14 days) for 7 days.

```json
{ "lines": [ { "itemTypeId": 3, "quantity": 2 }, { "itemTypeId": 7, "quantity": 1 } ], "loanDays": 7 }
```

Response `201`:

```json
{
  "id": 12,
  "status": "PENDING",
  "createdAt": "2026-11-30T03:00:00.000Z",
  "loanDays": 7,
  "dueAt": null,
  "borrower": { "id": 3, "username": "borrower1", "displayName": "Borrower One" },
  "lines": [
    { "id": 20, "itemType": { "id": 3, "name": "Arduino Uno R3" }, "quantity": 2, "loans": [] },
    { "id": 21, "itemType": { "id": 7, "name": "HC-SR04 ultrasonic sensor" }, "quantity": 1, "loans": [] }
  ]
}
```

Rule errors (each names every line that breaks the reported rule):

| Rule | Example body | Response |
| --- | --- | --- |
| BR-07 | Digital multimeter × 2 | `409 QUANTITY_LIMIT`, "You can request at most 1 Digital multimeter at a time.", `details: [ { "field": "lines[0].quantity", "issue": "Maximum 1" } ]` |
| BR-08 | Arduino Uno R3 × 1 and Digital multimeter × 1, `loanDays` 7 | `409 LOAN_LENGTH_LIMIT`, "The loan length can be at most 3 days because of Digital multimeter.", `details: [ { "field": "loanDays", "issue": "Maximum 3 (Digital multimeter)" } ]` |
| BR-01 | Arduino Uno R3 × 2 with 1 available | `409 ITEM_TYPE_UNAVAILABLE`, "Arduino Uno R3 has only 1 available unit; you asked for 2.", `details: [ { "field": "lines[0].itemTypeId", "issue": "1 available" } ]` |
| BR-04 | A line for Arduino Uno R3 while Request #12 (open) has it | `409 DUPLICATE_OPEN_REQUEST`, message from F02-D2, `details: [ { "field": "lines[0].itemTypeId", "issue": "Open request #12 has this item type" } ]` |

## 6. Data specification

### 6.1 Schema and migrations

No migration in F-04. It writes `borrow_requests.loanDays` from #73 and relies on its CHECK `loanDays ≥ 1`, the `request_lines (requestId, itemTypeId)` unique constraint and the `quantity ≥ 1` CHECK (SDS 4.3).

### 6.2 Tables read and written

| Table | Read | Written by create |
| --- | --- | --- |
| `users` | The Borrower's row (lock) and the `borrower` object | - |
| `item_types`, `categories` | Every line's item type and its limits; the category for the detail | - |
| `units` | Count of `AVAILABLE` units per item type (one grouped count) | - |
| `borrow_requests`, `request_lines` | The Borrower's open requests for BR-04 | One request with `loanDays`, one line per entry |
| `history_entries` | - | One `CREATED` entry |

## 7. Acceptance criteria

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-62 | A signed-in user who opens an item type receives its name, description, kit flag, category, maximum loan length, maximum quantity per request and available unit count, with no unit IDs or asset tags; an item type that does not exist gives `404 NOT_FOUND`, a non-integer ID `400 VALIDATION_FAILED`, and a call without a session `401 UNAUTHENTICATED` | FR-05, NFR-01 |
| AC-63 | The item type detail page shows the description, both limits and the available count, with a loading, a not-found and an error state; a Borrower's Request button is disabled when none is available and otherwise opens the request form with that item type; a Custodian sees no Request button; the catalog links each item type to its detail | FR-05, NFR-12 |
| AC-64 | A Borrower creates a request with several lines (item type and quantity) and one loan length: it is stored `PENDING` with the Borrower as owner, one line per entry with its quantity, the loan length, and exactly one `CREATED` history entry with the Borrower and the creation time | FR-10, BR-05, BR-16 |
| AC-65 | A create body with no lines, more than 10 lines, the same item type twice, a quantity that is not an integer from 1 to 10, a missing or out-of-range `loanDays`, or an unknown field such as `unitId`, `assetTag` or `borrowerId` is rejected with `400 VALIDATION_FAILED` naming each problem, and nothing is stored | FR-10, BR-05, BR-06 |
| AC-66 | A line whose quantity is above its item type's maximum quantity per request is rejected with `409 QUANTITY_LIMIT` naming the line and the maximum, and nothing is stored; a quantity equal to the maximum is accepted | BR-07 |
| AC-67 | A loan length above the smallest maximum loan length among the request's item types is rejected with `409 LOAN_LENGTH_LIMIT` naming the item type that sets the limit, and nothing is stored; a loan length equal to that maximum is accepted | BR-08 |
| AC-68 | A request in which any line asks for more units than its item type has available is rejected with `409 ITEM_TYPE_UNAVAILABLE` naming that line, and nothing is stored, including the lines that had enough units | BR-01 |
| AC-69 | A request in which any line's item type is already on one of the Borrower's own open requests is rejected with `409 DUPLICATE_OPEN_REQUEST` naming the open request; when several rules fail, the code follows the order BR-04, BR-07, BR-08, BR-01; two simultaneous creates by one Borrower that share an item type store exactly one request | BR-04, BR-07, BR-08, BR-01 |
| AC-70 | A Custodian who creates a request gets `403 FORBIDDEN`; a create and an item type read without a session get `401 UNAUTHENTICATED`; each body has only the `error` object and nothing is stored | BR-17, NFR-01, NFR-02 |
| AC-71 | The new request form lets a Borrower add and remove lines (at most 10, each item type once), choose quantities up to each maximum and one loan length up to the smallest maximum, names the item type that sets that maximum and suggests a separate request for an item type that allows longer; Submit sends one call and opens the new request; a `409` is shown as an alert with the API message; a request for one item type takes 2 clicks from the catalog | FR-10, NFR-10, NFR-12 |

## 8. Software Test Specification (STS)

### 8.1 Conventions

- Levels and tools from SDS 10, as in the F-02 contract section 8. API and Integration tests run against `kithub_test` with data from the test factories (`createItemTypeWithUnits`, `createRequest`), never the demo seed.
- "Nothing stored" means `snapshotRequestState()` (`server/tests/helpers/requests.ts`) is equal before and after the call: the `borrow_requests`, `request_lines` and `history_entries` counts.
- **TDD** marks the tests for the rules and the new endpoint. Each is committed and run on the pre-implementation code first and must fail on an assertion: for example `400` because the Sprint 1 schema refuses two lines, or `404` because `GET /api/item-types/:id` does not exist yet. The failing output and the commit are kept. UI tests mock the API modules with a `vi.mock` factory, so they do not import a function that does not exist yet.
- The item types in the examples use the D-08 limits: Arduino Uno R3 (14 days, 2 per request), HC-SR04 ultrasonic sensor (14 days, 4), Digital multimeter (3 days, 1).

### 8.2 Test cases

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-62 **TDD** | AC-62 | API | Item type T "Digital multimeter" in category "Instruments", units `AVAILABLE` ×2, `ON_LOAN` ×1, `MAINTENANCE` ×1, `RETIRED` ×1; Borrower B, Custodian C | (a) as B `GET /api/item-types/T`; (b) as C; (c) `GET /api/item-types/999999`; (d) `GET /api/item-types/abc`; (e) `?x=1`; (f) no cookie | (a) `200` with exactly the F04-D6 keys, `availableCount` 2, `category.name` "Instruments"; no `units`, `assetTag` or `unitId` anywhere. (b) the same body as (a). (c) `404 NOT_FOUND` "Item type 999999 does not exist.". (d), (e) `400 VALIDATION_FAILED` naming `id` / `x`. (f) `401 UNAUTHENTICATED`, only `error` | `server/tests/api/item-types.test.ts` |
| TEST-63 **TDD** | AC-63 | UI | `ItemTypePage` with the catalog module mocked (`vi.mock` factory); `CatalogPage` with the same mock | (a) pending; (b) resolves the multimeter with 3 available, as a Borrower; (c) same as a Custodian; (d) `availableCount` 0 as a Borrower; (e) rejects with `404`; (f) rejects with another error, then resolves; (g) catalog row | (a) "Loading…". (b) name, "Instruments", description, "Maximum loan length: 3 days", "Maximum per request: 1", "3 available"; Request links to `/requests/new?itemTypeId=9`. (c) no Request. (d) Request disabled, "None available". (e) "Item type not found." with a link to the catalog. (f) error and "Try again", which calls again. (g) the item type name links to `/catalog/item-types/9` | `client/tests/ItemTypePage.test.tsx` |
| TEST-64 **TDD** | AC-64 | API | Borrower B; Arduino (3 `AVAILABLE`), HC-SR04 (5 `AVAILABLE`) | `POST /api/requests` with Arduino × 2, HC-SR04 × 1, `loanDays` 7 | `201`; `status` `PENDING`, `loanDays` 7, `borrower.id` B, `dueAt` null; `lines` in body order with quantities 2 and 1 and `loans` `[]`. Database: one request with `borrowerId` B and `loanDays` 7, two lines, exactly one history entry (`REQUEST`, `CREATED`, `toStatus` `PENDING`, actor B, `occurredAt` = `createdAt`); unit statuses unchanged | `server/tests/api/requests-multi.test.ts` |
| TEST-65 **TDD** | AC-65 | API | Borrower B; Arduino with units | Create with (a) `{ "loanDays": 7 }`; (b) `lines: []`; (c) 11 lines; (d) Arduino twice; (e) quantity 0, then 1.5, then 11; (f) no `loanDays`; (g) `loanDays` 0, then 366, then "7"; (h) a line with `unitId`; (i) a line with `assetTag`; (j) top-level `borrowerId` | Each `400 VALIDATION_FAILED`; `details` name (a), (b), (c) `lines`; (d) `lines[1].itemTypeId`; (e) `lines[0].quantity`; (f), (g) `loanDays`; (h) `lines[0].unitId`; (i) `lines[0].assetTag`; (j) `borrowerId`. Nothing stored after each | `server/tests/api/requests-multi.test.ts` |
| TEST-66 **TDD** | AC-66 | API + Unit | Borrower B; Digital multimeter (max 1, 3 available); HC-SR04 (max 4, 5 available) | (a) multimeter × 2, `loanDays` 3; (b) HC-SR04 × 4 and multimeter × 2, `loanDays` 3; (c) HC-SR04 × 4, `loanDays` 3; unit: `requestRuleViolation` with quantity = max and max + 1 | (a) `409 QUANTITY_LIMIT`, "You can request at most 1 Digital multimeter at a time.", `details` `lines[0].quantity`. (b) `409 QUANTITY_LIMIT` naming only `lines[1].quantity`. Nothing stored. (c) `201`. Unit: null at max, `QUANTITY_LIMIT` above | `server/tests/api/requests-multi.test.ts`, `server/tests/unit/request-rules.test.ts` |
| TEST-67 **TDD** | AC-67 | API + Unit | Borrower B; Arduino (14 days) and multimeter (3 days), both available | (a) both, `loanDays` 7; (b) both, `loanDays` 3; (c) Arduino only, `loanDays` 14; (d) Arduino only, `loanDays` 15; unit: smallest maximum of 14, 3, 14 | (a) `409 LOAN_LENGTH_LIMIT`, "The loan length can be at most 3 days because of Digital multimeter.", `details` `loanDays`; nothing stored. (b) `201`, `loanDays` 3. (c) `201`. (d) `409 LOAN_LENGTH_LIMIT` naming Arduino Uno R3. Unit: limit 3 and the multimeter as the limiting item type | `server/tests/api/requests-multi.test.ts`, `server/tests/unit/request-rules.test.ts` |
| TEST-68 **TDD** | AC-68 | API | Borrower B; Arduino with 1 `AVAILABLE` and 2 `ON_LOAN`; HC-SR04 with 5 `AVAILABLE`; Oscilloscope with 0 available | (a) HC-SR04 × 1 and Arduino × 2, `loanDays` 7; (b) Oscilloscope × 1, `loanDays` 3; (c) Arduino × 1, `loanDays` 7 | (a) `409 ITEM_TYPE_UNAVAILABLE`, "Arduino Uno R3 has only 1 available unit; you asked for 2.", `details` `lines[1].itemTypeId`; nothing stored, also not the HC-SR04 line. (b) `409`, "Oscilloscope has no available units.". (c) `201` | `server/tests/api/requests-multi.test.ts` |
| TEST-69 **TDD** | AC-69 | API + Integration | Borrower B with open request R1 (`PENDING`, Arduino); Borrower B2 with open request for HC-SR04; multimeter with 0 available | (a) as B: HC-SR04 × 1 and Arduino × 1; (b) as B: Arduino × 1 and multimeter × 2, `loanDays` 14 (BR-04, BR-07, BR-08 and BR-01 all fail); (c) as B: HC-SR04 × 1 (B2's open request does not block); (d) `Promise.all` of two creates by Borrower B3: Arduino + HC-SR04 and HC-SR04 + ESP32 DevKitC (both available), 5 rounds with fresh data | (a) `409 DUPLICATE_OPEN_REQUEST` naming Request R1 and `lines[1].itemTypeId`. (b) `409 DUPLICATE_OPEN_REQUEST` (first rule in order). (c) `201`. (d) each round one `201` and one `409 DUPLICATE_OPEN_REQUEST`; exactly one new request for B3 and one history entry | `server/tests/api/requests-multi.test.ts`, `server/tests/api/requests-concurrency.test.ts` |
| TEST-70 | AC-70 | API | Custodian C; Arduino with units | (a) as C create Arduino × 1, `loanDays` 7; (b) no cookie: the same create and `GET /api/item-types/:id`; (c) a signed-out session cookie: the same two calls | (a) `403 FORBIDDEN`; (b), (c) `401 UNAUTHENTICATED`; each body only `error`; nothing stored | `server/tests/api/requests-access.test.ts` |
| TEST-71 **TDD** | AC-71 | UI | `NewRequestPage` with the catalog and requests modules mocked; catalog Arduino (14 days, max 2, 3 available), HC-SR04 (14, 4, 5), multimeter (3, 1, 3) | (a) open `/requests/new?itemTypeId=3`; (b) add a line with the multimeter; (c) set the loan length to 7; (d) set it to 3, submit, double click; (e) the create mock rejects with `409 ITEM_TYPE_UNAVAILABLE`; (f) add lines until 10; (g) from the catalog, click Request on Arduino, then Submit request | (a) one line Arduino × 1, loan length 14, quantity choices 1 to 2. (b) the hint "up to 3 days (limited by Digital multimeter)" and "Need Arduino Uno R3 for longer? Submit it as a separate request."; the multimeter is not offered on a third line. (c) the field shows the error "At most 3 days" and Submit stays disabled. (d) the create mock called once with `{ lines: [ {3, 1}, {9, 1} ], loanDays: 3 }`; navigation to `/requests/12`. (e) the API message as an alert; the entered lines stay. (f) Add line hidden at 10 lines. (g) 2 clicks; the create mock called once | `client/tests/NewRequestPage.test.tsx` |

### 8.3 Coverage checks

- AC-n is verified by TEST-n for AC-62 to AC-71.
- The new item type endpoint and the changed create have a no-session test (TEST-62 (f), TEST-70) and the create has a wrong-role test (TEST-70). The item type read is open to both roles, so it has no wrong-role case.
- Every rejection test checks that nothing is stored.
- Regression: the Sprint 1 request suites (TEST-08 to TEST-17, TEST-11b, TEST-33 to TEST-40), the checkout suites and the E2E journeys must still pass after the F04-D9 changes. TEST-34 and TEST-40 are revised as F04-D9 says, with the reason in the PR; no other assertion changes.

## 9. Definition of Done (F-04)

| # | Item | Evidence |
| --- | --- | --- |
| 1 | AC-62 to AC-71 implemented as specified in sections 3 to 6 | PR lists each AC with its commit or file |
| 2 | TEST-62 to TEST-71 exist under their planned files (or recorded new paths) with the stated assertions, and pass | `npm test` output in `server/` and `client/` with counts and the tested commit |
| 3 | TDD tests failed on assertions before the implementation and passed after | Test-only commit SHA with failing output; implementation commit SHA with passing output |
| 4 | No test skipped, disabled or weakened; the F04-D9 changes listed with the reason | Skip count 0; PR section |
| 5 | Reviewed by the teammate with a specific comment; CI `test-and-docker` green | GitHub review and checks |
| 6 | `docs/features.md` and `docs/traceability.md` list AC-62 to AC-71 with results; F-02 contract notes that AC-34 and AC-40 were revised by F-04 | Diff in the PR |
| 7 | E2E journeys pass through the new form | `npm run test:e2e` output |
| 8 | Known limitations disclosed: no reservation until Sprint 3 (D-15), so two Borrowers can request the last unit | PR section |

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-62 | FR-05, NFR-01 | TEST-62 | `server/tests/api/item-types.test.ts` |
| AC-63 | FR-05, NFR-12 | TEST-63 | `client/tests/ItemTypePage.test.tsx` |
| AC-64 | FR-10, BR-05, BR-16 | TEST-64 | `server/tests/api/requests-multi.test.ts` |
| AC-65 | FR-10, BR-05, BR-06 | TEST-65 | `server/tests/api/requests-multi.test.ts` |
| AC-66 | BR-07 | TEST-66 | `server/tests/api/requests-multi.test.ts`, `server/tests/unit/request-rules.test.ts` |
| AC-67 | BR-08 | TEST-67 | `server/tests/api/requests-multi.test.ts`, `server/tests/unit/request-rules.test.ts` |
| AC-68 | BR-01 | TEST-68 | `server/tests/api/requests-multi.test.ts` |
| AC-69 | BR-04, BR-07, BR-08, BR-01 | TEST-69 | `server/tests/api/requests-multi.test.ts`, `server/tests/api/requests-concurrency.test.ts` |
| AC-70 | BR-17, NFR-01, NFR-02 | TEST-70 | `server/tests/api/requests-access.test.ts` |
| AC-71 | FR-10, NFR-10, NFR-12 | TEST-71 | `client/tests/NewRequestPage.test.tsx` |
