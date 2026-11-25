# F-09 Catalog management: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-09 Catalog management |
| Sprint | 2 (due 2026-11-29) |
| Version | 1.0 |
| Status | Proposed (PR for #79); implementation starts only after this contract is reviewed and merged |
| Date | 2026-11-25 |
| Authors | Methipat Mansap (67070501071); reviewer Teerakarn Noiruksa (67070501062) |
| Baseline | SRS v1.3 (v1.4 after #71), System-Level SDS v1.8, F-02 contract v1.3, F-03 contract v1.2, F-04 contract v1.0 (#74) |
| Issues | #79 this feature; #74 F-04 (item type detail, schema caps); #78 F-08 sends damaged units to `MAINTENANCE` |
| Definition of Done | [Product Definition of Done](../sprint-1/definition-of-done.md) and section 9 of this contract |
| AC/TEST block | 110 to 121 (claimed in #79) |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-25 | Methipat Mansap | First contract: AC-110 to AC-121, TEST-110 to TEST-121, decisions F09-D1 to F09-D10. Before review: `415` first in 3.5 (found in the review of #84); F09-D3 adopts the F-04 cap F04-D2. Review of PR #86: F-09 tests need no F-04 code (limits-change cases moved to F-04, counts read from `GET /api/categories`); `P2002` mapped by the service to `NAME_TAKEN` / `ASSET_TAG_TAKEN`; case-insensitive unique indexes (F09-D11); own name excluded on edit; FR-24 as the source of the new-unit row; TEST-117 checks the count and a checkout after repair |

Changes after approval get a new version row with the reason. AC and TEST IDs are never reused for a different meaning.

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What F-09 does with it |
| --- | --- | --- |
| Functional | FR-23, FR-24, FR-25, FR-26 | Create and edit categories and item types (description, maximum loan length, maximum quantity per request); add a unit with a unique asset tag (`AVAILABLE`); set a repaired unit from `MAINTENANCE` back to `AVAILABLE`; retire a unit that is not `ON_LOAN` |
| Business rules | BR-07, BR-08, BR-11, BR-12, BR-16 | The limits F-09 sets are the ones F-04 and F-05 enforce; a damaged unit is lent again only after repair; a unit on loan cannot be retired and a retired unit cannot be checked out; history for every unit change |
| Assumptions and decisions | A-07, D-08, D-12 | Asset tags unique across all item types; category default limits copied to new item types; a kit is one unit |
| SRS state rows | (new) → `AVAILABLE` (FR-24; SRS 8.1 has no row for it yet, added in the features and traceability PR), 8.1 `MAINTENANCE` → `AVAILABLE`, `AVAILABLE` or `MAINTENANCE` → `RETIRED` | The only unit transitions F-09 performs |
| Non-functional | NFR-01, NFR-02, NFR-05, NFR-09, NFR-12 | Session and role checks; retire and checkout race; history; list states |

### 2.2 Depends on

| Dependency | What F-09 uses | Status on 2026-11-25 |
| --- | --- | --- |
| SR-01 schema | `categories`, `item_types`, `units` with their unique names, unique `assetTag`, CHECKs ≥ 1 and `(itemTypeId, status)` index | Done (Sprint 1) |
| F-01 | `authenticate`, `requireRole("CUSTODIAN")`, route guards, navigation bar | Done |
| F-02 | `GET /api/categories`, catalog page | Done |
| F-03 | `GET /api/item-types/:id/units` with optional `status` (F03-D8), transition table, unit history pattern | Done |
| F-04 contract (#74) | The item type shape (F04-D6) for the create and edit responses, and the cap of 10 per request (F04-D2). No F-04 code: F-09 is implemented first (agreed order F-09 → F-04 → F-05), so F-09 reads counts and limits from `GET /api/categories` | Contract PR #84 |

No dependency on #73: every column F-09 writes exists since Sprint 1. F-09 adds one small migration of its own (F09-D11).

### 2.3 Out of scope for F-09

| Not in F-09 | Arrives in |
| --- | --- |
| Deleting a category, item type or unit | Never: records are not deleted (SDS 6.1). A unit leaves service by being retired |
| Un-retiring a unit | Not in SRS 8.1: `RETIRED` is final |
| Unit history view (FR-27) and inventory report (FR-29) | Sprint 3, F-12 and F-13 |
| Search and filter in the catalog (FR-06) | Sprint 3 |
| Sending a unit to `MAINTENANCE` | F-08 (#78): only a damaged return does that (BR-11) |
| History entries for category and item type edits | Not required: BR-16 covers requests, units and loans, and `HistoryEntity` has only `REQUEST`, `UNIT`, `LOAN` (F09-D8) |

## 3. Feature-level design (Feature SDS)

### 3.1 Behaviour and workflow

1. A Custodian opens **Manage catalog** (`/manage`). The UI calls `GET /api/categories` and shows every category with its default limits and its item types with their limits and available counts.
2. **New category** and **Edit** on a category open a form (name, description, default maximum loan length, default maximum quantity). Saving calls `POST /api/categories` or `PATCH /api/categories/:id`.
3. **New item type** in a category and **Edit** on an item type open a form (category, name, description, kit, maximum loan length, maximum quantity per request). On a new item type the limits start at the category's defaults. Saving calls `POST /api/item-types` or `PATCH /api/item-types/:id`.
4. **Units** on an item type opens `/manage/item-types/:id`. The UI takes the item type, its limits and its available count from `GET /api/categories` and calls `GET /api/item-types/:id/units` (every state, ordered by asset tag, F03-D8).
5. **Add unit** takes an asset tag and calls `POST /api/item-types/:id/units`. The new unit is `AVAILABLE` and the item type's available count rises by one.
6. A unit in `MAINTENANCE` shows **Mark repaired** (`POST /api/units/:id/repair`, back to `AVAILABLE`). A unit in `AVAILABLE` or `MAINTENANCE` shows **Retire**, which asks for confirmation (SDS 5.3) and calls `POST /api/units/:id/retire`.
7. Every unit change is one transaction: a conditional update on the expected state (SDS 4.7) and one history entry (3.6). A failure rolls back both.

### 3.2 State changes

| Entity | From | To | SRS row | Trigger |
| --- | --- | --- | --- | --- |
| Unit | (new) | `AVAILABLE` | FR-24 (no SRS 8.1 row yet; see 2.1) | Add unit |
| Unit | `MAINTENANCE` | `AVAILABLE` | 8.1, Sprint 2 | Mark repaired |
| Unit | `AVAILABLE` | `RETIRED` | 8.1, Sprint 2 | Retire |
| Unit | `MAINTENANCE` | `RETIRED` | 8.1, Sprint 2 | Retire |

`assertTransition("UNIT", …)` gains these four rows. Categories and item types have no state.

### 3.3 Business rules and where they are enforced

| Rule | UI (hint only) | Route and middleware | Service (in the transaction) | Domain | Database |
| --- | --- | --- | --- | --- | --- |
| Custodian only (NFR-02) | `/manage` and its link only for Custodians | `requireRole("CUSTODIAN")` on all seven write endpoints | - | - | - |
| Names unique without regard to case (SDS 4.3, F09-D2) | Error under the name field | Schema: trimmed, 1 to 100 characters | Case-insensitive check that ignores the record being edited → `409 NAME_TAKEN`; a `P2002` on the name indexes is caught and mapped to the same `409` (F09-D11) | - | Unique indexes on `lower(name)` (F09-D11) |
| Limits ≥ 1 and bounded (BR-07, BR-08, D-08) | Number inputs with the same bounds | Schema: loan days 1 to 365, quantity 1 to 10 (F09-D3) | - | - | CHECKs ≥ 1 |
| New item type limits from the category (D-08) | Form starts with the defaults | - | Omitted limits are copied from the category (F09-D4) | - | - |
| Asset tag unique across item types (A-07) | Error under the field | Schema: trimmed, uppercased, format `KH-<CODE>-<NNNN>` (F09-D6) | The insert's `P2002` on `units.assetTag` is caught and mapped to `409 ASSET_TAG_TAKEN` (F09-D11) | - | `units.assetTag` unique |
| Repair only from `MAINTENANCE` (BR-11, FR-25) | Button only on `MAINTENANCE` | - | Conditional update `WHERE status = 'MAINTENANCE'` → `409 INVALID_STATE` | `assertTransition` | - |
| No retiring a unit on loan (BR-12, FR-26) | Button only on `AVAILABLE` and `MAINTENANCE` | - | Conditional update `WHERE status IN ('AVAILABLE','MAINTENANCE')` → `409 INVALID_STATE` | `assertTransition` | - |
| A retired unit cannot be checked out (BR-12) | Not listed in the checkout dialog | - | The checkout's conditional update needs `AVAILABLE` (F-03, F-07) | - | - |
| History for unit changes (BR-16) | - | - | One entry per add, repair and retire (3.6) | - | Append-only trigger |

### 3.4 Validation

| Input | Rule | Error |
| --- | --- | --- |
| Path `id` (all endpoints) | Integer 1 to 2 147 483 647 | `400 VALIDATION_FAILED` naming `id` |
| Category create | Strict `{ name, description?, defaultMaxLoanDays, defaultMaxQuantity }`; `name` trimmed 1 to 100 characters; `description` string up to 1000 characters or `null` (empty after trimming becomes `null`); `defaultMaxLoanDays` integer 1 to 365; `defaultMaxQuantity` integer 1 to 10 | `400` naming each field |
| Category edit | Strict, the same fields, all optional, at least one present | `400` naming the field, or `body` ("At least one field is required") |
| Item type create | Strict `{ categoryId, name, description?, isKit?, maxLoanDays?, maxQuantityPerRequest? }`; `categoryId` integer ≥ 1; `name` trimmed 1 to 100; `description` string up to 1000 (default `""`, SDS 4.2 "may be empty"); `isKit` boolean (default `false`); limits as for categories | `400` naming each field |
| Item type edit | Strict, the same fields, all optional, at least one present | `400` naming the field, or `body` |
| Add unit | Strict `{ assetTag }`; trimmed and uppercased, then `^KH-[A-Z0-9]{2,6}-[0-9]{4}$` | `400` naming `assetTag` ("Must look like KH-ARD-0007") |
| Repair, retire body | Exactly `{}` | `400` naming the unknown field |
| `Content-Type` on POST and PATCH | `application/json` (SDS 6.2) | `415` |

### 3.5 Check order

`415` → `401` → `403` → `400` (path, then body) → `404` (the record in the path; then a `categoryId` in the body) → `409` (`NAME_TAKEN`, `ASSET_TAG_TAKEN`, `INVALID_STATE`). After `415`, this is SDS 6.5's order (SDS 6.5 does not list `415`). `415` comes first because SR-01 mounts `requireJson` on the whole `/api` router before authentication (`server/src/app.ts`); a no-session test still sends `Content-Type: application/json`. Messages that name a current state come from a re-read inside the transaction after a 0-row update.

### 3.6 History entries

Unit changes only. One timestamp `now` per transaction; `actorType` `USER`, `actorUserId` the Custodian, `entityType` `UNIT`, `unitId` the unit, `requestId` and `loanId` null (SDS 4.2: a unit entry has a request only when a checkout or return caused it).

| Action | `action` | `fromStatus` → `toStatus` | `details` |
| --- | --- | --- | --- |
| Add unit | `CREATED` | null → `AVAILABLE` | `{ "assetTag": "KH-ARD-0006" }` |
| Mark repaired | `STATUS_CHANGED` | `MAINTENANCE` → `AVAILABLE` | null |
| Retire | `STATUS_CHANGED` | `AVAILABLE` or `MAINTENANCE` → `RETIRED` | null |

### 3.7 Concurrency

| Race | Outcome |
| --- | --- |
| Retire and checkout of the same `AVAILABLE` unit | Both are conditional updates on the unit row; exactly one wins. Retire first: the checkout gets `409 UNIT_NOT_AVAILABLE` and rolls back. Checkout first: the retire gets `409 INVALID_STATE` (`ON_LOAN`, BR-12) |
| Repair and retire of the same `MAINTENANCE` unit | Repair first: both succeed (`AVAILABLE` → `RETIRED` is allowed) and the unit ends `RETIRED`. Retire first: the repair gets `409 INVALID_STATE` |
| Two retires, or two repairs, of one unit | One success, one `409 INVALID_STATE`; one history entry |
| Two adds with the same asset tag (any item types) | The unique index lets one insert; the other's `P2002` is mapped to `409 ASSET_TAG_TAKEN` (F09-D11) |
| Two creates or renames to the same category or item type name, also in another letter case ("Robotics" and "robotics") | The `lower(name)` index lets one through; the other's `P2002` is mapped to `409 NAME_TAKEN` (F09-D11) |
| An item type edit and a request create that reads its limits | The create reads the limits inside its transaction; it is checked against either the old or the new limits, never a mix (F09-D5) |

### 3.8 Decisions made in this contract

| ID | Decision | Reason |
| --- | --- | --- |
| F09-D1 | Endpoints as SDS 6.6: `POST /api/categories`, `PATCH /api/categories/:id`, `POST /api/item-types`, `PATCH /api/item-types/:id`, `POST /api/item-types/:id/units`, `POST /api/units/:id/repair`, `POST /api/units/:id/retire`. Creates return `201`, edits and transitions `200`, each with the changed record | SDS 6.1 and 6.3 conventions; the UI refreshes from the response |
| F09-D2 | Names are trimmed and unique without regard to case: "arduino uno r3" is taken when "Arduino Uno R3" exists. An edit ignores the record's own name, so resending it or changing only its letter case is allowed. `409 NAME_TAKEN`, "An item type named Arduino Uno R3 already exists." / "A category named Instruments already exists." | Two names that differ only in case would look like duplicates to a Borrower. The `lower(name)` indexes (F09-D11) make this hold under a race too |
| F09-D3 | Loan days 1 to 365 and quantity per request 1 to 10, for category defaults and item types. Adopts F04-D2: no item type may allow more than 10 per request | 365 matches the `loanDays` bound of F-04; 10 is above every D-08 default (largest 4). F04-D2 sets 10 lines × 10 = 100 units per request, which F-07 and F-08 use, so F-09 must not allow more |
| F09-D4 | A new item type whose limits are left out gets its category's defaults at that moment. Changing a category's defaults does not change its existing item types | SDS 4.2: the defaults are "copied to new item types in this category". A Custodian may have tuned an item type on purpose |
| F09-D5 | Changed item type limits apply to the next create (F-04) and edit (F-05). Existing `PENDING` and `APPROVED` requests are not re-checked and keep their quantities and `loanDays`; F-07 uses the request's `loanDays` | The Borrower made the request under the old limits, and the Custodian still approves or rejects it (F-06). Re-checking would need a state the SRS does not have |
| F09-D6 | Asset tags are trimmed and stored in upper case; the format is `KH-<CODE>-<NNNN>` with a code of 2 to 6 letters or digits (SDS 4.2). Unique across all item types (A-07): `409 ASSET_TAG_TAKEN`, "Asset tag KH-ARD-0006 is already used." | Matches the labels on the shelf and the seed (`KH-SR04-0003`). Upper case makes "kh-ard-0006" and "KH-ARD-0006" the same tag |
| F09-D7 | An item type can be moved to another category with `categoryId` in its edit; its limits do not change | Categories group the catalog; a move should not silently change a lending rule |
| F09-D8 | Category and item type changes write no history entry; unit add, repair and retire write one each (3.6) | BR-16 and NFR-09 cover requests, units and loans. The unit entries are what FR-27 (Sprint 3) shows |
| F09-D9 | Representations: category `{ id, name, description, defaultMaxLoanDays, defaultMaxQuantity }`; item type as F04-D6; unit `{ id, assetTag, status, itemType { id, name } }`. `GET /api/categories` adds `defaultMaxLoanDays` and `defaultMaxQuantity` to each category, for both roles | The manage page needs the defaults; they are not private, so one catalog shape for both roles stays (F02-D7). TEST-08 compares the two bodies and stays valid. The existing list `GET /api/item-types/:id/units` keeps its item shape `{ id, assetTag, status }` (F-03); only the F-09 unit endpoints return `itemType` |
| F09-D11 | One migration, `<timestamp>_catalog_names_ci`, adds unique indexes on `lower(name)` for `categories` and `item_types` (raw SQL, SDS 4.3). The F-09 services catch a Prisma `P2002` on these indexes and on `units.assetTag` and map it to `409 NAME_TAKEN` or `409 ASSET_TAG_TAKEN` by the index name, as F-03 does for loans with `toLoanInsertConflict`; any other `P2002` is rethrown | The error handler maps every `P2002` to the generic `409 CONFLICT` (`error-handler.ts`), so the rule codes need the service mapping. The case-sensitive Sprint 1 indexes cannot stop "Robotics" and "robotics" created at the same moment. The seed names are already unique without regard to case, so the migration applies cleanly |
| F09-D10 | Messages: repair `409` "Unit KH-ARD-0002 cannot be marked repaired because it is AVAILABLE, not MAINTENANCE."; retire `409` "Unit KH-ARD-0001 cannot be retired because it is ON_LOAN." (or `RETIRED`); `404` "Unit 999 does not exist.", "Category 999 does not exist.", "Item type 999 does not exist." | Same style as F-03, F-06 and F-08 |

## 4. UI specification

### 4.1 Layers changed by F-09

| Layer | Change |
| --- | --- |
| UI | New Manage catalog page `/manage` and units page `/manage/item-types/:id` (Custodian); category and item type forms; add-unit form; repair and retire actions with confirmation; "Manage catalog" link for Custodians |
| API | Seven new endpoints (F09-D1); `GET /api/categories` adds the default limits |
| Domain | Four new unit rows in the transition table |
| Database | None |

### 4.2 Manage catalog (`/manage`, Custodian)

- Route wrapped in `RequireAuth` and `RequireRole("CUSTODIAN")`; a Borrower who opens `/manage` sees the Forbidden page.
- One panel per category: name, description, "Defaults: 14 days, 2 per request", **Edit**, **New item type**. Inside, one row per item type: name (with "Kit"), "14 days", "2 per request", "3 available", **Edit**, **Units**.
- **New category** at the top.
- States through `AsyncState`: "Loading…", "The catalog is empty. Add a category to start.", error with "Try again".

### 4.3 Category and item type forms (dialogs)

| Aspect | Behaviour |
| --- | --- |
| Fields | Category: name, description, default maximum loan length (days), default maximum quantity. Item type: category (select), name, description, kit (checkbox), maximum loan length, maximum per request; on a new item type the two limits start at the category's defaults |
| Client checks | Same bounds as 3.4; errors under the field on submit (SDS 5.3) |
| Save | Disabled with a spinner while submitting; a double click sends one call |
| Success | Dialog closes; "Category Instruments saved." / "Item type Oscilloscope saved."; the list is fetched again |
| `409 NAME_TAKEN` | The message under the name field; the dialog stays open |
| `400` | `details` under the matching fields |
| `404` | The message as an alert; the list is fetched again |

### 4.4 Units of an item type (`/manage/item-types/:id`, Custodian)

| Element | Behaviour |
| --- | --- |
| Header | Item type name, category, limits and "3 available" (from `GET /api/categories`; F-04's `GET /api/item-types/:id` can replace it once F-04 is merged) |
| Units table | Asset tag, `StatusBadge` with the unit state; ordered by asset tag; empty "No units yet." |
| Add unit | Text field "Asset tag" with the placeholder "KH-ARD-0006" and **Add unit**; the client sends the text as typed and the server trims and upper-cases it (F09-D6); success "KH-ARD-0006 added."; the field is cleared and the table fetched again; `409 ASSET_TAG_TAKEN` or `400` under the field |
| Mark repaired | On `MAINTENANCE` rows; no confirmation (it only makes a unit lendable again); success "KH-ARD-0002 is available again." |
| Retire | On `AVAILABLE` and `MAINTENANCE` rows; confirmation "Retire KH-ARD-0003? A retired unit can never be lent again." with **Retire unit** and **Keep unit**; success "KH-ARD-0003 retired." |
| `409` on repair or retire | The API message as an alert; the table is fetched again (another Custodian or a checkout changed the unit) |
| States | "Loading…", `404` "Item type not found." with a link to `/manage`, error with "Try again" |

Planned files: `client/src/pages/manage/ManageCatalogPage.tsx`, `client/src/pages/manage/CategoryForm.tsx`, `client/src/pages/manage/ItemTypeForm.tsx`, `client/src/pages/manage/ManageUnitsPage.tsx`, `client/src/api/manage.ts`.

## 5. API specification

Conventions from SDS 6.1 to 6.5. Every endpoint below is Custodian only: a Borrower gets `403 FORBIDDEN`, a call without a session `401 UNAUTHENTICATED`.

### 5.1 Categories

| Endpoint | Body | Success | Errors |
| --- | --- | --- | --- |
| `POST /api/categories` | `{ "name": "Robotics", "description": null, "defaultMaxLoanDays": 7, "defaultMaxQuantity": 2 }` | `201` category | `400`, `409 NAME_TAKEN` |
| `PATCH /api/categories/:id` | Any of the create fields, at least one, for example `{ "defaultMaxQuantity": 3 }` | `200` category | `400`, `404`, `409 NAME_TAKEN` |

Response:

```json
{ "id": 7, "name": "Robotics", "description": null, "defaultMaxLoanDays": 7, "defaultMaxQuantity": 2 }
```

### 5.2 Item types

| Endpoint | Body | Success | Errors |
| --- | --- | --- | --- |
| `POST /api/item-types` | `{ "categoryId": 7, "name": "Servo motor SG90", "description": "Micro servo, 180°.", "isKit": false }` (limits omitted → 7 days, 2 per request from the category) | `201` item type (F04-D6), `availableCount` 0 | `400`, `404` (category, naming `categoryId`), `409 NAME_TAKEN` |
| `PATCH /api/item-types/:id` | Any of the create fields, at least one, for example `{ "maxQuantityPerRequest": 4, "categoryId": 3 }` | `200` item type | `400`, `404` (item type, then category), `409 NAME_TAKEN` |

### 5.3 Units

| Endpoint | Body | Success | Errors |
| --- | --- | --- | --- |
| `POST /api/item-types/:id/units` | `{ "assetTag": "kh-srv-0001" }` | `201` `{ "id": 41, "assetTag": "KH-SRV-0001", "status": "AVAILABLE", "itemType": { "id": 12, "name": "Servo motor SG90" } }` | `400`, `404`, `409 ASSET_TAG_TAKEN` |
| `POST /api/units/:id/repair` | `{}` | `200` unit, `status` `AVAILABLE` | `400`, `404`, `409 INVALID_STATE` |
| `POST /api/units/:id/retire` | `{}` | `200` unit, `status` `RETIRED` | `400`, `404`, `409 INVALID_STATE` |

Example error:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Unit KH-ARD-0001 cannot be retired because it is ON_LOAN.",
    "requestId": "5d7e2a90-1c3b-4f6e-8a2d-9b0c4e1f3a7d"
  }
}
```

### 5.4 Changed read

`GET /api/categories` (F-02 4.1): each category gains `defaultMaxLoanDays` and `defaultMaxQuantity` (F09-D9). Order, item types and `availableCount` are unchanged.

## 6. Data specification

### 6.1 Schema and migrations

One additive migration (F09-D11): unique indexes on `lower(name)` for `categories` and `item_types`. Otherwise F-09 uses the Sprint 1 tables and their constraints: `categories.name` and `item_types.name` unique, `units.assetTag` unique, CHECKs ≥ 1 on the limits (SDS 4.3).

### 6.2 Tables read and written

| Table | Read | Written |
| --- | --- | --- |
| `categories` | All, for the list and the defaults | Insert; update of name, description, defaults |
| `item_types` | All, with available counts | Insert; update of every editable field |
| `units` | One item type's units; one unit for repair or retire | Insert (`AVAILABLE`); `status` by repair and retire, only from the expected states |
| `history_entries` | - | One `UNIT` entry per add, repair and retire |

## 7. Acceptance criteria

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-110 | A Custodian creates a category with a name, an optional description and default limits; it is returned with `201` and appears in the catalog with no item types | FR-23 |
| AC-111 | A Custodian edits a category's name, description or default limits; only the sent fields change; changed defaults do not change the limits of its existing item types | FR-23, D-08 |
| AC-112 | A category or item type body with a blank or over-long name, a limit outside its bounds, an unknown field or no field on an edit is rejected with `400 VALIDATION_FAILED` naming the field; a name already used, in any letter case, gives `409 NAME_TAKEN`; an unknown category or item type ID gives `404`; nothing changes | FR-23 |
| AC-113 | A Custodian creates an item type in a category with a description and limits; limits left out are copied from the category's defaults; it appears in the catalog and its detail with 0 available; an unknown `categoryId` gives `404` and nothing is stored | FR-23, D-08 |
| AC-114 | A Custodian edits an item type's description, kit flag, limits or category; the new limits are stored and are what the next request create and edit read (checked in F-04 TEST-66 (e) and TEST-67 (e)); existing `PENDING` and `APPROVED` requests keep their lines | FR-23, BR-07, BR-08 |
| AC-115 | A Custodian adds a unit with an asset tag: it is stored in upper case as `AVAILABLE`, the item type's available count rises by one, and one `UNIT` history entry `CREATED` → `AVAILABLE` with the Custodian is written | FR-24, BR-16 |
| AC-116 | Adding a unit with a badly formed asset tag gives `400`; with a tag already used by any unit of any item type, in any letter case, `409 ASSET_TAG_TAKEN`; for an unknown item type `404`; nothing is stored | FR-24, A-07 |
| AC-117 | A Custodian marks a `MAINTENANCE` unit repaired: it becomes `AVAILABLE`, counts as available and can be checked out, and one history entry `MAINTENANCE` → `AVAILABLE` is written; repairing a unit in any other state gives `409 INVALID_STATE` and nothing changes | FR-25, BR-11, BR-16 |
| AC-118 | A Custodian retires an `AVAILABLE` or a `MAINTENANCE` unit: it becomes `RETIRED`, no longer counts as available and one history entry is written; retiring an `ON_LOAN` or `RETIRED` unit gives `409 INVALID_STATE` and nothing changes; a checkout that names a retired unit is rejected with `409 UNIT_NOT_AVAILABLE` | FR-26, BR-12, BR-16 |
| AC-119 | A retire racing a checkout of the same unit, two adds of the same asset tag, and two creates of the same category name, also in another letter case, each end with exactly one success and one `409`, with history only for the success | BR-12, NFR-05, A-07 |
| AC-120 | Each of the seven catalog management endpoints answers a Borrower with `403 FORBIDDEN` and a call without a session with `401 UNAUTHENTICATED`, with only the `error` object, and nothing changes | NFR-01, NFR-02 |
| AC-121 | The Manage catalog page lists categories with their defaults and item types with their limits and available counts, with loading, empty and error states; the forms create and edit categories and item types and show `NAME_TAKEN` under the name; the units page lists units with their state, adds a unit, offers Mark repaired only on `MAINTENANCE` and Retire only on `AVAILABLE` and `MAINTENANCE` with a confirmation; a Borrower sees the Forbidden page at `/manage` | FR-23 to FR-26, NFR-12 |

## 8. Software Test Specification (STS)

### 8.1 Conventions

- Levels, tools and factories as in the F-02 and F-03 contracts (`createCategory`, `createItemType`, `createUnit`, `createItemTypeWithUnits` in `server/tests/helpers/factories.ts`). API and Integration tests run against `kithub_test`, never the demo seed.
- "Unchanged" means the `categories`, `item_types` and `units` rows (all columns) and the `history_entries` count are equal before and after the call: new helper `snapshotCatalogState()` in `server/tests/helpers/catalog.ts`.
- **TDD** marks the tests for the rules and transitions. Each is committed and run on the pre-implementation code first and must fail on an assertion (`404` because the route does not exist is a valid missing-behaviour failure); the failing output and the commit are kept. UI tests mock `client/src/api/manage.ts` with a `vi.mock` factory.
- Tests that need a unit in `MAINTENANCE` create it with the factory, so F-09 does not depend on the F-08 return endpoints. TEST-118 (e) and TEST-119 (a) use the checkout endpoint that is on `staging` when F-09 is implemented (Sprint 1 checkout of a `PENDING` request, or F-07 checkout of an `APPROVED` one); the request is made in the state that endpoint needs.

### 8.2 Test cases

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-110 **TDD** | AC-110 | API | Custodian C; Borrower B | (a) as C `POST /api/categories` `{ name: "  Robotics ", description: "", defaultMaxLoanDays: 7, defaultMaxQuantity: 2 }`; (b) as B `GET /api/categories` | (a) `201` `{ id, name: "Robotics", description: null, defaultMaxLoanDays: 7, defaultMaxQuantity: 2 }`; one new `categories` row; no history entry. (b) "Robotics" listed with `itemTypes: []` and its defaults | `server/tests/api/catalog-manage.test.ts` |
| TEST-111 **TDD** | AC-111 | API | Category K (14 days, 2) with item type T (14 days, 2) | (a) `PATCH /api/categories/K` `{ defaultMaxLoanDays: 7 }`; (b) `{ name: "Boards", description: "Dev boards" }` | (a) `200`, `defaultMaxLoanDays` 7, name and quantity unchanged; T still 14 days. (b) `200`, both changed, defaults as after (a) | `server/tests/api/catalog-manage.test.ts` |
| TEST-112 **TDD** | AC-112 | API | Categories "Instruments" and K; item type "Arduino Uno R3" | (a) category create with `name: "   "`; (b) 101-character name; (c) `defaultMaxLoanDays` 0, then 366; (d) `defaultMaxQuantity` 11; (e) `{ "name": "Robotics", "defaultMaxLoanDays": 7, "defaultMaxQuantity": 2, "id": 5 }`; (f) `PATCH /api/categories/K` with `{}`; (g) create "instruments"; (h) item type create named "ARDUINO UNO R3"; (i) `PATCH /api/categories/999999`; (j) `PATCH /api/item-types/999999`; (k) `PATCH /api/categories/<Instruments>` `{ "name": "INSTRUMENTS" }`; (l) `PATCH /api/item-types/<Arduino>` `{ "name": "Arduino Uno R3" }` | (a) to (f) `400 VALIDATION_FAILED` naming `name`, `name`, `defaultMaxLoanDays`, `defaultMaxQuantity`, `id`, `body`. (g), (h) `409 NAME_TAKEN` with the F09-D2 message. (i), (j) `404 NOT_FOUND`. Unchanged after (a) to (j). (k), (l) `200`: the record's own name does not collide with itself; (k) stores "INSTRUMENTS" | `server/tests/api/catalog-manage.test.ts` |
| TEST-113 **TDD** | AC-113 | API | Category K "Robotics" (7 days, 2) | (a) `POST /api/item-types` `{ categoryId: K, name: "Servo motor SG90" }`; (b) the same with `maxLoanDays: 3, maxQuantityPerRequest: 1, isKit: true, description: "Set of 4"` and another name; (c) `GET /api/categories` as a Borrower; (d) create with `categoryId` 999 999 | (a) `201`, `maxLoanDays` 7, `maxQuantityPerRequest` 2, `description` "", `isKit` false, `availableCount` 0, `category.id` K. (b) `201` with the sent values. (c) the new item type listed under Robotics with `availableCount` 0 and the limits of (a). (d) `404` naming `categoryId`; Unchanged | `server/tests/api/catalog-manage.test.ts` |
| TEST-114 **TDD** | AC-114 | API | Item type T (14 days, max 2) with 5 `AVAILABLE` units; Borrower B with `PENDING` request R for T × 2 (factory) | (a) `PATCH /api/item-types/T` `{ "maxQuantityPerRequest": 1, "maxLoanDays": 7, "description": "New", "isKit": true }`; (b) read T from the database and from `GET /api/categories`; (c) read R; (d) `PATCH` T `{ "categoryId": <other> }` | (a) `200` with the new values. (b) `maxQuantityPerRequest` 1 and `maxLoanDays` 7 in both. (c) R still T × 2 and `PENDING`; its lines unchanged. (d) `200`, the category changed, limits 7 and 1 unchanged. The "next create is checked against the new limits" part of AC-114 is F-04 TEST-66 (e) and TEST-67 (e), because the create rules are F-04's | `server/tests/api/catalog-manage.test.ts` |
| TEST-115 **TDD** | AC-115 | API | Item type T with 2 `AVAILABLE` units | `POST /api/item-types/T/units` `{ assetTag: " kh-ard-0006 " }` | `201` `{ assetTag: "KH-ARD-0006", status: "AVAILABLE", itemType.id T }`; `GET /api/categories` shows T with `availableCount` 3; exactly one new history entry (`UNIT`, `CREATED`, `toStatus` `AVAILABLE`, actor C, `unitId` the unit, `requestId` null, `details.assetTag` "KH-ARD-0006") | `server/tests/api/units-manage.test.ts` |
| TEST-116 **TDD** | AC-116 | API | Item types T and S; unit `KH-ARD-0001` of T | Add to S: (a) `ARD-0001`; (b) `KH-ARD-1`; (c) `KH-ARD-0001`; (d) `kh-ard-0001`; (e) `{ assetTag: "KH-X-0001" }`; (f) `{ assetTag: "KH-SRV-0001", status: "ON_LOAN" }`; add to item type 999 999 (g) | (a), (b), (e) `400` naming `assetTag`. (f) `400` naming `status`. (c), (d) `409 ASSET_TAG_TAKEN`, "Asset tag KH-ARD-0001 is already used.". (g) `404`. Unchanged after each | `server/tests/api/units-manage.test.ts` |
| TEST-117 **TDD** | AC-117 | API | Units M (`MAINTENANCE`), A (`AVAILABLE`), L (`ON_LOAN` with an `ACTIVE` loan), X (`RETIRED`) of T | (a) repair M; (b) repair A, L and X; (c) `GET /api/item-types/T/units?status=AVAILABLE`; (d) check out a request for T with M (the checkout on `staging`, as TEST-118 (e)) | (a) `200`, `status` `AVAILABLE`; one history entry `MAINTENANCE` → `AVAILABLE`, actor C; T's `availableCount` in `GET /api/categories` +1. (b) each `409 INVALID_STATE` naming the state ("… because it is AVAILABLE, not MAINTENANCE."); Unchanged. (c) lists M and A. (d) `201`, M `ON_LOAN` | `server/tests/api/units-manage.test.ts` |
| TEST-118 **TDD** | AC-118 | API | As TEST-117, plus a request that can be checked out for T | (a) retire A; (b) retire M; (c) retire L; (d) retire A again; (e) check out the request with A | (a), (b) `200`, `RETIRED`; one history entry each (from `AVAILABLE` / `MAINTENANCE`); available count drops for A. (c) `409 INVALID_STATE`, "Unit KH-… cannot be retired because it is ON_LOAN."; L still `ON_LOAN` with its loan `ACTIVE`. (d) `409` naming `RETIRED`. (e) `409 UNIT_NOT_AVAILABLE`; no loan created | `server/tests/api/units-manage.test.ts` |
| TEST-119 **TDD** | AC-119 | Integration | Fresh data per round, 5 rounds per case; Custodians C1, C2 | `Promise.all` of (a) retire U and a checkout naming U (U `AVAILABLE`); (b) two adds of `KH-SRV-0009` to two item types; (c) two `POST /api/categories` named "Robotics"; (d) `POST /api/categories` named "Robotics" and "robotics" | (a) exactly one success; if retire won: U `RETIRED`, checkout `409 UNIT_NOT_AVAILABLE`, no loan; if checkout won: U `ON_LOAN`, retire `409 INVALID_STATE`; history only for the winner. (b) one `201`, one `409 ASSET_TAG_TAKEN` (not the generic `409 CONFLICT`); one unit, one history entry. (c), (d) one `201`, one `409 NAME_TAKEN` (not the generic `409 CONFLICT`) | `server/tests/api/units-manage-concurrency.test.ts` |
| TEST-120 | AC-120 | API | Borrower B; category K, item type T, unit U | (a) as B, each of the seven endpoints with a valid body; (b) the same with no cookie and with a signed-out session cookie | (a) each `403 FORBIDDEN`; (b) each `401 UNAUTHENTICATED`; each body only `error`; Unchanged | `server/tests/api/catalog-manage-access.test.ts` |
| TEST-121 **TDD** | AC-121 | UI | `ManageCatalogPage`, `CategoryForm`, `ItemTypeForm` and `ManageUnitsPage` with `client/src/api/manage.ts` and the catalog module mocked | (a) list pending, empty, error then success; (b) list with "Instruments" (3 days, 1) and the multimeter; (c) New item type in Instruments; (d) save a category, the mock rejects with `409 NAME_TAKEN`; (e) units page with units in `AVAILABLE`, `MAINTENANCE`, `ON_LOAN`, `RETIRED`; (f) Add unit "kh-dmm-0004"; (g) Retire → Keep unit, then Retire → Retire unit; (h) Mark repaired; (i) render `/manage` as a Borrower | (a) "Loading…", "The catalog is empty. Add a category to start.", the error and "Try again". (b) "Defaults: 3 days, 1 per request" and the item type row with its limits and count. (c) the form's limits start at 3 and 1. (d) the message under the name; the dialog stays open. (e) Mark repaired only on the `MAINTENANCE` row; Retire only on `AVAILABLE` and `MAINTENANCE`; no button on `ON_LOAN` and `RETIRED`. (f) the add mock called once with the item type and "kh-dmm-0004"; "KH-DMM-0004 added.". (g) no call after Keep; one retire call after confirming; "… retired.". (h) one repair call; "… is available again.". (i) Forbidden page | `client/tests/ManageCatalogPage.test.tsx`, `client/tests/ManageUnitsPage.test.tsx` |

### 8.3 Coverage checks

- AC-n is verified by TEST-n for AC-110 to AC-121.
- Every one of the seven new endpoints has a no-session and a wrong-role test (TEST-120, SDS 7.3).
- Every rejection test asserts Unchanged.
- Regression: the catalog test TEST-08 and the catalog UI tests must still pass with the two added category fields (F09-D9); a test that compares the exact key set of a category is updated to include them, with the reason in the PR. The checkout suites must still pass: F-09 adds unit transitions and changes none of the checkout rows.

## 9. Definition of Done (F-09)

| # | Item | Evidence |
| --- | --- | --- |
| 1 | AC-110 to AC-121 implemented as specified in sections 3 to 6 | PR lists each AC with its commit or file |
| 2 | TEST-110 to TEST-121 exist under their planned files (or recorded new paths) with the stated assertions, and pass | `npm test` output in `server/` and `client/` with counts and the tested commit |
| 3 | TDD tests failed on assertions before the implementation and passed after | Test-only commit SHA with failing output; implementation commit SHA with passing output |
| 4 | No test skipped, disabled or weakened; changed key-set assertions explained | Skip count 0; PR note |
| 5 | Reviewed by the teammate with a specific comment; CI `test-and-docker` green | GitHub review and checks |
| 6 | `docs/features.md` and `docs/traceability.md` list AC-110 to AC-121 with results | Diff in the PR |
| 7 | E2E journeys still pass | `npm run test:e2e` output |
| 8 | Known limitations disclosed: no un-retire; category and item type edits are not in history; changed limits do not re-check open requests (F09-D5) | PR section |

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-110 | FR-23 | TEST-110 | `server/tests/api/catalog-manage.test.ts` |
| AC-111 | FR-23, D-08 | TEST-111 | `server/tests/api/catalog-manage.test.ts` |
| AC-112 | FR-23 | TEST-112 | `server/tests/api/catalog-manage.test.ts` |
| AC-113 | FR-23, D-08 | TEST-113 | `server/tests/api/catalog-manage.test.ts` |
| AC-114 | FR-23, BR-07, BR-08 | TEST-114 | `server/tests/api/catalog-manage.test.ts` |
| AC-115 | FR-24, BR-16 | TEST-115 | `server/tests/api/units-manage.test.ts` |
| AC-116 | FR-24, A-07 | TEST-116 | `server/tests/api/units-manage.test.ts` |
| AC-117 | FR-25, BR-11, BR-16 | TEST-117 | `server/tests/api/units-manage.test.ts` |
| AC-118 | FR-26, BR-12, BR-16 | TEST-118 | `server/tests/api/units-manage.test.ts` |
| AC-119 | BR-12, NFR-05, A-07 | TEST-119 | `server/tests/api/units-manage-concurrency.test.ts` |
| AC-120 | NFR-01, NFR-02 | TEST-120 | `server/tests/api/catalog-manage-access.test.ts` |
| AC-121 | FR-23, FR-24, FR-25, FR-26, NFR-12 | TEST-121 | `client/tests/ManageCatalogPage.test.tsx`, `client/tests/ManageUnitsPage.test.tsx` |
