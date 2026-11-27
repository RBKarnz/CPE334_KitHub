# F-13 History per unit and per Borrower: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-13 History per unit and per Borrower |
| Sprint | 3 (due 2026-12-13); implementation planned 30 Nov to 6 Dec (`plan.md` 6.3) |
| Version | 1.0 |
| Status | Proposed (PR for #110); implementation starts only after this contract is reviewed and merged |
| Date | 2026-11-27 |
| Authors | Teerakarn Noiruksa (67070501062); reviewer Methipat Mansap (67070501071) |
| Baseline | SRS v1.6, System-Level SDS v1.15 (4.2 "History entry", 4.4, 4.6, 5.1, 5.2, 6.6, 7.1), F-03 v1.3 (F03-D7), F-06 v1.1 (F06-D4, F06-D5), F-08 v1.1, F-09 v1.0, F-10 v1.0 |
| Issues | #110 this feature; #78 F-08 and #79 F-09 (the unit changes it shows); #107 F-10 (expiry entries) |
| Definition of Done | [Product Definition of Done](../sprint-1/definition-of-done.md) and section 9 of this contract |
| AC/TEST block | 150 to 157 (claimed in #110) |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-27 | Teerakarn Noiruksa | First contract: AC-150 to AC-157, TEST-150 to TEST-157, decisions F13-D1 to F13-D8 |

Changes after approval get a new version row with the reason. AC and TEST IDs are never reused for a different meaning.

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What F-13 does with it |
| --- | --- | --- |
| Functional | FR-27 | A Custodian sees the history of a unit: every state change and every loan, with the acting user and time |
| Functional | FR-28 | A Borrower sees the history of their own requests and loans; a Custodian sees the same history for any Borrower |
| Business rules | BR-05, BR-16 | A Borrower reads only their own history; the history shown is the append-only record, never changed by reading it |
| Non-functional | NFR-02 | No cross-Borrower access; a Borrower cannot read unit history (Custodian operation) |
| Non-functional (kept) | NFR-01, NFR-08, NFR-12 | No session `401`; standard errors; loading, empty and error states |
| SDS | 4.2 "History entry" (indexes `(requestId, occurredAt)`, `(unitId, occurredAt)`), 4.4 (who may read which entry), 4.6, 5.1 History screen, 5.2 links, 6.6 `GET /api/units/:id/history` and `GET /api/history`, 7.1 | Used as written |

### 2.2 Depends on

| Feature | What F-13 needs | Status |
| --- | --- | --- |
| F-02, F-03 (Sprint 1) | Request and checkout history entries | On `main` |
| F-05, F-06 (#75, #76) | Edit, cancel, approve and reject entries; `toHistoryView` and `historySelect` (F06-D5) | On `main` |
| F-07, F-08 (#77, #78) | Checkout and return entries for requests, units and loans | On `main` |
| F-09 (#79) | Unit `CREATED`, repair and retire entries | On `main` |
| F-10 (#107) | System expiry entries; `expireEndedRequests` (F13-D5) | Contract in this PR; code before F-13 |

### 2.3 Out of scope for F-13

| Item | Where |
| --- | --- |
| Writing history | Every feature writes its own entries (SDS 4.6); F-13 only reads |
| A list of Borrowers to choose from | Not needed: a Custodian opens a Borrower's history from one of their requests (F13-D7). A user list endpoint is not in the SRS |
| History of categories and item types | Not recorded (F09-D8); FR-27 and FR-28 do not ask for it |
| Paging, search and export | Not needed at the product's size (F13-D4); NFR-11 is measured by SR-03 |

## 3. Feature-level design (Feature SDS)

### 3.1 Behaviour and workflow

1. **Unit history (FR-27).** A Custodian opens `/units/:id/history` from the Manage catalog units list or from an asset tag on a request detail. The page shows the unit (asset tag, item type, current state), its loans and every history entry that names the unit.
2. **Borrower history (FR-28).** A Borrower opens **History** (`/history`) and sees the entries of their own requests and loans. A Custodian opens the same page for a Borrower from the Borrower's name on a request detail (`/history?borrowerId=3`).
3. Both are reads: no call of F-13 writes a history entry or changes a record. Before the Borrower history is read, expiry runs (F13-D5), so an ended pickup window shows its expiry entry.

### 3.2 State changes

None. F-13 adds no state, transition or history entry.

### 3.3 Which entries each view shows (SDS 4.4)

| View | Entries | Order |
| --- | --- | --- |
| Unit history of unit U | Every entry with `unitId = U`: the unit's `CREATED` entry and state changes (`UNIT`), and every entry of its loans (`LOAN`) | Newest first: `occurredAt` descending, then `id` descending (F13-D1) |
| Loans of unit U | Every loan with `unitId = U`, with its request, Borrower, checkout and return | Newest checkout first, then `id` descending |
| Borrower history of Borrower B | Every `REQUEST` and `LOAN` entry whose request belongs to B (`history_entries.requestId → borrow_requests.borrowerId = B`). `UNIT` entries are not shown, also when they carry a `requestId` (checkout and return) | Newest first, as above |

Entries written in one transaction have the same `occurredAt`; the `id` order keeps them in the order they were written, reversed.

### 3.4 History item (both views)

Built from `historySelect` (F06-D5) with three more fields:

| Field | Value |
| --- | --- |
| `id`, `occurredAt`, `entityType`, `action`, `fromStatus`, `toStatus`, `details` | As stored |
| `actorType` | `USER` or `SYSTEM` |
| `actorRole` | `BORROWER`, `CUSTODIAN` or `null` (System) |
| `actor` | The acting user as `{ id, username, displayName }`. In the Borrower's own view it is set only when the actor is that Borrower; a Custodian actor is `null` there, with `actorRole: "CUSTODIAN"` (F13-D2) |
| `request` | `{ id }` or `null` |
| `loan` | `{ id, unit: { id, assetTag }, itemType: { id, name }, returnCondition }` for `LOAN` entries, else `null` |

### 3.5 Business rules and where they are enforced

| Rule | UI | Route | Service | Database |
| --- | --- | --- | --- | --- |
| FR-27 Custodian only | `RequireRole CUSTODIAN` on `/units/:id/history` | `authenticate`, `requireRole(CUSTODIAN)` | - | Index `(unitId, occurredAt)` |
| FR-28, BR-05 own history | `/history` for the Borrower | `authenticate`; strict query | `borrowerId` from the session for a Borrower; from the query for a Custodian (F13-D3) | Index `(requestId, occurredAt)` through the Borrower's requests |
| F03-D7, F06-D4 no Custodian identity for Borrowers | "A Custodian" text | - | `actor` set to `null` for Custodian actors in the Borrower's view | - |
| BR-16 read only | - | GET only | No write | Append-only trigger (exists) |

### 3.6 Check order

- `GET /api/units/:id/history`: `401` → `403` (Borrower) → `400` (id, query) → `404` (no such unit).
- `GET /api/history`: `401` → `400` (a Borrower who sends `borrowerId`; a Custodian who does not; a malformed id; any other field) → `404` (a Custodian names a user that is not a Borrower).

### 3.7 Decisions made in this contract

| ID | Decision | Rationale |
| --- | --- | --- |
| F13-D1 | Both views list newest first (`occurredAt` desc, then `id` desc) | A history page is read for what happened recently. The request detail history (F06-D5) stays oldest first because it tells one request's story |
| F13-D2 | In a Borrower's own history, a Custodian actor is shown as "A Custodian" (`actor: null`, `actorRole: "CUSTODIAN"`); the Borrower's own actions as "You"; the System as "System". A Custodian sees every actor's name | The Borrower views already hide which Custodian acted (F03-D7, F06-D4); history must not reveal it |
| F13-D3 | `GET /api/history`: a Borrower sends no query field (`borrowerId`, even their own, gives `400 VALIDATION_FAILED` naming `borrowerId`); a Custodian must send `borrowerId` (missing gives `400` naming it); an id that is not a Borrower gives `404 NOT_FOUND` "Borrower 99 does not exist." | BR-05 and SDS 7.2 step 3: the client never chooses the Borrower's identity; strict schemas (DD-09). A Custodian's own id is not a Borrower, so it is `404` |
| F13-D4 | No paging: every entry is returned | A unit has a few entries per loan, a Borrower a few per request; at the product's size (a few hundred requests a term) one response is small. SR-03 measures NFR-11 |
| F13-D5 | After F-10 is in, `GET /api/history` applies expiry first (D-23: it reads request states); `GET /api/units/:id/history` does not (it shows unit and loan entries only, which expiry never writes) | The Borrower sees "Expired" as soon as the window ends, as on My requests |
| F13-D6 | The UI turns each entry into one sentence (4.4), from `entityType`, `action`, `fromStatus`, `toStatus`, `details` and `loan`; the API sends codes, not sentences | Keeps the API stable and the text in one place (the client), as for status badges |
| F13-D7 | The Custodian reaches a Borrower's history from the Borrower's name on the request detail; `/history` with no `borrowerId` shows "Open a Borrower's history from one of their requests." with a link to All requests | No user list exists (2.3); every Borrower with history has a request |
| F13-D8 | The unit history response holds `unit`, `loans` and `entries` in one call | FR-27 asks for "every state change and every loan"; one call keeps one consistent read |

## 4. UI specification

### 4.1 Layers changed by F-13

| Layer | Change |
| --- | --- |
| UI | New pages `/history` (Borrower; Custodian with `?borrowerId=`) and `/units/:id/history` (Custodian); nav link **History** for both roles (SDS 5.2); links from Manage catalog units, request detail asset tags and the Borrower's name on the Custodian request detail |
| API | `GET /api/units/:id/history`, `GET /api/history` |
| Database | No schema change and no migration: both indexes exist (SDS 4.2) |

### 4.2 Borrower: History (`/history`)

| Element | Behaviour |
| --- | --- |
| Title | "My history" |
| Table | Time ("6 Nov 2026, 14:30"), Event (4.4), Request (link "Request #12"), By ("You", "A Custodian", "System") |
| States | Loading; error with "Try again"; empty: "Nothing has happened yet." with a link to the catalog |

### 4.3 Custodian: Borrower history and unit history

| Element | Behaviour |
| --- | --- |
| Borrower history (`/history?borrowerId=3`) | Title "History of Borrower One (borrower1)"; the table of 4.2, with the actor's display name in By; reached from the Borrower's name on the request detail |
| `/history` with no `borrowerId` | The message of F13-D7 |
| Unit history (`/units/:id/history`) | Header: asset tag, item type, the current state badge. "Loans" table: Request (link), Borrower, Checked out, Due, Returned, Condition (newest first). "History" table: Time, Event, By. Reached from **History** on each unit row of Manage catalog and from the asset tags on the Custodian request detail |
| Access | `RequireRole CUSTODIAN` on `/units/:id/history`: a Borrower sees the Forbidden page. An unknown unit or Borrower shows the API message with "Try again" |
| States | Loading, error with "Try again"; empty tables: "No loans yet." and "No history yet." |

### 4.4 Event sentences (F13-D6)

| Entry | Sentence |
| --- | --- |
| `REQUEST` `CREATED` | "Request created" |
| `REQUEST` `EDITED` | "Request edited" |
| `REQUEST` `STATUS_CHANGED` to `APPROVED`, `REJECTED`, `CANCELLED`, `CHECKED_OUT`, `RETURNED`, `EXPIRED` | "Approved", "Rejected: <reason from `details`>", "Cancelled", "Checked out", "All units returned", "Expired: not picked up within 48 hours" |
| `LOAN` `CREATED` | "KH-ARD-0007 (Arduino Uno R3) lent" |
| `LOAN` `STATUS_CHANGED` to `RETURNED` | "KH-ARD-0007 returned, good" or "…, damaged" |
| `UNIT` `CREATED` | "Unit added" |
| `UNIT` `STATUS_CHANGED` | "<from> → <to>" with the state labels of the badges, for example "On loan → Maintenance" |

## 5. API specification

### 5.1 `GET /api/units/:id/history`

| Aspect | Specification |
| --- | --- |
| Who | Custodian (`403 FORBIDDEN` for a Borrower) |
| Path | `id`: positive integer, else `400 VALIDATION_FAILED` naming `id` |
| Query | None; any field `400` (DD-09) |
| Success | `200 { "unit": { "id", "assetTag", "status", "itemType": { "id", "name" } }, "loans": [ { "id", "status", "request": { "id" }, "borrower": { "id", "username", "displayName" }, "checkedOutAt", "checkedOutBy", "dueAt", "returnedAt", "returnedBy", "returnCondition" } ], "entries": [ history item (3.4) ] }` |
| Errors | `401 UNAUTHENTICATED`; `404 NOT_FOUND` "Unit 99 does not exist." |

### 5.2 `GET /api/history`

| Aspect | Specification |
| --- | --- |
| Who | Signed in. Borrower: own history. Custodian: the Borrower named by `borrowerId` |
| Query | Borrower: none (F13-D3). Custodian: `borrowerId`, positive integer, required |
| Success | `200 { "borrower": { "id", "username", "displayName" }, "entries": [ history item (3.4) ] }` |
| Errors | `401 UNAUTHENTICATED`; `400 VALIDATION_FAILED` naming `borrowerId` (F13-D3); `404 NOT_FOUND` "Borrower 99 does not exist." |

## 6. Data specification

### 6.1 Schema and migrations

No change.

### 6.2 Tables read and written

| Table | Read | Written |
| --- | --- | --- |
| `history_entries` | By `unitId` or by the Borrower's requests | - |
| `units`, `item_types`, `loans`, `borrow_requests`, `users` | The unit header, the loans, the actors and the Borrower | - (expiry of F-10 only, F13-D5) |

## 7. Acceptance criteria

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-150 | A Custodian's `GET /api/units/:id/history` returns the unit with its item type and state, every loan of the unit with its request, Borrower and Custodians, and every history entry that names the unit (its creation, each state change and each entry of its loans), newest first, with actor and time; no entry or loan of another unit | FR-27, BR-16, F13-D1, F13-D8 |
| AC-151 | Unit history: a Borrower gets `403 FORBIDDEN`, no session `401`, an unknown unit `404`, `id` `abc` and any query field `400`; no call writes anything | NFR-01, NFR-02, NFR-08 |
| AC-152 | A Borrower's `GET /api/history` returns exactly the `REQUEST` and `LOAN` entries of their own requests, newest first; never a `UNIT` entry and never an entry of another Borrower's request. Their own actions carry their user, Custodian actions `actor: null` with `actorRole: "CUSTODIAN"`, and System entries `actorType: "SYSTEM"` | FR-28, BR-05, NFR-02, F13-D2 |
| AC-153 | A Custodian's `GET /api/history?borrowerId=B` returns the same entries as B sees, with every actor's user; without `borrowerId` it is `400` naming `borrowerId`; a `borrowerId` of an unknown user or of a Custodian is `404` | FR-28, F13-D3 |
| AC-154 | A Borrower who sends `borrowerId` (another Borrower's or their own) gets `400 VALIDATION_FAILED` naming `borrowerId` and no data; no session gets `401`; no call writes anything | BR-05, NFR-01, NFR-02, F13-D3 |
| AC-155 | After one full flow through the real endpoints (unit added, request created, edited, approved, checked out, returned damaged, unit repaired), the unit history and the Borrower history hold exactly the entries of 8.2 TEST-155, in that order | FR-27, FR-28, BR-16, NFR-09 |
| AC-156 | The Borrower History page shows the table of 4.2 with the sentences of 4.4 and "You", "A Custodian" or "System", links each request, and has loading, empty and error states; both roles have a **History** link | FR-28, NFR-12 |
| AC-157 | The Custodian unit history page shows the header, the Loans table and the History table of 4.3; the Borrower history page for `?borrowerId=` shows the Borrower's name; `/history` without it shows the F13-D7 message; a Borrower opening `/units/:id/history` sees the Forbidden page | FR-27, FR-28, NFR-02, NFR-12 |

## 8. Software Test Specification (STS)

### 8.1 Conventions

- Test data comes from the existing helpers; the flow of TEST-155 uses the real endpoints so that the entries are the ones the features write. Other tests may insert entries directly through Prisma (inserts are allowed by the append-only trigger) when they only test selection, order or access.
- The clock is fixed with `vi.useFakeTimers({ toFake: ["Date"] })`. The services set `occurredAt` from the application clock (`now`, one per call: F02-D5, F-07 3.6, F-08), so TEST-155 sets a different minute for each step and checks the steps in order; entries of one step share `occurredAt` and are compared as a set.
- **TDD**: the RED commit adds TEST-150 to TEST-157 and runs them on the pre-change code; API tests fail with `404` (routes missing), UI tests on the missing pages and links.

### 8.2 Test cases

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-150 **TDD** | AC-150 | API | Unit U of A with two finished loans (R1 of B1, R2 of B2, inserted with their entries) and a repair; unit V of A with one loan | Custodian `GET /api/units/U/history` | `unit` U with item type A and state; `loans` `[R2's, R1's]` with Borrowers and Custodians; `entries` exactly U's `UNIT` and `LOAN` entries, newest first, each with `actorType`, `actor`, `occurredAt`; nothing of V | `server/tests/api/history.test.ts` |
| TEST-151 **TDD** | AC-151 | API | As TEST-150; snapshot before and after | (a) Borrower; (b) no session; (c) unit 999999; (d) `/api/units/abc/history`; (e) `?x=1` | (a) `403 FORBIDDEN`; (b) `401 UNAUTHENTICATED`; (c) `404 NOT_FOUND` "Unit 999999 does not exist."; (d) `400` naming `id`; (e) `400` naming `x`; nothing changed | `server/tests/api/history.test.ts` |
| TEST-152 **TDD** | AC-152 | API | B1's requests R1 (created, approved, checked out, returned) and R3 (created, cancelled); B2's R2; one System entry on R3' (an expired request of B1) | B1 `GET /api/history` | Exactly R1's, R3's and R3''s `REQUEST` and `LOAN` entries, newest first; no `UNIT` entry; nothing of R2; B1's own entries have `actor` B1 and `actorRole` `BORROWER`; Custodian entries `actor: null`, `actorRole: "CUSTODIAN"`; the System entry `actorType` `SYSTEM`, `actorRole` null | `server/tests/api/history.test.ts` |
| TEST-153 **TDD** | AC-153 | API | As TEST-152 | Custodian: (a) `?borrowerId=B1`; (b) no query; (c) `?borrowerId=<custodian1's id>`; (d) `?borrowerId=999999` | (a) the same entry IDs as TEST-152, Custodian actors with their user; `borrower` B1. (b) `400` naming `borrowerId`; (c), (d) `404 NOT_FOUND` | `server/tests/api/history.test.ts` |
| TEST-154 **TDD** | AC-154 | API | As TEST-152; snapshot before and after | B1: (a) `?borrowerId=B2`; (b) `?borrowerId=B1`; (c) no session | (a), (b) `400 VALIDATION_FAILED` naming `borrowerId`, no `entries`; (c) `401`; nothing changed | `server/tests/api/history.test.ts` |
| TEST-155 **TDD** | AC-155 | Integration | Item type A; nothing else | Through the API: (1) Custodian adds unit KH-NANO-0001; (2) B1 creates R (1 of A, 3 days); (3) B1 edits R to 5 days; (4) Custodian approves; (5) checks out with the unit; (6) returns it damaged; (7) repairs the unit. Then unit history and B1's history | Unit history, newest first: (7) `UNIT` `MAINTENANCE` → `AVAILABLE`; (6) `UNIT` `ON_LOAN` → `MAINTENANCE` and `LOAN` `ACTIVE` → `RETURNED` (`loan.returnCondition` `DAMAGED`); (5) `UNIT` `AVAILABLE` → `ON_LOAN` and `LOAN` `CREATED`; (1) `UNIT` `CREATED`: 6 entries. B1's history, newest first: (6) `REQUEST` `CHECKED_OUT` → `RETURNED` and `LOAN` `ACTIVE` → `RETURNED`; (5) `REQUEST` `APPROVED` → `CHECKED_OUT` and `LOAN` `CREATED`; (4) `REQUEST` `PENDING` → `APPROVED`; (3) `REQUEST` `EDITED`; (2) `REQUEST` `CREATED`: 7 entries, no `UNIT` entry. The unit's `loans` has one loan with B1 | `server/tests/api/history-flow.test.ts` |
| TEST-156 **TDD** | AC-156 | UI | App rendered with `fetch` stubbed: B1's history with one entry of each row of 4.4, by self, a Custodian and the System | (a) Borrower opens **History**; (b) the stub returns no entry; (c) the stub fails, then "Try again" | (a) "My history"; each sentence of 4.4; By "You", "A Custodian", "System"; "Request #12" links to `/requests/12`; the nav has **History**. (b) "Nothing has happened yet."; (c) the message, then a second call | `client/tests/history.test.tsx` |
| TEST-157 **TDD** | AC-157 | UI | Stubbed unit history (two loans, five entries) and Borrower history | (a) Custodian opens `/units/7/history`; (b) Custodian opens `/history?borrowerId=3`; (c) Custodian opens `/history`; (d) Borrower opens `/units/7/history`; (e) Custodian request detail | (a) asset tag, item type, state badge; Loans rows newest first; History rows with names. (b) "History of Borrower One (borrower1)". (c) the F13-D7 message with a link to All requests. (d) Forbidden page, no call. (e) the asset tag links to `/units/7/history` and the Borrower's name to `/history?borrowerId=3` | `client/tests/history.test.tsx` |

### 8.3 Coverage checks

- Each AC-n has TEST-n.
- Access for both endpoints: no session (TEST-151, TEST-154), wrong role (TEST-151), another Borrower (TEST-152, TEST-154), the page guard (TEST-157 (d)).
- Completeness against real writes: TEST-155 fails if a feature stops writing an entry, or writes it with the wrong entity.
- Regression: the whole server, client and E2E suites run on the GREEN commit.

## 9. Definition of Done (F-13)

- This contract reviewed by Methipat Mansap and merged into `staging` before any F-13 code.
- RED commit with TEST-150 to TEST-157 only; output kept in `docs/sprints/sprint-3/evidence/F-13/` with the commit SHA.
- GREEN implementation commit; the same tests pass; whole server, client and E2E suites pass with counts recorded.
- PR into `staging` reviewed by the other student; CI `test-and-docker` green; no test skipped or weakened.
- `docs/features.md` 6.4 and the `docs/traceability.md` rows for FR-27 and FR-28 moved to Implemented with the commits.

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-150 | FR-27, BR-16 | TEST-150 | `server/tests/api/history.test.ts` |
| AC-151 | NFR-01, NFR-02, NFR-08 | TEST-151 | `server/tests/api/history.test.ts` |
| AC-152 | FR-28, BR-05, NFR-02 | TEST-152 | `server/tests/api/history.test.ts` |
| AC-153 | FR-28 | TEST-153 | `server/tests/api/history.test.ts` |
| AC-154 | BR-05, NFR-01, NFR-02 | TEST-154 | `server/tests/api/history.test.ts` |
| AC-155 | FR-27, FR-28, BR-16, NFR-09 | TEST-155 | `server/tests/api/history-flow.test.ts` |
| AC-156 | FR-28, NFR-12 | TEST-156 | `client/tests/history.test.tsx` |
| AC-157 | FR-27, FR-28, NFR-02, NFR-12 | TEST-157 | `client/tests/history.test.tsx` |
