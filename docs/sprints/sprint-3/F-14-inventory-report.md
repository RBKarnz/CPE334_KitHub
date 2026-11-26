# F-14 Inventory summary report: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-14 Inventory summary report |
| Sprint | 3 (due 2026-12-13) |
| Version | 1.1 |
| Status | Proposed (PR for #111); implementation starts only after this contract is reviewed and merged |
| Date | 2026-11-27 |
| Authors | Methipat Mansap (67070501071); reviewer Teerakarn Noiruksa (67070501062) |
| Baseline | SRS v1.6 (#106), System-Level SDS v1.14, F-09 contract v1.0, F-11 contract v1.0 (#108) |
| Issues | #111 this feature; #108 F-11 (overdue definition F11-D1); #112 SR-03 (NFR-11 measurement) |
| Definition of Done | [Product Definition of Done](../sprint-1/definition-of-done.md) and section 9 of this contract |
| AC/TEST block | 158 to 163 (claimed in #111) |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-27 | Methipat Mansap | First contract: AC-158 to AC-163, TEST-158 to TEST-163, decisions F14-D1 to F14-D5 |
| 1.1 | 2026-11-27 | Methipat Mansap | Review of PR #116: TEST-159 has its own data with exact checkout times and loan lengths; TEST-161 states the five expected rows; the narrow layout cites SDS 5.3 / SR-04 (below 768 px, table in its `.table-responsive` scroller) and NFR-12 only the list states; F14-D4 uses a visible header instead of a tooltip; F14-D6 says the report does not apply D-23 expiry. No AC changed |

Changes after approval get a new version row with the reason. AC and TEST IDs are never reused for a different meaning.

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What F-14 does with it |
| --- | --- | --- |
| Functional | FR-29 | A Custodian sees, for each item type, the number of units in each unit state, the number of active loans and the number of overdue requests |
| Business rules (read) | BR-12, BR-16 | Retired units are counted in their own column; nothing is written, so no history entry |
| Non-functional | NFR-01, NFR-02, NFR-08, NFR-12 | Custodian only; standard errors; loading, empty and error states (NFR-12 "List states") |
| System responsibility | SR-04, SDS 5.3 "Visual style" | Below 768 px the table scrolls sideways in its `.table-responsive` scroller inside the panel, checked from 320 to 1440 px |
| Non-functional (measured later) | NFR-11 | Measured by SR-03 (#112) on this endpoint |
| SDS | 5.1 Inventory report (`/reports/inventory`), 6.6 `GET /api/reports/inventory`, 7.1 "View inventory report" (Custodian only), DD-08 | Used as written |

### 2.2 Depends on

| Feature | What F-14 needs | Status |
| --- | --- | --- |
| F-09 (#79) | Item types, units and their four states | On `main` |
| F-07, F-08 | `ACTIVE` loans | On `main` |
| F-11 (#108) | The overdue definition F11-D1 (`CHECKED_OUT`, an `ACTIVE` loan with `dueAt < now`) | Contract #114 |

### 2.3 Out of scope for F-14

Export to a file, charts, history over time, and per-Borrower figures (F-13).

## 3. Feature-level design (Feature SDS)

### 3.1 Behaviour and workflow

1. A Custodian opens **Reports** (`/reports/inventory`). The UI calls `GET /api/reports/inventory`.
2. The server computes, in one read transaction and with one `now` (F14-D1), one row per item type and a totals row, and returns them with `generatedAt`.
3. The page shows the table and "Generated 27 Nov 2026, 14:05". **Refresh** loads it again.

### 3.2 State changes

None. Read only.

### 3.3 Figures (per item type)

| Column | Definition |
| --- | --- |
| `available`, `onLoan`, `maintenance`, `retired` | Count of the item type's units in `AVAILABLE`, `ON_LOAN`, `MAINTENANCE` and `RETIRED` |
| `totalUnits` | Sum of the four |
| `activeLoans` | Count of `ACTIVE` loans whose unit belongs to the item type (equals `onLoan` while every `ON_LOAN` unit has its `ACTIVE` loan, BR-03; the report shows both so a mismatch is visible) |
| `overdueRequests` | Count of distinct requests that are overdue (F11-D1) and have at least one `ACTIVE` overdue loan of a unit of this item type. A request with lines of two item types counts once in each of them |

Totals row: the sum of each column, except `overdueRequests`, which counts distinct overdue requests over all item types (F14-D3).

### 3.4 Decisions made in this contract

| ID | Decision | Rationale |
| --- | --- | --- |
| F14-D1 | All figures come from one read transaction with one `now` (application clock, as F11-D1) | The columns agree with each other; tests can fix the clock |
| F14-D2 | Every item type is listed, also one with no unit (all zeros), ordered by category name, item type name, `id` | A Custodian sees an item type with no stock; the catalog's order (F12-D4) |
| F14-D3 | The totals `overdueRequests` counts distinct requests, so it can be smaller than the sum of the rows | A two-line overdue request is one overdue request |
| F14-D4 | `available` counts `AVAILABLE` units, not the request availability of BR-01 (which subtracts reservations once F-10 is in) | The report describes the stock; reservations are a request concern. The column header reads "Available (unit state)", visible on every device, so it is not confused with the catalog's count |
| F14-D5 | The endpoint takes no query field (strict) | One fixed report |
| F14-D6 | The report does not apply D-23 expiry | It counts unit states, `ACTIVE` loans and `CHECKED_OUT` requests only; expiry changes `APPROVED` requests, which no column reads. Recorded so F-10 does not add expiry to this endpoint |

## 4. UI specification

### 4.1 Layers changed by F-14

| Layer | Change |
| --- | --- |
| UI | New Custodian page Reports (`/reports/inventory`) and nav link "Reports" |
| API | New `GET /api/reports/inventory` |
| Domain | None (a query in a new `reports` service) |
| Database | No schema change and no migration (indexes `units (itemTypeId, status)` and `loans (status, dueAt)` exist) |

### 4.2 Reports page (`/reports/inventory`, Custodian)

| Element | Behaviour |
| --- | --- |
| Table | Category, Item type, Available (unit state), On loan, Maintenance, Retired, Total units, Active loans, Overdue requests; numbers right-aligned; totals row in bold |
| Header | "Inventory report" and "Generated *date, time*" (ICT) from `generatedAt`; **Refresh** |
| States | "Loading…"; error with "Try again"; no item type: "The catalog is empty." |
| Narrow screens | Below 768 px the table scrolls sideways in its `.table-responsive` scroller inside the panel (SDS 5.3 "Visual style", SR-04) |
| Access | `RequireRole CUSTODIAN`; a Borrower gets the Forbidden page and has no Reports link |

## 5. API specification

### 5.1 `GET /api/reports/inventory`

| Aspect | Specification |
| --- | --- |
| Who | Custodian. Borrower: `403`. No session: `401` |
| Query | None; any field gives `400 VALIDATION_FAILED` naming it (F14-D5) |
| Success | `200 { "generatedAt", "items": [ row, … ], "totals": row-without-ids }` |
| Row | `{ "itemType": { "id", "name" }, "category": { "id", "name" }, "available", "onLoan", "maintenance", "retired", "totalUnits", "activeLoans", "overdueRequests" }` |

Example (one row):

```json
{ "itemType": { "id": 1, "name": "Arduino Uno R3" }, "category": { "id": 2, "name": "Microcontroller boards" },
  "available": 4, "onLoan": 1, "maintenance": 0, "retired": 1, "totalUnits": 6, "activeLoans": 1, "overdueRequests": 0 }
```

## 6. Data specification

No schema change and no migration. Reads `categories`, `item_types`, `units`, `loans`, `borrow_requests`. Nothing is written.

## 7. Acceptance criteria

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-158 | For each item type, `available`, `onLoan`, `maintenance` and `retired` equal the counts of its units in those states and `totalUnits` is their sum; an item type with no unit is listed with zeros; rows are ordered by category name and item type name | FR-29, F14-D2 |
| AC-159 | `activeLoans` counts the item type's `ACTIVE` loans; `overdueRequests` counts the distinct overdue requests (F11-D1) with an overdue `ACTIVE` loan of that item type, so a loan due later or exactly now is not counted | FR-29, FR-22, F11-D1 |
| AC-160 | The totals row sums every column, except that `overdueRequests` counts each overdue request once; `generatedAt` is the server time of the report | FR-29, F14-D1, F14-D3 |
| AC-161 | After a checkout, an early return marked damaged, a repair and a retire, the report changes exactly as the unit states and loans change | FR-29, BR-11, BR-12 |
| AC-162 | A Borrower gets `403 FORBIDDEN`, a call without a session `401 UNAUTHENTICATED`, any query field `400 VALIDATION_FAILED`; nothing is written by any call | NFR-01, NFR-02, NFR-08, F14-D5 |
| AC-163 | The Reports page shows the table with the totals row and "Generated …", reloads with **Refresh**, has loading, empty and error states, and is reachable only by a Custodian (a Borrower sees the Forbidden page and no Reports link) | FR-29, NFR-12 |

## 8. Software Test Specification (STS)

### 8.1 Conventions

- Data from the existing helpers: item types A (Arduino, units in all four states), B (HC-SR04, one `AVAILABLE` unit), C (a kit with no unit); loans through the real checkout at a fixed time; the clock moved past `dueAt` with `vi.setSystemTime` for overdue cases.
- **TDD**: RED commit with TEST-158 to TEST-163 run on the pre-change code; API tests fail with `404` (route missing), UI tests on the missing page.

### 8.2 Test cases

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-158 **TDD** | AC-158 | API | A: 2 `AVAILABLE`, 1 `ON_LOAN` (with its loan), 1 `MAINTENANCE`, 1 `RETIRED`; B: 1 `AVAILABLE`; C: no unit | Custodian `GET /api/reports/inventory` | Rows for A, B, C in F14-D2 order; A: 2/1/1/1, total 5; B: 1/0/0/0, total 1; C: all 0 | `server/tests/api/inventory-report.test.ts` |
| TEST-159 **TDD** | AC-159 | API | Fresh data: A with 2 `AVAILABLE` units, B with 1 `AVAILABLE` unit. Borrower B1's request R1 (A × 1, B × 1, `loanDays` 3) and Borrower B2's request R2 (A × 1, `loanDays` 10), both approved (F-06), then checked out (F-07): R1 at Mon 30 Nov 2026 10:00 ICT (due Thu 3 Dec 17:00 = `2026-12-03T10:00:00.000Z`), R2 at Mon 30 Nov 2026 11:00 ICT (due Thu 10 Dec 17:00) | Read the report at Thu 3 Dec 17:00:00.000 ICT, then at 17:00:00.001 | Both reads: `activeLoans` A 2, B 1; `onLoan` A 2, B 1. First read: `overdueRequests` 0 for A and B. Second read: A 1, B 1 (R1 only; R2 is not due) | `server/tests/api/inventory-report.test.ts` |
| TEST-160 **TDD** | AC-160 | API | As the second read of TEST-159 | Read the totals | Each count column is the sum of the rows; `totals.overdueRequests` is 1 (R1 counted once); `generatedAt` equals the fixed clock | `server/tests/api/inventory-report.test.ts` |
| TEST-161 **TDD** | AC-161 | Integration | Fresh data: A with 2 `AVAILABLE` units; a Borrower's request of A × 1, approved | Report (1); check out 1 unit, report (2); return it early as damaged, report (3); mark it repaired, report (4); retire it, report (5) | Row A as available / onLoan / maintenance / retired, activeLoans: (1) 2/0/0/0, 0; (2) 1/1/0/0, 1; (3) 1/0/1/0, 0; (4) 2/0/0/0, 0; (5) 1/0/0/1, 0; `totalUnits` 2 in every report; `overdueRequests` 0 | `server/tests/api/inventory-report.test.ts` |
| TEST-162 **TDD** | AC-162 | API | As TEST-158 | (a) Borrower; (b) no session; (c) `?itemTypeId=1`; snapshot before and after | (a) `403 FORBIDDEN`; (b) `401 UNAUTHENTICATED`; (c) `400 VALIDATION_FAILED` naming `itemTypeId`; nothing changed | `server/tests/api/inventory-report.test.ts` |
| TEST-163 **TDD** | AC-163 | UI | App rendered with `fetch` stubbed | (a) Custodian opens Reports; (b) **Refresh**; (c) the stub fails, then "Try again"; (d) the stub returns no item; (e) Borrower opens `/reports/inventory` | (a) table rows, bold totals, "Generated 27 Nov 2026, 14:05"; (b) a second call; (c) the message, then a second call; (d) "The catalog is empty."; (e) Forbidden page, no Reports link | `client/tests/inventory-report.test.tsx` |

### 8.3 Coverage checks

- Each AC-n has TEST-n; the overdue boundary (`dueAt` ± 1 ms) is tested as in F-11.
- Access: Borrower `403`, no session `401` (TEST-162), page guard (TEST-163 (e)).
- Cross-feature: TEST-161 goes through F-07, F-08 and F-09 endpoints, so a change in any of them shows here.

## 9. Definition of Done (F-14)

- Contract reviewed by Teerakarn Noiruksa and merged into `staging` before any F-14 code; F-11 contract merged first.
- RED commit with TEST-158 to TEST-163 only; output in `docs/sprints/sprint-3/evidence/F-14/`; GREEN commit; whole suites pass with counts recorded.
- PR into `staging` reviewed; CI green; `features.md` 6.5 and `traceability.md` FR-29 updated with the commits.

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-158 | FR-29 | TEST-158 | `server/tests/api/inventory-report.test.ts` |
| AC-159 | FR-29, FR-22 | TEST-159 | `server/tests/api/inventory-report.test.ts` |
| AC-160 | FR-29 | TEST-160 | `server/tests/api/inventory-report.test.ts` |
| AC-161 | FR-29, BR-11, BR-12 | TEST-161 | `server/tests/api/inventory-report.test.ts` |
| AC-162 | NFR-01, NFR-02, NFR-08 | TEST-162 | `server/tests/api/inventory-report.test.ts` |
| AC-163 | FR-29, NFR-12 | TEST-163 | `client/tests/inventory-report.test.tsx` |
