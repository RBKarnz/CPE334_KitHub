# F-12 Search and filter the catalog: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| Feature | F-12 Search and filter the catalog |
| Sprint | 3 (due 2026-12-13) |
| Version | 1.1 |
| Status | Proposed (PR for #109); implementation starts only after this contract is reviewed and merged |
| Date | 2026-11-27 |
| Authors | Methipat Mansap (67070501071); reviewer Teerakarn Noiruksa (67070501062) |
| Baseline | SRS v1.6 (#106), System-Level SDS v1.13, F-02 contract v1.5, F-04 contract v1.0, F-09 contract v1.0 |
| Issues | #109 this feature; #107 F-10 (changes what "available" means; F-12 reuses its count); #112 SR-03 (NFR-11 measurement) |
| Definition of Done | [Product Definition of Done](../sprint-1/definition-of-done.md) and section 9 of this contract |
| AC/TEST block | 142 to 149 (claimed in #109) |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-27 | Methipat Mansap | First contract: AC-142 to AC-149, TEST-142 to TEST-149, decisions F12-D1 to F12-D7 |
| 1.1 | 2026-11-27 | Methipat Mansap | Review of PR #115: TEST-145 (a) has a non-empty answer that each dropped filter widens; SDS section is 6.1, not 6.2; invalid filter values in the URL (F12-D8, 4.2, TEST-149 (d), (e)); narrow layout cites SDS 5.3 / SR-04 (below 768 px) and NFR-12 only the list states; AC-142 and F12-D1 name only `%` and `_`, the characters that are tested |

Changes after approval get a new version row with the reason. AC and TEST IDs are never reused for a different meaning.

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What F-12 does with it |
| --- | --- | --- |
| Functional | FR-06 | A signed-in user searches item types by name and filters them by category and by availability |
| Non-functional | NFR-01, NFR-08, NFR-12 | No session `401`; the standard error shape; loading, empty and error states (NFR-12 "List states") |
| System responsibility | SR-04, SDS 5.3 "Visual style" | The narrow layout below 768 px, checked from 320 to 1440 px |
| Non-functional (measured later) | NFR-11 | The search endpoint is one of the lists measured by SR-03 (#112); F-12 adds no performance claim of its own |
| SDS | 5.1 Catalog ("Search and filter (FR-06) are added to the Catalog screen in Sprint 3"), 6.6 `GET /api/item-types?search=&categoryId=&available=`, 7.1 | Used as written, with one deviation: no `?page=` (F12-D5) |

### 2.2 Depends on

| Feature | What F-12 needs | Status |
| --- | --- | --- |
| F-02 (#18) | Catalog page and the available count (BR-01, D-15) | On `main` |
| F-04 (#74) | The item type shape (F04-D6) | On `main` |
| F-09 (#79) | Categories and item types can change at any time; names are unique ignoring case | On `main` |
| F-10 (#107) | Once merged, "available" also subtracts reserved quantities. F-12 calls the same availability function as the catalog, so it follows without its own change (F12-D3) | Contract pending |

### 2.3 Out of scope for F-12

| Item | Where |
| --- | --- |
| Paging | Not needed at the product's size (F12-D5) |
| Search in descriptions, asset tags or requests | Not in FR-06 |
| Sorting options | One fixed order (F12-D4) |

## 3. Feature-level design (Feature SDS)

### 3.1 Behaviour and workflow

1. The Catalog page (`/catalog`, both roles) gets a filter bar: a search box "Search item types", a category select ("All categories" or one category) and a check box "Available only".
2. Each change updates the URL query (`?q=arduino&category=2&available=1`) and calls `GET /api/item-types` with the matching filters; the search box waits 300 ms after the last key press (F12-D6).
3. With no filter, the page keeps the Sprint 1 view from `GET /api/categories` (every category, also empty ones). With a filter, it shows the matching item types grouped under their category name; categories with no match are left out.
4. The Borrower's **Request** button and the item type links work on filtered results as before (F-04 4.1).
5. "No item types match these filters." with a **Clear filters** button when the result is empty.

### 3.2 State changes

None. Read only.

### 3.3 Business rules and where they are enforced

| Rule | UI | Route | Service | Database |
| --- | --- | --- | --- | --- |
| Search by name (FR-06) | Search box | Query schema: `search` 1 to 100 characters after trimming | Case-insensitive substring match on `item_types.name`; `%` and `_` in the input are matched literally (F12-D1) | `ILIKE` with an escaped pattern |
| Filter by category | Category select | `categoryId` integer ≥ 1 | Unknown category → `404` (F12-D2) | FK `item_types.categoryId` |
| Filter by availability | "Available only" | `available` only `true` | Keeps item types whose available count is ≥ 1, using the same grouped count as `GET /api/categories` (F12-D3) | Grouped count of units |
| Combination | All three can be set | - | Filters are combined with AND | - |

### 3.4 Validation

| Input | Rule | Error |
| --- | --- | --- |
| `search` | Optional; trimmed; 1 to 100 characters | `400 VALIDATION_FAILED`, field `search` ("Must be 1 to 100 characters") |
| `categoryId` | Optional; integer ≥ 1 written in digits | `400`, field `categoryId` |
| `available` | Optional; only `true` | `400`, field `available` |
| Any other query field | Not allowed (strict) | `400`, named field |

### 3.5 Check order

`401` → `400` (query) → `404` (category) → `200`.

### 3.6 Decisions made in this contract

| ID | Decision | Rationale |
| --- | --- | --- |
| F12-D1 | Name search is a case-insensitive substring match; the wildcard characters `%` and `_` are escaped, so "50%" and "Pin_header" match literally | Matches how users type part of a name; escaping prevents a wildcard from matching everything |
| F12-D2 | An unknown `categoryId` gives `404 NOT_FOUND` "Category 99 does not exist." | Same as the other ID inputs (F-09); an empty list would hide a wrong link |
| F12-D3 | `available=true` keeps item types with an available count ≥ 1, computed by the same function as the catalog. When F-10 adds reservations, that function subtracts them and F-12 follows | One definition of "available" (BR-01, DD-08) |
| F12-D4 | Results are ordered by category name, then item type name, then `id` | The catalog's order (F-02 4.1), so a filtered list looks like a shorter catalog |
| F12-D5 | No paging, although SDS 6.1 mentions `?page=` | The seeded catalog has 9 item types; even 500 units are few item types. SR-03 measures NFR-11 on this endpoint and reopens the question if it fails. SDS 6.1 is revised in the same PR (v1.14) |
| F12-D6 | The UI keeps the filters in the URL and debounces the search box by 300 ms | A reload or a shared link shows the same result; fewer calls while typing |
| F12-D8 | Filter values read from the URL are checked by the page first: a value the API would reject (`category=abc`, `category=0`, `available=yes`, a blank `q`) is ignored and its control shows its default ("All categories", unticked, empty); a well-formed category that does not exist (`category=999`) is sent, and the API's `404` is shown as the error with **Clear filters** | A shared or old link never leaves the page stuck; a deleted category is reported, not hidden |
| F12-D7 | Each item in the response has the F04-D6 shape (`id`, `name`, `description`, `isKit`, `maxLoanDays`, `maxQuantityPerRequest`, `availableCount`, `category { id, name }`), the same for both roles | Reuses the type and view of the item type page; no unit data |

## 4. UI specification

### 4.1 Layers changed by F-12

| Layer | Change |
| --- | --- |
| UI | Filter bar and filtered results on the Catalog page |
| API | New `GET /api/item-types` with three optional filters |
| Domain | None |
| Database | No schema change and no migration |

### 4.2 Catalog page (`/catalog`, both roles)

| Element | Behaviour |
| --- | --- |
| Search box | Label "Search item types"; placeholder "Name, for example Arduino"; trimmed before sending; nothing sent while blank |
| Category select | Label "Category"; "All categories" and every category by name |
| Available only | Check box "Available only" |
| URL | `q`, `category`, `available=1`; read on load, so a reload keeps the filters; invalid values as F12-D8 |
| Results | Grouped by category name, in the API order; each row as the Sprint 1 catalog row (name link, Kit badge, "3 available" or "None available", Request for a Borrower) |
| States | While loading "Loading…"; on error the message and "Try again"; empty "No item types match these filters." and **Clear filters**, which resets the three controls and the URL |
| Narrow screens | Below 768 px the three controls stack (SDS 5.3 "Visual style", SR-04) |

## 5. API specification

### 5.1 `GET /api/item-types`

| Aspect | Specification |
| --- | --- |
| Who | Signed in, either role. No session: `401` |
| Query | `search`, `categoryId`, `available` (3.4); strict |
| Success | `200 { "items": [ item type (F12-D7), … ] }` in F12-D4 order; `items` may be empty |
| Errors | `400 VALIDATION_FAILED` naming the field; `404 NOT_FOUND` for an unknown category |

Example: `GET /api/item-types?search=sensor&available=true`

```json
{ "items": [ { "id": 4, "name": "HC-SR04 ultrasonic sensor", "description": "…", "isKit": false, "maxLoanDays": 14, "maxQuantityPerRequest": 4, "availableCount": 5, "category": { "id": 2, "name": "Sensors and modules" } } ] }
```

`GET /api/categories` (F-02) is unchanged.

## 6. Data specification

No schema change and no migration. Reads `item_types`, `categories` and `units` (grouped count). Nothing is written.

## 7. Acceptance criteria

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-142 | `search` returns exactly the item types whose name contains the trimmed text ignoring case; `%` and `_` are matched literally | FR-06, F12-D1 |
| AC-143 | `categoryId` returns only that category's item types; an unknown category gives `404 NOT_FOUND` | FR-06, F12-D2 |
| AC-144 | `available=true` returns only item types with at least one available unit, with the same `availableCount` as `GET /api/categories`; an item type whose units are all `ON_LOAN`, `MAINTENANCE` or `RETIRED` is left out | FR-06, BR-01, F12-D3 |
| AC-145 | Filters combine with AND; no match gives `200` with an empty `items`; with no filter every item type is returned; the order is category name, item type name, `id` | FR-06, F12-D4 |
| AC-146 | A blank or over-100-character `search`, a non-numeric or zero `categoryId`, `available` other than `true`, or an unknown query field gives `400 VALIDATION_FAILED` naming the field; no session gives `401`; both roles get the same `200` result | FR-06, NFR-01, NFR-08 |
| AC-147 | Each returned item has exactly the F04-D6 fields, with no unit IDs or asset tags | FR-06, F12-D7 |
| AC-148 | On the Catalog page, typing a name, choosing a category or ticking "Available only" shows only the matching item types grouped by category, keeps the filters in the URL across a reload, and a Borrower can still request a filtered item type | FR-06, F12-D6 |
| AC-149 | The page shows "Loading…", the error with "Try again", and "No item types match these filters." with **Clear filters**, which resets every control and the URL; the three controls have labels and stack below 768 px; invalid filter values in the URL are handled as F12-D8 | FR-06, NFR-12, SR-04 |

## 8. Software Test Specification (STS)

### 8.1 Conventions

- Data from the existing helpers: categories "Microcontroller boards" (Arduino Uno R3, ESP32 DevKitC), "Sensors and modules" (HC-SR04 ultrasonic sensor), "Component kits" (Transistor kit (2N2222 ×4), a kit), plus item types named "Cable 50% off" and "Pin_header" for F12-D1.
- **TDD**: RED commit with TEST-142 to TEST-149 run on the pre-change code; the API tests fail on `404` (route missing) or assertions, the UI tests on missing controls; no import errors (UI tests render the app with `fetch` stubbed).

### 8.2 Test cases

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-142 **TDD** | AC-142 | API | Data of 8.1, signed in as Borrower | (a) `?search=arduino`; (b) `?search=%20SR04%20`; (c) `?search=50%25`; (d) `?search=_`; (e) `?search=xyz` | (a) [Arduino Uno R3]; (b) [HC-SR04 ultrasonic sensor]; (c) [Cable 50% off] only; (d) [Pin_header] only; (e) `[]` | `server/tests/api/item-types-search.test.ts` |
| TEST-143 **TDD** | AC-143 | API | As TEST-142 | (a) `?categoryId=<Microcontroller boards>`; (b) `?categoryId=999999` | (a) Arduino and ESP32 in name order; (b) `404 NOT_FOUND` "Category 999999 does not exist." | `server/tests/api/item-types-search.test.ts` |
| TEST-144 **TDD** | AC-144 | API | Arduino: 2 `AVAILABLE`, 1 `ON_LOAN`; ESP32: 1 `ON_LOAN`, 1 `MAINTENANCE`, 1 `RETIRED` | (a) `?available=true`; (b) `GET /api/categories` | (a) contains Arduino with `availableCount` 2 and not ESP32; (b) the same counts for every item type | `server/tests/api/item-types-search.test.ts` |
| TEST-145 **TDD** | AC-145 | API | TEST-144 data plus: "Microcontroller boards" gains "Arduino Mega" (1 `ON_LOAN`, 0 available) and "Raspberry Pi Pico" (1 `AVAILABLE`); "Sensors and modules" gains "Arduino sensor shield" (1 `AVAILABLE`) | (a) `?search=arduino&categoryId=<Microcontroller boards>&available=true`; (a1) the same without `search`; (a2) without `categoryId`; (a3) without `available`; (b) no query; (c) `?search=kit&categoryId=<Sensors and modules>` | (a) exactly [Arduino Uno R3]; (a1) [Arduino Uno R3, Raspberry Pi Pico]; (a2) [Arduino Uno R3, Arduino sensor shield]; (a3) [Arduino Mega, Arduino Uno R3]; (b) every item type in F12-D4 order; (c) `200 { items: [] }` | `server/tests/api/item-types-search.test.ts` |
| TEST-146 **TDD** | AC-146 | API | As TEST-142 | (a) `?search=%20%20`; (b) `search` of 101 characters; (c) `?categoryId=abc`; (d) `?categoryId=0`; (e) `?available=false`; (f) `?sort=name`; (g) no session; (h) the same query as Borrower and as Custodian | (a) to (f) `400 VALIDATION_FAILED` naming `search`, `search`, `categoryId`, `categoryId`, `available`, `sort`; (g) `401`; (h) equal bodies | `server/tests/api/item-types-search.test.ts` |
| TEST-147 **TDD** | AC-147 | API | As TEST-142 | No query | Every item's keys are exactly the F04-D6 set | `server/tests/api/item-types-search.test.ts` |
| TEST-148 **TDD** | AC-148 | UI | App rendered at `/catalog` with `fetch` stubbed | (a) type "ard", wait 300 ms; (b) choose a category; (c) tick "Available only"; (d) render at `/catalog?q=ard&available=1`; (e) as Borrower press Request on the filtered Arduino | (a) one call with `search=ard`, only Arduino shown; (b), (c) the query gains `categoryId`, `available=true`; (d) controls prefilled and one call with both filters; (e) the new request form opens with Arduino (F-04) | `client/tests/catalog-search.test.tsx` |
| TEST-149 **TDD** | AC-149 | UI | As TEST-148 | (a) the stub delays; (b) the stub fails, then "Try again"; (c) the stub returns `[]`, then **Clear filters**; (d) render at `/catalog?category=abc&available=yes`; (e) render at `/catalog?category=999` with the stub answering `404` | (a) "Loading…"; (b) the message, then a second call; (c) "No item types match these filters.", then every control reset, URL without query and the unfiltered catalog loaded; (d) controls at "All categories" and unticked, and one call with no filter; (e) "Category 999 does not exist." with **Clear filters** | `client/tests/catalog-search.test.tsx` |

### 8.3 Coverage checks

- Each AC-n has TEST-n; every validation rule of 3.4 is in TEST-146.
- The availability count is compared with the catalog's in the same test (TEST-144), so F-10 cannot change one without the other.
- Regression: the Sprint 1 catalog tests (TEST-08, TEST-17, TEST-40) and E2E journeys still pass; `GET /api/categories` is unchanged.

## 9. Definition of Done (F-12)

- Contract reviewed by Teerakarn Noiruksa and merged into `staging` before any F-12 code.
- RED commit with TEST-142 to TEST-149 only; output kept in `docs/sprints/sprint-3/evidence/F-12/`; GREEN commit; whole suites pass with counts recorded.
- PR into `staging` reviewed; CI green; `features.md` 6.3 and `traceability.md` FR-06 updated with the commits.

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-142 | FR-06 | TEST-142 | `server/tests/api/item-types-search.test.ts` |
| AC-143 | FR-06 | TEST-143 | `server/tests/api/item-types-search.test.ts` |
| AC-144 | FR-06, BR-01 | TEST-144 | `server/tests/api/item-types-search.test.ts` |
| AC-145 | FR-06 | TEST-145 | `server/tests/api/item-types-search.test.ts` |
| AC-146 | FR-06, NFR-01, NFR-08 | TEST-146 | `server/tests/api/item-types-search.test.ts` |
| AC-147 | FR-06 | TEST-147 | `server/tests/api/item-types-search.test.ts` |
| AC-148 | FR-06 | TEST-148 | `client/tests/catalog-search.test.tsx` |
| AC-149 | FR-06, NFR-12, SR-04 | TEST-149 | `client/tests/catalog-search.test.tsx` |
