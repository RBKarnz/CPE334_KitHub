# KitHub: Requirements Traceability

| Field | Value |
| --- | --- |
| Version | 1.1 |
| Date | 2026-11-06 |
| Source requirements | `docs/srs.md` v1.2 |
| Features and AC/TEST definitions | `docs/features.md` v1.1 |
| Feature and SR IDs | Same as `docs/sprints/plan.md` section 3 |
| Authors | Teerakarn Noiruksa (67070501062), Methipat Mansap (67070501071) |

## 1. Coverage summary

Every requirement in the SRS appears exactly once as a row below. All 59 rows have a feature or system responsibility (`docs/features.md` sections 2 and 3) and a sprint; no requirement is uncovered.

| Type | Sprint 1 | Sprint 2 | Sprint 3 | Total |
| --- | --- | --- | --- | --- |
| FR | 8 | 16 | 6 | 30 |
| BR | 7 | 7 | 3 | 17 |
| NFR | 10 | 1 | 1 | 12 |
| Total | 25 | 24 | 10 | 59 |

Sprint 1 rows link to planned AC and tests from `docs/features.md`. Sprint 2 and 3 rows link to the feature whose contract will define their AC and tests before implementation. The Status column moves from Planned → Specified (contract merged) → Verified (test passing on a recorded commit).

## 2. Functional requirements

| Requirement | Summary | Feature | Sprint | AC | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| FR-01 | Sign in with a seeded account | F-01 | 1 | AC-01, AC-02 | TEST-01, TEST-02, TEST-30 | Specified |
| FR-02 | Sign out ends the session | F-01 | 1 | AC-03 | TEST-03 | Specified |
| FR-03 | Show current user and role | F-01 | 1 | AC-01 | TEST-01 | Specified |
| FR-04 | Browse categories and item types with availability | F-02 | 1 | AC-08 | TEST-08 | Planned |
| FR-05 | Item type details | F-04 | 2 | Contract F-04 | - | Planned |
| FR-06 | Search and filter item types | F-12 | 3 | Contract F-12 | - | Planned |
| FR-07 | Borrower requests one unit of one item type | F-02 | 1 | AC-09 | TEST-09, TEST-30 | Planned |
| FR-08 | Borrower lists and opens own requests | F-02 | 1 | AC-13, AC-26 | TEST-13, TEST-26, TEST-30 | Planned |
| FR-09 | Custodian lists pending requests | F-03 | 1 | AC-18, AC-41 | TEST-18, TEST-41 | Specified |
| FR-10 | Multi-line request with one loan length | F-04 | 2 | Contract F-04 | - | Planned |
| FR-11 | Borrower edits a pending request | F-05 | 2 | Contract F-05 | - | Planned |
| FR-12 | Borrower cancels a pending or approved request | F-05 | 2 | Contract F-05 | - | Planned |
| FR-13 | Custodian approves a whole request | F-06 | 2 | Contract F-06 | - | Planned |
| FR-14 | Custodian rejects a request with a reason | F-06 | 2 | Contract F-06 | - | Planned |
| FR-15 | Approved request expires after 48 hours | F-10 | 3 | Contract F-10 | - | Planned |
| FR-16 | Sprint 1 checkout of a pending request; rejected if no unit is available (D-17) | F-03 | 1 | AC-19, AC-20, AC-26, AC-42 to AC-49 | TEST-19, TEST-20, TEST-26, TEST-30, TEST-42 to TEST-49 | Specified |
| FR-17 | Checkout of an approved request, one unit per quantity | F-07 | 2 | Contract F-07 | - | Planned |
| FR-18 | Borrower sees own active loans | F-07 | 2 | Contract F-07 | - | Planned |
| FR-19 | Custodian sees all active loans | F-07 | 2 | Contract F-07 | - | Planned |
| FR-20 | Return all units with condition per unit | F-08 | 2 | Contract F-08 | - | Planned |
| FR-21 | Early return of a single unit | F-08 | 2 | Contract F-08 | - | Planned |
| FR-22 | Overdue status and overdue list | F-11 | 3 | Contract F-11 | - | Planned |
| FR-23 | Manage categories and item types with limits | F-09 | 2 | Contract F-09 | - | Planned |
| FR-24 | Add a unit with a unique asset tag | F-09 | 2 | Contract F-09 | - | Planned |
| FR-25 | Set a repaired unit back to available | F-09 | 2 | Contract F-09 | - | Planned |
| FR-26 | Retire a unit | F-09 | 2 | Contract F-09 | - | Planned |
| FR-27 | History per unit | F-13 | 3 | Contract F-13 | - | Planned |
| FR-28 | History per Borrower | F-13 | 3 | Contract F-13 | - | Planned |
| FR-29 | Inventory summary report | F-14 | 3 | Contract F-14 | - | Planned |
| FR-30 | Custodian lists and filters all requests by state | F-06 | 2 | Contract F-06 | - | Planned |

## 3. Business rules

A rule enforced by several features is listed once, with the sprint that first establishes it and the features that keep enforcing it.

| Requirement | Summary | Feature | Sprint | AC | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| BR-01 | Request only what is available | F-02; kept by F-04, F-05 (Sprint 2) and F-10 reserved units (Sprint 3) | 1 | AC-10 | TEST-10 | Planned |
| BR-02 | Checkout only an `AVAILABLE` unit of the line's item type | F-03; kept by F-07 (Sprint 2) | 1 | AC-20, AC-21, AC-45, AC-46 | TEST-20, TEST-21, TEST-42, TEST-44, TEST-49 | Specified |
| BR-03 | At most one active loan per unit, under concurrency | F-03; kept by F-07 (Sprint 2) | 1 | AC-22 | TEST-22 | Specified |
| BR-04 | No two open requests with the same item type | F-02; kept by F-04, F-05 (Sprint 2) | 1 | AC-11 | TEST-11, TEST-31 | Planned |
| BR-05 | Owner is always the signed-in user; no cross-Borrower access | F-01 (mechanism), F-02; kept by F-13 (Sprint 3) | 1 | AC-09, AC-12, AC-14 | TEST-09, TEST-12, TEST-14 | Planned |
| BR-06 | Borrower never chooses the unit | F-04, F-07 | 2 | Contract F-04, F-07 | - | Planned |
| BR-07 | Quantity between 1 and the item type's maximum | F-04, F-05, F-09 | 2 | Contract F-04 | - | Planned |
| BR-08 | One loan length, capped by the smallest maximum | F-04, F-05, F-07, F-09 | 2 | Contract F-04 | - | Planned |
| BR-09 | Approve or reject as a whole; reason required | F-06 | 2 | Contract F-06 | - | Planned |
| BR-10 | Edit only own pending; cancel only own pending or approved | F-05 | 2 | Contract F-05 | - | Planned |
| BR-11 | Return together; damaged units go to maintenance | F-08; kept by F-07, F-09 | 2 | Contract F-08 | - | Planned |
| BR-12 | No retiring a unit on loan; no checkout of a retired unit | F-09; kept by F-07 | 2 | Contract F-09 | - | Planned |
| BR-13 | Approved requests reserve units and expire after 48 hours | F-10 | 3 | Contract F-10 | - | Planned |
| BR-14 | 5-unit borrowing limit per Borrower | F-11 | 3 | Contract F-11 | - | Planned |
| BR-15 | Overdue Borrowers cannot create requests | F-11 | 3 | Contract F-11 | - | Planned |
| BR-16 | Append-only history with actor and time | F-02, F-03 (cross-cutting rule, `docs/features.md` 3.2); kept by F-05, F-06, F-08, F-09, F-10, F-13 | 1 | AC-16, AC-23, AC-24 | TEST-16, TEST-23, TEST-24 | Planned |
| BR-17 | Only Borrowers create, edit or cancel requests | F-01, F-02; kept by F-04, F-05 (Sprint 2) | 1 | AC-15 | TEST-15 | Planned |

## 4. Non-functional requirements

| Requirement | Summary | Feature or responsibility | Sprint | AC | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| NFR-01 | Unauthenticated requests rejected without data | F-01; F-03 endpoints in AC-41; re-verified by SR-03 | 1 | AC-05, AC-41 | TEST-05, TEST-41 | Specified |
| NFR-02 | Cross-Borrower and cross-role access rejected | F-01, F-02, F-03 (cross-cutting rule); kept by F-06, F-09, F-13; re-verified by SR-03 | 1 | AC-06, AC-14, AC-15 | TEST-06, TEST-14, TEST-15, TEST-32, TEST-41 | Planned |
| NFR-03 | Adaptive salted password hashing | F-01 | 1 | AC-07 | TEST-07 | Specified |
| NFR-04 | Sign-out invalidates the session; 8-hour expiry (Proposed) | F-01 | 1 | AC-03, AC-04 | TEST-03, TEST-04 | Specified |
| NFR-05 | Concurrent checkouts give one active loan | F-03; kept by F-07, F-10 | 1 | AC-22 | TEST-22 | Specified |
| NFR-06 | Data survives restart and redeploy | SR-01 (restart); SR-02 (redeploy, from Lab 5) | 1 | - | TEST-27; redeploy check in Lab 5 | Planned |
| NFR-07 | All settings from environment; no real secret in the repository | SR-01; SR-02 (Secret Manager) | 1 | - | TEST-28 | Planned |
| NFR-08 | Consistent JSON errors, no stack trace | SR-01; re-verified by SR-03 | 1 | - | TEST-29 | Planned |
| NFR-09 | History entry for every state change and request edit | F-02, F-03 (cross-cutting rule); kept by F-05, F-06, F-08, F-10 | 1 | AC-16, AC-23 | TEST-16, TEST-23 | Planned |
| NFR-10 | Request within 3 clicks from the catalog (Proposed) | F-04 | 2 | Contract F-04 | - | Planned |
| NFR-11 | Lists within 2 seconds with 500 units (Proposed) | SR-03; applies to F-12, F-14 | 3 | - | Measured in Sprint 3 if Q-03 confirms | Planned |
| NFR-12 | Loading, empty and error states in every list | F-02, F-03 (cross-cutting rule) | 1 | AC-17, AC-25 | TEST-17, TEST-25 | Planned |

## 5. Uncovered requirements and approved changes

### 5.1 Uncovered requirements

None. Two rows depend on open questions:

- NFR-04 expiry target and NFR-10 depend on Q-01 and Q-02. If the team changes the targets, the rows stay and their AC change.
- NFR-11 is kept only if Q-03 confirms the team can measure it; if not, it is removed through an SRS revision and recorded below.

### 5.2 Approved changes

| Date | Change | Reason | Reference |
| --- | --- | --- | --- |
| 2026-11-06 | Added FR-30, BR-17 and NFR-12; widened BR-16 and NFR-09 to cover request edits | Review of the SRS | PR #10, SRS v1.1 |
| 2026-11-06 | SRS merged, then reverted before its open questions were answered | Q-04 to Q-06 were still open | PR #23 |
| 2026-11-06 | Resolved Q-04, Q-05 and Q-06 as D-15, D-16 and D-17; Sprint 1 due date and rejected checkout added to FR-16 | Team decision | PR #24, SRS v1.2 |
| 2026-11-06 | F-03 contract adds AC-41 to AC-49 and TEST-41 to TEST-49; AC-19, AC-20 and AC-43 gain unit tests TEST-48 (due date) and TEST-49 (transitions); TEST-41 also runs the F-03 cases of AC-06. AC-18 to AC-26 are unchanged. FR-09, FR-16, BR-02, BR-03 and NFR-05 move to Specified | Failure cases in the F-03 design (unknown request or unit, request not pending, invalid body, line of another request, same-request race, unit list, checkout dialog) had no AC | PR #28, F-03 contract v1.0 |
