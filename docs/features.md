# KitHub: Feature Inventory

| Field | Value |
| --- | --- |
| Version | 1.8 |
| Date | 2026-11-07 |
| Source requirements | `docs/srs.md` v1.3 (FR-01 to FR-30, BR-01 to BR-17, NFR-01 to NFR-12) |
| Traceability | `docs/traceability.md` |
| Authors | Teerakarn Noiruksa (67070501062), Methipat Mansap (67070501071) |

## 1. How to read this document

- A **feature** (`F-xx`) is a user-visible slice that is specified in its own engineering contract and built on its own branch.
- A **system responsibility** (`SR-xx`) is work that no single feature owns: the platform, delivery and hardening. It is built once and then kept true by every feature.
- Feature and SR IDs, boundaries, dependencies and sprints are the same as in `docs/sprints/plan.md` section 3. A change to either document must change both in the same PR.
- Sprint 1 features list their planned acceptance criteria (`AC-xx`) and tests (`TEST-xx`). Their contracts (#14, #15, #16) adopt these IDs; any change is recorded in the contract's version history and in section 5 of `docs/traceability.md`.
- Sprint 2 and Sprint 3 features have a sprint allocation now. Their AC and tests are written in their contracts before implementation.
- **ID numbering.** AC-n is verified by TEST-n, and each number is used once across AC and TEST. A number may hold a test with no AC of the same number: the system checks TEST-27 to TEST-32 and TEST-53, and supporting tests such as a unit test of a domain function that serves AC numbered elsewhere. A number never holds an AC whose TEST-n verifies something else. Sprint 1 contracts written in parallel take fixed blocks: F-02 (#15) adds AC and tests from 33 to 40, F-03 (#16) uses 41 to 49 for its AC and 50 to 52 for supporting tests. Every later addition, including an F-02 addition that does not fit its block, takes the next free number above the highest AC or TEST on `staging` and claims it in its PR description.

## 2. Features

| ID | Feature | Description | FR | BR enforced | NFR verified | Depends on | Sprint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | Sign-in, sign-out, current user and roles | Sign in with a seeded account, sign out, show the current user and role; session lifecycle, password hashing and the server-side role check that later features reuse | FR-01, FR-02, FR-03 | BR-05, BR-17 | NFR-01, NFR-02, NFR-03, NFR-04 | SR-01 | 1 |
| F-02 | Browse catalog and borrow request | Browse categories and item types with availability; a Borrower requests one unit of one item type and sees their own requests | FR-04, FR-07, FR-08 | BR-01, BR-04, BR-05, BR-16, BR-17 | NFR-02, NFR-09, NFR-12 | F-01 | 1 |
| F-03 | Checkout and active loan | A Custodian views pending requests and checks out a chosen available unit, creating an active loan | FR-09, FR-16 | BR-02, BR-03, BR-16 | NFR-02, NFR-05, NFR-09, NFR-12 | F-01, F-02 | 1 |
| F-04 | Multi-line requests and item type detail | Item type details with limits and availability; requests with several lines and one loan length, capped by the smallest maximum among their item types | FR-05, FR-10 | BR-01, BR-04, BR-06, BR-07, BR-08, BR-17 | NFR-10 | F-02 | 2 |
| F-05 | Edit and cancel requests | A Borrower edits a pending request and cancels a pending or approved request | FR-11, FR-12 | BR-01, BR-04, BR-07, BR-08, BR-10, BR-16, BR-17 | NFR-09 | F-04 | 2 |
| F-06 | Approve and reject requests; all-requests view | A Custodian lists and filters all requests, and approves or rejects a whole request with a reason | FR-13, FR-14, FR-30 | BR-09, BR-16 | NFR-02, NFR-09 | F-02 | 2 |
| F-07 | Multi-unit checkout and loan lists | Checkout assigns one available unit per quantity to an approved request and replaces F-03's checkout; a Borrower sees their own active loans and a Custodian sees all active loans | FR-17, FR-18, FR-19 | BR-02, BR-03, BR-06, BR-08, BR-11, BR-12 | NFR-05 | F-03, F-04, F-06 | 2 |
| F-08 | Returns: return all and early return | Return all units of a request with a condition per unit, or return one unit early; damaged units go to maintenance | FR-20, FR-21 | BR-11, BR-16 | NFR-09 | F-07 | 2 |
| F-09 | Catalog management | Manage categories, item types and their limits, add units, repair and retire units | FR-23, FR-24, FR-25, FR-26 | BR-07, BR-08, BR-11, BR-12, BR-16 | NFR-02 | F-02 | 2 |
| F-10 | Reservation and expiry of approved requests | Approved requests reserve their quantities and expire 48 hours after approval if not picked up | FR-15 | BR-01 (reserved units), BR-13, BR-16 | NFR-05, NFR-09 | F-06, F-07; Q-07, Q-09 settled | 3 |
| F-11 | Overdue status and borrowing limits | Overdue status and list; 5-unit limit per Borrower; overdue Borrowers cannot request | FR-22 | BR-14, BR-15 | - | F-07, F-08; D-20 | 3 |
| F-12 | Search and filter the catalog | Search item types by name and filter by category and availability | FR-06 | - | NFR-11 | F-02 | 3 |
| F-13 | History per unit and per Borrower | History per unit for Custodians; history per Borrower for the Borrower and for Custodians | FR-27, FR-28 | BR-05, BR-16 | NFR-02 | F-08, F-09 | 3 |
| F-14 | Inventory summary report | Unit counts per state, active loans and overdue requests per item type | FR-29 | - | NFR-11 | F-09, F-11 | 3 |

## 3. System responsibilities and cross-cutting rules

### 3.1 System responsibilities

| ID | Responsibility | Requirements | Issues | Sprint |
| --- | --- | --- | --- | --- |
| SR-01 | Platform foundation: project skeleton, configuration, JSON error handling, health and readiness, migrations and seed (SDS sections 4.8, 6.5, 6.7, 9.1) | NFR-06, NFR-07, NFR-08 | #13 | 1 |
| SR-02 | Delivery: Docker image, CI on PRs, deployment to GCP, persistence across redeploys (SDS sections 9.5 to 9.7) | NFR-06 (redeploy), NFR-07 (Secret Manager) | #1 to #9 (Lab 5) | 2 (by 15 Nov) |
| SR-03 | Hardening: performance measurement, permission and error regression suite, UAT and maintenance defects | NFR-11; re-verifies NFR-01, NFR-02, NFR-08 | Created in Sprint 3 | 3 |
| SR-04 | UI polish: one shared visual style (theme on Bootstrap 5 CSS variables, one self-hosted font, icons, logo) for every Sprint 1 screen at every width from 320 to 1440 px, with the narrow layout (two-row navigation bar, table rows as cards) below 768 px; visual only, no behavior, API or contract text change (SDS 5.3 "Visual style") | None new; keeps NFR-12 and the SDS 5.3 accessibility rules. Regression check for #38: TEST-53 (section 4.4) | #34, #38; TEST-53 in #20 | 1 |

### 3.2 Cross-cutting rules

These rules are established by the Sprint 1 features and then kept by every later feature that touches them. Each later contract lists its own AC for them.

| Rule | Requirements | Established by | Kept by |
| --- | --- | --- | --- |
| Access control: server-side role checks and record ownership | BR-05, NFR-01, NFR-02 | F-01 (mechanism); F-02 and F-03 apply it | Every feature; regression suite in SR-03 |
| Audit history: append-only history of state changes and request edits | BR-16, NFR-09 | F-02 (request creation), F-03 (checkout) | Every feature that changes state or edits a request |
| List states: loading, empty and error states | NFR-12 | F-02 (catalog, my requests), F-03 (pending requests) | Every feature that adds a list |

## 4. Sprint 1 acceptance criteria and planned tests

Test levels: **Unit** (domain logic), **API** (HTTP + database), **Integration** (database behavior, concurrency), **UI** (component), **E2E** (browser through UI, API and database).

### 4.1 F-01 Authentication and session (contract #14)

| AC | Expected outcome | Requirements | Test | Level |
| --- | --- | --- | --- | --- |
| AC-01 | A seeded user signs in with a valid username and password; a session starts and the current-user call returns their display name and role | FR-01, FR-03 | TEST-01 | API |
| AC-02 | Sign-in with an unknown username or a wrong password is rejected with the same generic message, and no session starts | FR-01 | TEST-02 | API |
| AC-03 | After sign-out, a request that reuses the old session is treated as not signed in | FR-02, NFR-04 | TEST-03 | API |
| AC-04 | A new session expires 8 hours after sign-in (D-18), and a request that carries a session whose expiry has passed is rejected as not signed in and returns no data. The test stores a session with its expiry in the past, so no clock control is needed | NFR-04 | TEST-04 | API |
| AC-05 | A protected operation called without a valid session is rejected and returns no private data | NFR-01 | TEST-05 | API |
| AC-06 | A Borrower who calls a Custodian-only operation (record checkout, list the units of an item type) is rejected and nothing changes | NFR-02 | TEST-06 | API |
| AC-07 | Stored passwords are salted hashes from an adaptive algorithm: no value equals its plain text, the value shows the algorithm and cost, and two accounts with the same password have different values | NFR-03 | TEST-07 | Unit |

### 4.2 F-02 Catalog and borrow request (contract #15, `docs/sprints/sprint-1/F-02-request.md`)

| AC | Expected outcome | Requirements | Test | Level |
| --- | --- | --- | --- | --- |
| AC-08 | A signed-in user sees categories, their item types and the available unit count of each | FR-04 | TEST-08 | API |
| AC-09 | A Borrower requests one unit of an item type with available units; the request is stored as `PENDING` and its owner is the signed-in Borrower | FR-07, BR-05 | TEST-09 | API |
| AC-10 | A request for an item type with 0 available units is rejected and nothing is stored | BR-01 | TEST-10 | Unit + API |
| AC-11 | A Borrower with an open request for an item type cannot create a second request for the same item type | BR-04 | TEST-11 | Unit + API |
| AC-12 | A request that names another Borrower as its owner is rejected | BR-05 | TEST-12 | API |
| AC-13 | A Borrower's request list contains only their own requests, each with its lines, state and creation time, and they can open each one to see its details | FR-08 | TEST-13 | API |
| AC-14 | A Borrower who opens another Borrower's request by ID is rejected and receives none of its fields | BR-05, NFR-02 | TEST-14 | API |
| AC-15 | A Custodian who creates a request is rejected and nothing is stored | BR-17, NFR-02 | TEST-15 | API |
| AC-16 | Creating a request writes a history entry with the Borrower as actor and a timestamp | BR-16, NFR-09 | TEST-16 | Integration |
| AC-17 | The catalog and the Borrower's request list show a loading, an empty and an error state | NFR-12 | TEST-17 | UI |
| AC-33 | A call without a valid session to the catalog, request creation, the request list or a request's detail is rejected with `401 UNAUTHENTICATED`, returns no catalog or request data, and nothing is stored | NFR-01 | TEST-33 | API |
| AC-34 | A create body that fails the schema (missing `lines`, zero or two lines, `quantity` other than 1, a non-integer or non-positive `itemTypeId`, an unknown field such as `loanDays`) is rejected with `400 VALIDATION_FAILED` naming each problem in `details`, and nothing is stored | FR-07 | TEST-34 | API |
| AC-35 | A create with an `itemTypeId` that does not exist is rejected with `404 NOT_FOUND` naming `lines[0].itemTypeId`, and nothing is stored | FR-07 | TEST-35 | API |
| AC-36 | BR-04 blocks only the Borrower's own open requests with the same item type: with an open request for item type A, the Borrower can still request item type B; after their request for A is `CHECKED_OUT`, they can request A again; another Borrower's open request for A does not block them | BR-04 | TEST-36 | API |
| AC-37 | Two simultaneous create calls by the same Borrower for the same item type store exactly one request; the other is rejected with `409 DUPLICATE_OPEN_REQUEST` | BR-04 | TEST-37 | Integration |
| AC-38 | When the item type has 0 available units and the Borrower already has an open request for it, the rejection is `409 DUPLICATE_OPEN_REQUEST`; each `409` message names the item type, and the duplicate message also names the open request | BR-01, BR-04 | TEST-38 | Unit + API |
| AC-39 | A Borrower's list holds their own requests in every state, newest first, and `?status=PENDING` narrows it to their own pending requests; a Custodian's list is oldest first; an unknown `status` or query parameter, or a non-integer request ID, gives `400 VALIDATION_FAILED`; a request ID that does not exist gives `404 NOT_FOUND` in the same form as another Borrower's request: the same `code`, only the `error` object, and the message "Request <id> does not exist." with the requested ID | FR-08, BR-05 | TEST-39 | API |
| AC-40 | In the catalog, a Borrower's Request button is disabled with "None available" when the count is 0; pressing an enabled button once sends one request, shows "Request #n submitted" and refreshes the catalog; a `409` is shown as an alert with the API message; a Custodian sees no Request button | FR-07, BR-01, BR-17 | TEST-40 | UI |

AC-33 to AC-40 with TEST-33 to TEST-40 were added by the F-02 contract (`docs/traceability.md` 5.2). Numbers 33 to 40 are the block reserved for F-02 while the Sprint 1 contracts are written in parallel; F-03 uses 41 to 52 (PR #28).

### 4.3 F-03 Checkout and active loan (contract #16, `docs/sprints/sprint-1/F-03-checkout.md`)

| AC | Expected outcome | Requirements | Test | Level |
| --- | --- | --- | --- | --- |
| AC-18 | A Custodian sees every `PENDING` request with its Borrower, line and creation time | FR-09 | TEST-18 | API |
| AC-19 | A Custodian checks out an `AVAILABLE` unit of the requested item type; one `ACTIVE` loan is created with due date = checkout time + the item type's maximum loan length, the unit becomes `ON_LOAN` and the request becomes `CHECKED_OUT` | FR-16 | TEST-19, TEST-50, TEST-51 | API + Unit |
| AC-20 | Checkout is rejected, no loan is created, the request stays `PENDING` and every unit keeps its state in both cases: (a) the chosen unit is not `AVAILABLE`; (b) no unit of the item type is `AVAILABLE` (D-17), so the unit list for the item type has no `AVAILABLE` unit and checkout with any of its units is rejected | FR-16, BR-02 | TEST-20, TEST-51 | API + Unit |
| AC-21 | Checkout with a unit of a different item type is rejected and no loan is created | BR-02 | TEST-21 | API |
| AC-22 | Two simultaneous checkouts of the same unit produce exactly one `ACTIVE` loan; the other checkout is rejected | BR-03, NFR-05 | TEST-22, TEST-52 | Integration + Unit |
| AC-23 | Checkout writes history entries for the request, the unit and the loan, with the Custodian as actor and a timestamp | BR-16, NFR-09 | TEST-23 | Integration |
| AC-24 | The data layer rejects any update or delete of a history entry | BR-16 | TEST-24 | Integration |
| AC-25 | The Custodian's pending request list shows a loading, an empty and an error state | NFR-12 | TEST-25 | UI |
| AC-26 | After checkout, the Borrower sees their request as `CHECKED_OUT` and the item type's available count has dropped by one | FR-08, FR-16 | TEST-26 | API |
| AC-41 | A call without a valid session to the pending list, the unit list or checkout is rejected with `401 UNAUTHENTICATED`, returns no request, unit or loan data, and nothing changes | NFR-01 | TEST-41 | API |
| AC-42 | Checkout of a request ID that does not exist is rejected with `404 NOT_FOUND` and nothing changes | FR-16 | TEST-42 | API |
| AC-43 | Checkout of a request that is not `PENDING` (already `CHECKED_OUT`) is rejected with `409 INVALID_STATE`; the request keeps its state and its one loan, and nothing else changes | FR-16 | TEST-43, TEST-51 | API + Unit |
| AC-44 | A checkout body that fails the schema (unknown field, missing `units`, a non-integer or non-positive ID, zero entries or two entries) is rejected with `400 VALIDATION_FAILED` naming each problem in `details`, and nothing changes | FR-16 | TEST-44 | API |
| AC-45 | Checkout whose `lineId` is a line of another request is rejected with `400 VALIDATION_FAILED` naming `units[0].lineId`; neither request changes and no loan is created | FR-16, BR-02 | TEST-45 | API |
| AC-46 | Checkout with a `unitId` that does not exist is rejected with `404 NOT_FOUND` naming `units[0].unitId`; the request stays `PENDING` and nothing changes | FR-16, BR-02 | TEST-46 | API |
| AC-47 | Two simultaneous checkouts of the same request with two different `AVAILABLE` units produce exactly one loan; the other checkout is rejected with `409 INVALID_STATE` and its unit stays `AVAILABLE` | FR-16 | TEST-47 | Integration |
| AC-48 | A Custodian who lists the units of an item type with `status=AVAILABLE` receives only that item type's `AVAILABLE` units, ordered by asset tag; an unknown item type gives `404 NOT_FOUND` and an invalid `status` gives `400 VALIDATION_FAILED` | FR-16, D-17 | TEST-48 | API |
| AC-49 | In the checkout dialog the Custodian chooses one of the listed `AVAILABLE` units and confirms with a button that names the request and the unit. With no unit available, the dialog says so and sends no checkout. A `409` is shown as an alert with the API message and the unit list is fetched again. On success the dialog shows the asset tag and due date and the request leaves the pending list | FR-16, D-17 | TEST-49 | UI |

AC-41 to AC-49 with TEST-41 to TEST-49, and the supporting tests TEST-50 (unit test of the due-date rule, D-16), TEST-51 (unit test of the F-03 state transitions) and TEST-52 (unit test of the unique-violation conversion), were added by the F-03 contract (`docs/traceability.md` 5.2). The F-03 cases of AC-06 (a Borrower calling the unit list or checkout) are TEST-41 (b), as the F-01 contract (section 8.1) states.

#### 4.3.1 F-03 results (#19)

Automated tests only; the manual checks are in `docs/sprints/sprint-1/manual-test-guide.md` (MT-11 to MT-17). Tested commit `1891aa0` on 2026-11-06: `npm test` in `server/` 160 passed, 0 failed, 0 skipped (26 files, against `kithub_test`); `npm test` in `client/` 39 passed, 0 failed, 0 skipped (5 files). TDD: the server tests failed on `8a03ecd` and the UI tests on `7b19841`, before the implementation commits.

| AC | Planned test | Test file | Test names | Result on `1891aa0` |
| --- | --- | --- | --- | --- |
| AC-18 | TEST-18 | `server/tests/api/pending-requests.test.ts` | "TEST-18: lists every Borrower's PENDING requests oldest first …" | Pass (1 test) |
| AC-19 | TEST-19, TEST-50, TEST-51 | `server/tests/api/checkout.test.ts`, `server/tests/unit/due-date.test.ts`, `server/tests/unit/transitions.test.ts` | "TEST-19: checking out an AVAILABLE unit …", "TEST-19: … maxLoanDays 3 …"; "TEST-50 (a)" to "(e)"; "TEST-51 (a)" | Pass (2 + 8 + 3 tests) |
| AC-20 | TEST-20, TEST-51 | `server/tests/api/checkout.test.ts`, `server/tests/unit/transitions.test.ts` | "TEST-20 (a)", "(b)", "(c)"; "TEST-51 (b)" | Pass (3 + 6 tests) |
| AC-21 | TEST-21 | `server/tests/api/checkout.test.ts` | "TEST-21 (a)", "TEST-21 (b)" | Pass (2 tests) |
| AC-22 | TEST-22, TEST-52 | `server/tests/api/checkout-concurrency.test.ts`, `server/tests/unit/checkout-errors.test.ts` | "TEST-22 (a): two simultaneous checkouts … 5 rounds", "TEST-22 (b)"; "TEST-52 (a)" to "(c)" | Pass (2 + 3 tests) |
| AC-23 | TEST-23 | `server/tests/api/checkout-history.test.ts` | "TEST-23: exactly three entries …" | Pass (1 test) |
| AC-24 | TEST-24 | `server/tests/api/checkout-history.test.ts` | "TEST-24 (a)", "TEST-24 (b)", "TEST-24: patch …", "TEST-24: delete …" | Pass (4 tests) |
| AC-25 | TEST-25 | `client/tests/PendingRequestsPage.test.tsx` | "TEST-25 (a)" to "(d)", "TEST-25: rows keep the API order" | Pass (5 tests) |
| AC-26 | TEST-26 | `server/tests/api/checkout.test.ts` | "TEST-26: Borrower sees CHECKED_OUT …" | Pass (1 test) |
| AC-41 | TEST-41 (a) | `server/tests/api/checkout-access.test.ts` | "TEST-41 (a): … with no cookie …", "… with a signed-out session cookie …" (3 endpoints each) | Pass (6 tests) |
| AC-06 (F-03 cases) | TEST-41 (b) | `server/tests/api/checkout-access.test.ts` | "TEST-41 (b): … as a Borrower is 403 …" (unit list, checkout) | Pass (2 tests) |
| AC-42 | TEST-42 | `server/tests/api/checkout.test.ts` | "TEST-42 (a)", "TEST-42 (b)" | Pass (2 tests) |
| AC-43 | TEST-43, TEST-51 | `server/tests/api/checkout.test.ts`, `server/tests/unit/transitions.test.ts` | "TEST-43: checking out a CHECKED_OUT request again …"; "TEST-51 (b)" | Pass (1 + 6 tests) |
| AC-44 | TEST-44 | `server/tests/api/checkout.test.ts` | "TEST-44 (a)" to "(h)" | Pass (9 tests) |
| AC-45 | TEST-45 | `server/tests/api/checkout.test.ts` | "TEST-45 (a)", "TEST-45 (b)" | Pass (2 tests) |
| AC-46 | TEST-46 | `server/tests/api/checkout.test.ts` | "TEST-46 (a)", "TEST-46 (b)" | Pass (2 tests) |
| AC-47 | TEST-47 | `server/tests/api/checkout-concurrency.test.ts` | "TEST-47: two simultaneous checkouts of one request … 5 rounds" | Pass (1 test) |
| AC-48 | TEST-48 | `server/tests/api/units.test.ts` | "TEST-48 (a)" to "(f)" | Pass (6 tests) |
| AC-49 | TEST-49 | `client/tests/CheckoutDialog.test.tsx` | "TEST-49 (a)" to "(e)" | Pass (6 tests) |

Every test file is at the path planned in contract F-03 section 8.2. Extra UI tests outside the STS also pass: the dialog's `INVALID_STATE`, Cancel/Escape and unit-list error cases (`client/tests/CheckoutDialog.test.tsx`), and the Borrower request detail after checkout (`client/tests/my-requests.test.tsx`, contract F-03 4.4).

### 4.4 System checks for Sprint 1 (#13 skeleton, #20 E2E)

| Test | What it checks | Requirements | Level | Issue |
| --- | --- | --- | --- | --- |
| TEST-27 | A request created before a server restart is still present after it | NFR-06 | Integration | #13 |
| TEST-28 | The server starts from a clean clone with only `.env.example` values filled in; no setting is hard-coded and no real secret is in the repository | NFR-07 | Review + build | #13 |
| TEST-29 | An unknown route and a validation error both return the JSON error shape with a code and message and no stack trace | NFR-08 | API | #13 |
| TEST-30 | E2E journey: Borrower signs in, requests an item, sees it `PENDING`, signs out; Custodian signs in and checks out a unit; Borrower sees `CHECKED_OUT` | AC-01, AC-09, AC-19, AC-26 | E2E | #20 |
| TEST-31 | E2E rejection: a duplicate open request is refused in the UI with the rule's message | AC-11 | E2E | #20 |
| TEST-32 | E2E forbidden: a Borrower cannot reach a Custodian operation, and the API rejects it when called directly | AC-06 | E2E | #20 |
| TEST-53 | E2E narrow screens (SR-04, regression for #38): with 8 pending requests, at 640 and 760 px the page has no sideways scroll, and the first and last **Check out** buttons are fully visible and open the checkout dialog with a mouse click; at 600 px **Sign out** is fully visible | SR-04 (keeps FR-16 and FR-02 usable below 768 px) | E2E | #20 |

TEST-53 takes the next free number above the highest AC or TEST on `staging` (52), as section 1 requires; it was claimed in PR #40.

#### 4.4.1 E2E results (#20)

Tested commit `16fdb7f` on 2026-11-07. `npm run test:e2e` at the repository root (Playwright 1.64.1, Chromium) builds `client/` and `server/`, starts the server with `NODE_ENV=production` on port 3100 so it serves the built UI (DD-01), and points it at `kithub_test` only. The global setup applies migrations and empties every table; each test empties the tables again and creates its own users, catalog and units with the server test factories, never the demo seed (SDS 4.8). Result: 4 passed, 0 failed, 0 skipped, 0 flaky, in each of 3 runs in a row. On the same commit `npm run typecheck:e2e` (`tsc` over `e2e/`, `playwright.config.ts` and the server test helpers they import) reported no errors, `npm test` in `server/` gave 160 passed (26 files) and in `client/` 39 passed (5 files), 0 failed, 0 skipped. TEST-53 fails against the client from before the #38 fix (`91157da`), so it catches that defect (checked on `16fdb7f` with `client/src` from `91157da`: 99 px of page-level sideways scroll at 640 px).

| Test | AC | Test file | Test name | Backend check | Result on `16fdb7f` |
| --- | --- | --- | --- | --- | --- |
| TEST-30 | AC-01, AC-09, AC-19, AC-26 | `e2e/journey.spec.ts` | "TEST-30: Borrower requests, Custodian checks out, Borrower sees Checked out" | After the UI journey, the database holds one `ACTIVE` loan for the request, unit `KH-ARD-0001` is `ON_LOAN`, the request is `CHECKED_OUT`, and the due date is the checkout time + 14 days; the Custodian's success message and the Borrower's detail page show the stored times | Pass (1 test, 3 of 3 runs) |
| TEST-31 | AC-11 | `e2e/rejection.spec.ts` | "TEST-31: a second request for an item type with an open request is refused with the BR-04 message" | The alert reads "You already have an open request for Arduino Uno R3 (Request #n)."; the database still holds exactly one open request for that item type and no other request | Pass (1 test, 3 of 3 runs) |
| TEST-32 | AC-06 | `e2e/forbidden.spec.ts` | "TEST-32: a Borrower sees the Forbidden page at /pending and the API refuses checkout with 403" | From the same signed-in browser context, `POST /api/requests/:id/checkout` and `GET /api/item-types/:id/units` return `403 FORBIDDEN` with only the `error` object; loans, history entries, request and unit states are unchanged | Pass (1 test, 3 of 3 runs) |
| TEST-53 | None (SR-04) | `e2e/narrow-screens.spec.ts` | "TEST-53: Check out is reachable at 640 and 760 px and Sign out is visible at 600 px" | No loan is created by opening and cancelling the dialogs | Pass (1 test, 3 of 3 runs) |

Evidence screenshots for Deliverable 1 Part F, saved by run 1 on `16fdb7f` with `E2E_EVIDENCE_DIR` (README section 6). Each is a full-page screenshot of the screen at that step of the test: no cookie, token or password is visible, and the sign-in fields are empty.

| Part F item | Test | Screenshot |
| --- | --- | --- |
| Sign-in (name and role badge) | TEST-30 | [Catalog as Borrower One](sprints/sprint-1/img/e2e/test-30-1-catalog-as-borrower-one.png) |
| Normal journey | TEST-30 | [My requests shows Pending](sprints/sprint-1/img/e2e/test-30-2-my-requests-shows-pending.png), [checkout dialog](sprints/sprint-1/img/e2e/test-30-4-checkout-dialog.png), [checkout success](sprints/sprint-1/img/e2e/test-30-5-checkout-success.png) |
| Sign-out | TEST-30 | [Signed out](sprints/sprint-1/img/e2e/test-30-3-signed-out.png) |
| Retrieval of the saved result | TEST-30 | [Borrower sees Checked out, the unit and the due date](sprints/sprint-1/img/e2e/test-30-6-borrower-sees-checked-out.png) |
| Business-rule rejection | TEST-31 | [Duplicate request refused](sprints/sprint-1/img/e2e/test-31-duplicate-request-refused.png) |
| Forbidden role operation | TEST-32 | [Forbidden page](sprints/sprint-1/img/e2e/test-32-forbidden-page.png); the API `403` is asserted in the test, not shown on screen |
| Narrow screens (SR-04) | TEST-53 | [640 px dialog](sprints/sprint-1/img/e2e/test-53-640-px-checkout-dialog.png), [760 px dialog](sprints/sprint-1/img/e2e/test-53-760-px-checkout-dialog.png), [600 px navigation bar](sprints/sprint-1/img/e2e/test-53-600-px-navigation-bar.png) |

### 4.5 Sprint 1 results on the release candidate (#21)

This section is the result for the Sprint 1 release. Sections 4.3.1 and 4.4.1 keep the results from when each feature was merged.

**Tested commit:** `b864ecd2b6c744f8ef39e5d4773d6086c27afaf8` on `staging` (after PR #40), 2026-11-07. Every Sprint 1 Issue (#11 to #20, #22, #34, #36, #38) is merged at this commit.

**Environment:** Windows 11, Node.js 22.19.0, npm 11.11.0, PostgreSQL 16 in Docker, Chromium from Playwright 1.64.1. The README names Node.js 24, the version of the Lab 5 Docker image; this run used 22.19.0.

**Commands**, after `npm ci` in the repository root, `server/` and `client/`:

| Command | Result |
| --- | --- |
| `npm run build` in `client/` (`tsc --noEmit && vite build`) | Exit 0 |
| `npm run typecheck` and `npm run build` in `server/` | Exit 0, no errors |
| `npm run typecheck:e2e` | Exit 0, no errors |
| `npm test -- --reporter=default --reporter=json --outputFile.json=<file>` in `server/` (against `kithub_test`) | 26 files; 160 passed, 0 failed, 0 skipped |
| `npm test -- --reporter=default --reporter=json --outputFile.json=<file>` in `client/` | 5 files; 39 passed, 0 failed, 0 skipped |
| `npx playwright test --reporter=list,json` (Chromium, against `kithub_test`) | 4 passed, 0 failed, 0 skipped, 0 flaky |

These are `npm test` and `npm run test:e2e` with a JSON report added; the reporters do not change which tests run. The counts and the table below come from those reports. No test is disabled, skipped or marked as todo.

**Automated results for every Sprint 1 AC.** Test levels are those of sections 4.1 to 4.3. Counts are the test cases in the file that carry the TEST ID.

| AC | Planned test | Test file | Test names | Result on `b864ecd` |
| --- | --- | --- | --- | --- |
| AC-01 | TEST-01; TEST-30 | `server/tests/api/auth.test.ts`; `e2e/journey.spec.ts` | "TEST-01: borrower1 signs in", "TEST-01: custodian1 signs in", "TEST-01: Borrower1 signs in"; "TEST-30" | Pass (3 + 1) |
| AC-02 | TEST-02 | `server/tests/api/auth.test.ts` | "TEST-02: unknown username and wrong password give the same 401 and no session", "… empty password …", "… unknown field …" | Pass (3) |
| AC-03 | TEST-03 | `server/tests/api/auth.test.ts` | "TEST-03 (a): logout without Content-Type is 415 …", "TEST-03 (b, c): logout deletes the session, the old cookie is rejected …" | Pass (2) |
| AC-04 | TEST-04 | `server/tests/api/auth.test.ts` | "TEST-04 (a): a new session expires 8 hours after sign-in", "TEST-04 (b): a session whose expiry has passed is rejected …" | Pass (2) |
| AC-05 | TEST-05 | `server/tests/api/auth.test.ts` | "TEST-05: /api/auth/me with no cookie is 401 …", "… with an unknown token …", "TEST-05: health and sign-in stay reachable without a cookie" | Pass (3) |
| AC-06 | TEST-06; TEST-41 (b); TEST-32 | `server/tests/api/auth.test.ts`; `server/tests/api/checkout-access.test.ts`; `e2e/forbidden.spec.ts` | "TEST-06: a Borrower gets 403 and nothing is written; a Custodian passes"; "TEST-41 (b)" (unit list, checkout); "TEST-32" | Pass (1 + 2 + 1) |
| AC-07 | TEST-07 | `server/tests/unit/password.test.ts` | "TEST-07 (a): cost 12 hashes differ from the plain text and from each other", "TEST-07 (b): the default cost is 12 …" | Pass (2) |
| AC-08 | TEST-08 | `server/tests/api/catalog.test.ts` | "TEST-08: both roles get categories and item types … with AVAILABLE counts and no unit data", "TEST-08: any query parameter is rejected …" | Pass (2) |
| AC-09 | TEST-09; TEST-30 | `server/tests/api/requests-create.test.ts`; `e2e/journey.spec.ts` | "TEST-09: 201 PENDING, owned by the signed-in Borrower, units unchanged"; "TEST-30" | Pass (1 + 1) |
| AC-10 | TEST-10 | `server/tests/api/requests-create.test.ts`, `server/tests/unit/request-rules.test.ts` | "TEST-10: 409 ITEM_TYPE_UNAVAILABLE and nothing stored", "TEST-10 (unit)" | Pass (2) |
| AC-11 | TEST-11; TEST-31 | `server/tests/api/requests-create.test.ts`, `server/tests/unit/request-rules.test.ts`; `e2e/rejection.spec.ts` | "TEST-11: an existing PENDING request …", "… APPROVED request …", "TEST-11 (unit)"; "TEST-31" | Pass (3 + 1) |
| AC-12 | TEST-12 | `server/tests/api/requests-create.test.ts` | "TEST-12: a body with borrowerId is 400 …", "… with role …" | Pass (2) |
| AC-13 | TEST-13 | `server/tests/api/requests-read.test.ts` | "TEST-13: the list has only their requests, and each detail matches its list entry" | Pass (1) |
| AC-14 | TEST-14 | `server/tests/api/requests-access.test.ts` | "TEST-14: 404 with only the error object and none of the request's fields" | Pass (1) |
| AC-15 | TEST-15 | `server/tests/api/requests-access.test.ts` | "TEST-15: 403 FORBIDDEN and nothing stored" | Pass (1) |
| AC-16 | TEST-16 | `server/tests/api/requests-history.test.ts` | "TEST-16: exactly one CREATED entry with the Borrower as actor …" | Pass (1) |
| AC-17 | TEST-17 | `client/tests/catalog.test.tsx`, `client/tests/my-requests.test.tsx` | "TEST-17: shows Loading… …", "… empty …", "… an error shows the API message, and Try again …" (catalog and My requests) | Pass (6) |
| AC-18 | TEST-18 | `server/tests/api/pending-requests.test.ts` | "TEST-18: lists every Borrower's PENDING requests oldest first …" | Pass (1) |
| AC-19 | TEST-19, TEST-50, TEST-51 (a); TEST-30 | `server/tests/api/checkout.test.ts`, `server/tests/unit/due-date.test.ts`, `server/tests/unit/transitions.test.ts`; `e2e/journey.spec.ts` | "TEST-19" (14-day and 3-day due dates); "TEST-50 (a)" to "(e)"; "TEST-51 (a)"; "TEST-30" | Pass (2 + 8 + 3 + 1) |
| AC-20 | TEST-20, TEST-51 (b) | `server/tests/api/checkout.test.ts`, `server/tests/unit/transitions.test.ts` | "TEST-20 (a)", "(b)", "(c)"; "TEST-51 (b)" | Pass (3 + 6) |
| AC-21 | TEST-21 | `server/tests/api/checkout.test.ts` | "TEST-21 (a)", "TEST-21 (b)" | Pass (2) |
| AC-22 | TEST-22, TEST-52 | `server/tests/api/checkout-concurrency.test.ts`, `server/tests/unit/checkout-errors.test.ts` | "TEST-22 (a)" (5 rounds), "TEST-22 (b)"; "TEST-52 (a)" to "(c)" | Pass (2 + 3) |
| AC-23 | TEST-23 | `server/tests/api/checkout-history.test.ts` | "TEST-23: exactly three entries …" | Pass (1) |
| AC-24 | TEST-24 | `server/tests/api/checkout-history.test.ts` | "TEST-24 (a)", "(b)", "TEST-24: patch …", "TEST-24: delete …" | Pass (4) |
| AC-25 | TEST-25 | `client/tests/PendingRequestsPage.test.tsx` | "TEST-25 (a)" to "(d)", "TEST-25: rows keep the API order" | Pass (5) |
| AC-26 | TEST-26; TEST-30 | `server/tests/api/checkout.test.ts`; `e2e/journey.spec.ts` | "TEST-26: Borrower sees CHECKED_OUT …"; "TEST-30" | Pass (1 + 1) |
| AC-33 | TEST-33 | `server/tests/api/requests-access.test.ts` | "TEST-33: no cookie gives 401 on every endpoint", "TEST-33: a signed-out session gives 401 on every endpoint" | Pass (2) |
| AC-34 | TEST-34 | `server/tests/api/requests-create.test.ts` | "TEST-34: no lines …", "empty lines", "two lines", "quantity 2", "itemTypeId 0", "string itemTypeId", "extra loanDays", "unknown field in a line" | Pass (8) |
| AC-35 | TEST-35 | `server/tests/api/requests-create.test.ts` | "TEST-35: 404 NOT_FOUND naming lines[0].itemTypeId" | Pass (1) |
| AC-36 | TEST-36 | `server/tests/api/requests-create.test.ts` | "TEST-36: other item types, closed requests and other Borrowers do not block; the same item type does" | Pass (1) |
| AC-37 | TEST-37 | `server/tests/api/requests-concurrency.test.ts` | "TEST-37: two parallel creates store one request, 20 runs" | Pass (1) |
| AC-38 | TEST-38 | `server/tests/api/requests-create.test.ts`, `server/tests/unit/request-rules.test.ts` | "TEST-38: open request and 0 available gives 409 DUPLICATE_OPEN_REQUEST …", "TEST-38 (unit)" | Pass (2) |
| AC-39 | TEST-39 | `server/tests/api/requests-read.test.ts` | "TEST-39: Borrower lists are newest first …", "… does not exist is 404 …", and three `400` cases | Pass (5) |
| AC-40 | TEST-40 | `client/tests/catalog.test.tsx` | "TEST-40: a 0-available item type has a disabled button …", "… a double press sends one request …", "… a 409 shows the API message …", "… a Custodian sees the catalog without Request buttons" | Pass (4) |
| AC-41 | TEST-41 (a) | `server/tests/api/checkout-access.test.ts` | "TEST-41 (a)": no cookie and signed-out cookie, 3 endpoints each | Pass (6) |
| AC-42 | TEST-42 | `server/tests/api/checkout.test.ts` | "TEST-42 (a)", "TEST-42 (b)" | Pass (2) |
| AC-43 | TEST-43, TEST-51 (b) | `server/tests/api/checkout.test.ts`, `server/tests/unit/transitions.test.ts` | "TEST-43: checking out a CHECKED_OUT request again …"; "TEST-51 (b)" | Pass (1 + 6) |
| AC-44 | TEST-44 | `server/tests/api/checkout.test.ts` | "TEST-44 (a)" to "(h)" | Pass (9) |
| AC-45 | TEST-45 | `server/tests/api/checkout.test.ts` | "TEST-45 (a)", "TEST-45 (b)" | Pass (2) |
| AC-46 | TEST-46 | `server/tests/api/checkout.test.ts` | "TEST-46 (a)", "TEST-46 (b)" | Pass (2) |
| AC-47 | TEST-47 | `server/tests/api/checkout-concurrency.test.ts` | "TEST-47: two simultaneous checkouts of one request …" (5 rounds) | Pass (1) |
| AC-48 | TEST-48 | `server/tests/api/units.test.ts` | "TEST-48 (a)" to "(f)" | Pass (6) |
| AC-49 | TEST-49 | `client/tests/CheckoutDialog.test.tsx` | "TEST-49 (a)" to "(e)" | Pass (6) |

All 43 Sprint 1 AC pass. TEST-51 (a) and (b) are listed under every AC they serve, so the counts in a column do not add up to the suite totals.

**System checks without an AC of their own:**

| Test | Requirement | Test file | Result on `b864ecd` |
| --- | --- | --- | --- |
| TEST-27 | NFR-06 | `server/tests/api/persistence.test.ts` | Pass (1). NFR-06 stays Planned until the Lab 5 redeploy check (`docs/traceability.md`) |
| TEST-28 | NFR-07 | `server/tests/unit/config.test.ts` | Pass (5) |
| TEST-29 | NFR-08 | `server/tests/api/errors.test.ts` | Pass (5) |
| TEST-53 | SR-04 | `e2e/narrow-screens.spec.ts` | Pass (1) |

Another 50 server and client tests carry no TEST ID: health and readiness, the migration's constraints, the seed, the error handler and validation middleware, the test-database guard, the F-01 sign-in screens, and extra cases for the checkout dialog and the request detail. All of them pass. The manual checks MT-01 to MT-17 in `docs/sprints/sprint-1/manual-test-guide.md` are manual and are not counted here.
