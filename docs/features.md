# KitHub: Feature Inventory

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Date | 2026-11-06 |
| Source requirements | `docs/srs.md` v1.2 (FR-01 to FR-30, BR-01 to BR-17, NFR-01 to NFR-12) |
| Traceability | `docs/traceability.md` |
| Authors | Teerakarn Noiruksa (67070501062), Methipat Mansap (67070501071) |

## 1. How to read this document

- A **feature** (`F-xx`) is a user-visible slice that is specified in its own engineering contract and built on its own branch.
- A **system responsibility** (`SR-xx`) is work that no single feature owns: the platform, delivery and hardening. It is built once and then kept true by every feature.
- Feature and SR IDs, boundaries, dependencies and sprints are the same as in `docs/sprints/plan.md` section 3. A change to either document must change both in the same PR.
- Sprint 1 features list their planned acceptance criteria (`AC-xx`) and tests (`TEST-xx`). Their contracts (#14, #15, #16) adopt these IDs; any change is recorded in the contract's version history and in section 5 of `docs/traceability.md`.
- Sprint 2 and Sprint 3 features have a sprint allocation now. Their AC and tests are written in their contracts before implementation.

## 2. Features

| ID | Feature | Description | FR | BR enforced | NFR verified | Depends on | Sprint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | Sign-in, sign-out, current user and roles | Sign in with a seeded account, sign out, show the current user and role; session lifecycle, password hashing and the server-side role check that later features reuse | FR-01, FR-02, FR-03 | BR-05, BR-17 | NFR-01, NFR-02, NFR-03, NFR-04 | SR-01 | 1 |
| F-02 | Browse catalog and borrow request | Browse categories and item types with availability; a Borrower requests one unit of one item type and sees their own requests | FR-04, FR-07, FR-08 | BR-01, BR-04, BR-05, BR-16, BR-17 | NFR-02, NFR-09, NFR-12 | F-01 | 1 |
| F-03 | Checkout and active loan | A Custodian views pending requests and checks out a chosen available unit, creating an active loan | FR-09, FR-16 | BR-02, BR-03, BR-16 | NFR-02, NFR-05, NFR-09 | F-01, F-02 | 1 |
| F-04 | Multi-line requests and item type detail | Item type details with limits and availability; requests with several lines and one loan length, capped by the smallest maximum among their item types | FR-05, FR-10 | BR-01, BR-04, BR-06, BR-07, BR-08, BR-17 | NFR-10 | F-02 | 2 |
| F-05 | Edit and cancel requests | A Borrower edits a pending request and cancels a pending or approved request | FR-11, FR-12 | BR-01, BR-04, BR-07, BR-08, BR-10, BR-16, BR-17 | NFR-09 | F-04 | 2 |
| F-06 | Approve and reject requests; all-requests view | A Custodian lists and filters all requests, and approves or rejects a whole request with a reason | FR-13, FR-14, FR-30 | BR-09, BR-16 | NFR-02, NFR-09 | F-02 | 2 |
| F-07 | Multi-unit checkout and loan lists | Checkout assigns one available unit per quantity to an approved request and replaces F-03's checkout; a Borrower sees their own active loans and a Custodian sees all active loans | FR-17, FR-18, FR-19 | BR-02, BR-03, BR-06, BR-08, BR-11, BR-12 | NFR-05 | F-03, F-04, F-06 | 2 |
| F-08 | Returns: return all and early return | Return all units of a request with a condition per unit, or return one unit early; damaged units go to maintenance | FR-20, FR-21 | BR-11, BR-16 | NFR-09 | F-07 | 2 |
| F-09 | Catalog management | Manage categories, item types and their limits, add units, repair and retire units | FR-23, FR-24, FR-25, FR-26 | BR-07, BR-08, BR-11, BR-12, BR-16 | NFR-02 | F-02 | 2 |
| F-10 | Reservation and expiry of approved requests | Approved requests reserve their quantities and expire 48 hours after approval if not picked up | FR-15 | BR-01 (reserved units), BR-13, BR-16 | NFR-05, NFR-09 | F-06, F-07; Q-07, Q-09 settled | 3 |
| F-11 | Overdue status and borrowing limits | Overdue status and list; 5-unit limit per Borrower; overdue Borrowers cannot request | FR-22 | BR-14, BR-15 | - | F-07, F-08; Q-08 settled | 3 |
| F-12 | Search and filter the catalog | Search item types by name and filter by category and availability | FR-06 | - | NFR-11 | F-02 | 3 |
| F-13 | History per unit and per Borrower | History per unit for Custodians; history per Borrower for the Borrower and for Custodians | FR-27, FR-28 | BR-05, BR-16 | NFR-02 | F-08, F-09 | 3 |
| F-14 | Inventory summary report | Unit counts per state, active loans and overdue requests per item type | FR-29 | - | NFR-11 | F-09, F-11 | 3 |

## 3. System responsibilities and cross-cutting rules

### 3.1 System responsibilities

| ID | Responsibility | Requirements | Issues | Sprint |
| --- | --- | --- | --- | --- |
| SR-01 | Platform foundation: project skeleton, configuration, JSON error handling, health and readiness, migrations and seed | NFR-06, NFR-07, NFR-08 | #13 | 1 |
| SR-02 | Delivery: Docker image, CI on PRs, deployment to GCP, persistence across redeploys | NFR-06 (redeploy), NFR-07 (Secret Manager) | #1 to #9 (Lab 5) | 2 (by 15 Nov) |
| SR-03 | Hardening: performance measurement, permission and error regression suite, UAT and maintenance defects | NFR-11; re-verifies NFR-01, NFR-02, NFR-08 | Created in Sprint 3 | 3 |

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
| AC-04 | A new session expires 8 hours after sign-in (Proposed, Q-01), and a request that carries a session whose expiry has passed is rejected as not signed in and returns no data. The test stores a session with its expiry in the past, so no clock control is needed | NFR-04 | TEST-04 | API |
| AC-05 | A protected operation called without a valid session is rejected and returns no private data | NFR-01 | TEST-05 | API |
| AC-06 | A Borrower who calls a Custodian-only operation (record checkout, list the units of an item type) is rejected and nothing changes | NFR-02 | TEST-06 | API |
| AC-07 | Stored passwords are salted hashes from an adaptive algorithm: no value equals its plain text, the value shows the algorithm and cost, and two accounts with the same password have different values | NFR-03 | TEST-07 | Unit |

### 4.2 F-02 Catalog and borrow request (contract #15)

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

### 4.3 F-03 Checkout and active loan (contract #16)

| AC | Expected outcome | Requirements | Test | Level |
| --- | --- | --- | --- | --- |
| AC-18 | A Custodian sees every `PENDING` request with its Borrower, line and creation time | FR-09 | TEST-18 | API |
| AC-19 | A Custodian checks out an `AVAILABLE` unit of the requested item type; one `ACTIVE` loan is created with due date = checkout time + the item type's maximum loan length, the unit becomes `ON_LOAN` and the request becomes `CHECKED_OUT` | FR-16 | TEST-19 | API |
| AC-20 | Checkout is rejected, no loan is created, the request stays `PENDING` and every unit keeps its state in both cases: (a) the chosen unit is not `AVAILABLE`; (b) no unit of the item type is `AVAILABLE` (D-17), so the unit list for the item type has no `AVAILABLE` unit and checkout with any of its units is rejected | FR-16, BR-02 | TEST-20 | API |
| AC-21 | Checkout with a unit of a different item type is rejected and no loan is created | BR-02 | TEST-21 | API |
| AC-22 | Two simultaneous checkouts of the same unit produce exactly one `ACTIVE` loan; the other checkout is rejected | BR-03, NFR-05 | TEST-22 | Integration |
| AC-23 | Checkout writes history entries for the request, the unit and the loan, with the Custodian as actor and a timestamp | BR-16, NFR-09 | TEST-23 | Integration |
| AC-24 | The data layer rejects any update or delete of a history entry | BR-16 | TEST-24 | Integration |
| AC-25 | The Custodian's pending request list shows a loading, an empty and an error state | NFR-12 | TEST-25 | UI |
| AC-26 | After checkout, the Borrower sees their request as `CHECKED_OUT` and the item type's available count has dropped by one | FR-08, FR-16 | TEST-26 | API |

### 4.4 System checks for Sprint 1 (#13 skeleton, #20 E2E)

| Test | What it checks | Requirements | Level | Issue |
| --- | --- | --- | --- | --- |
| TEST-27 | A request created before a server restart is still present after it | NFR-06 | Integration | #13 |
| TEST-28 | The server starts from a clean clone with only `.env.example` values filled in; no setting is hard-coded and no real secret is in the repository | NFR-07 | Review + build | #13 |
| TEST-29 | An unknown route and a validation error both return the JSON error shape with a code and message and no stack trace | NFR-08 | API | #13 |
| TEST-30 | E2E journey: Borrower signs in, requests an item, sees it `PENDING`, signs out; Custodian signs in and checks out a unit; Borrower sees `CHECKED_OUT` | AC-01, AC-09, AC-19, AC-26 | E2E | #20 |
| TEST-31 | E2E rejection: a duplicate open request is refused in the UI with the rule's message | AC-11 | E2E | #20 |
| TEST-32 | E2E forbidden: a Borrower cannot reach a Custodian operation, and the API rejects it when called directly | AC-06 | E2E | #20 |
