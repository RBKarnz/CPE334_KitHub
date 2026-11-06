# KitHub: Requirements Traceability

| Field | Value |
| --- | --- |
| Version | 1.8 |
| Date | 2026-11-07 |
| Source requirements | `docs/srs.md` v1.3 |
| Features and AC/TEST definitions | `docs/features.md` v1.6 |
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

Sprint 1 rows link to planned AC and tests from `docs/features.md`. Sprint 2 and 3 rows link to the feature whose contract will define their AC and tests before implementation. The Status column moves from Planned → Specified (contract merged) → Verified (test passing on a recorded commit). A row whose tests come from several features stays Specified until all of them pass, with a note on the part already verified.

## 2. Functional requirements

| Requirement | Summary | Feature | Sprint | AC | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| FR-01 | Sign in with a seeded account | F-01 | 1 | AC-01, AC-02 | TEST-01, TEST-02, TEST-30 | Specified; F-01 part (TEST-01, TEST-02) verified on `7828473`, TEST-30 (E2E, #20) to come |
| FR-02 | Sign out ends the session | F-01 | 1 | AC-03 | TEST-03 | Verified (`7828473`) |
| FR-03 | Show current user and role | F-01 | 1 | AC-01 | TEST-01 | Verified (`7828473`) |
| FR-04 | Browse categories and item types with availability | F-02 | 1 | AC-08 | TEST-08 | Verified (`dd36f2e`) |
| FR-05 | Item type details | F-04 | 2 | Contract F-04 | - | Planned |
| FR-06 | Search and filter item types | F-12 | 3 | Contract F-12 | - | Planned |
| FR-07 | Borrower requests one unit of one item type | F-02 | 1 | AC-09, AC-34, AC-35, AC-40 | TEST-09, TEST-30, TEST-34, TEST-35, TEST-40 | Specified; F-02 part (TEST-09, TEST-34, TEST-35, TEST-40) verified on `dd36f2e`, TEST-30 (E2E, #20) to come |
| FR-08 | Borrower lists and opens own requests | F-02 | 1 | AC-13, AC-26, AC-39 | TEST-13, TEST-26, TEST-30, TEST-39 | Specified; F-02 part (TEST-13, TEST-39) verified on `dd36f2e`, F-03 part (TEST-26) on `1891aa0`, TEST-30 (E2E, #20) to come |
| FR-09 | Custodian lists pending requests | F-03 | 1 | AC-18 | TEST-18 | Verified (`1891aa0`) |
| FR-10 | Multi-line request with one loan length | F-04 | 2 | Contract F-04 | - | Planned |
| FR-11 | Borrower edits a pending request | F-05 | 2 | Contract F-05 | - | Planned |
| FR-12 | Borrower cancels a pending or approved request | F-05 | 2 | Contract F-05 | - | Planned |
| FR-13 | Custodian approves a whole request | F-06 | 2 | Contract F-06 | - | Planned |
| FR-14 | Custodian rejects a request with a reason | F-06 | 2 | Contract F-06 | - | Planned |
| FR-15 | Approved request expires after 48 hours | F-10 | 3 | Contract F-10 | - | Planned |
| FR-16 | Sprint 1 checkout of a pending request; rejected if no unit is available (D-17) | F-03 | 1 | AC-19, AC-20, AC-26, AC-42 to AC-49 | TEST-19, TEST-20, TEST-26, TEST-30, TEST-42 to TEST-51 | Specified; F-03 part (TEST-19, TEST-20, TEST-26, TEST-42 to TEST-51) verified on `1891aa0`, TEST-30 (E2E, #20) to come |
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
| BR-01 | Request only what is available | F-02; kept by F-04, F-05 (Sprint 2) and F-10 reserved units (Sprint 3) | 1 | AC-10, AC-38, AC-40 | TEST-10, TEST-38, TEST-40 | Verified (`dd36f2e`) |
| BR-02 | Checkout only an `AVAILABLE` unit of the line's item type | F-03; kept by F-07 (Sprint 2) | 1 | AC-20, AC-21, AC-45, AC-46 | TEST-20, TEST-21, TEST-45, TEST-46, TEST-51 | Verified (`1891aa0`) |
| BR-03 | At most one active loan per unit, under concurrency | F-03; kept by F-07 (Sprint 2) | 1 | AC-22 | TEST-22, TEST-52 | Verified (`1891aa0`) |
| BR-04 | No two open requests with the same item type | F-02; kept by F-04, F-05 (Sprint 2) | 1 | AC-11, AC-36, AC-37, AC-38 | TEST-11, TEST-31, TEST-36, TEST-37, TEST-38 | Specified; F-02 part (TEST-11, TEST-36, TEST-37, TEST-38) verified on `dd36f2e`, TEST-31 (E2E, #20) to come |
| BR-05 | Owner is always the signed-in user; no cross-Borrower access | F-01 (mechanism), F-02; kept by F-13 (Sprint 3) | 1 | AC-09, AC-12, AC-14, AC-39 | TEST-09, TEST-12, TEST-14, TEST-39 | Verified (`dd36f2e`) |
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
| BR-16 | Append-only history with actor and time | F-02, F-03 (cross-cutting rule, `docs/features.md` 3.2); kept by F-05, F-06, F-08, F-09, F-10, F-13 | 1 | AC-16, AC-23, AC-24 | TEST-16, TEST-23, TEST-24 | Verified (TEST-16 on `dd36f2e`, TEST-23 and TEST-24 on `1891aa0`) |
| BR-17 | Only Borrowers create, edit or cancel requests | F-01, F-02; kept by F-04, F-05 (Sprint 2) | 1 | AC-15, AC-40 | TEST-15, TEST-40 | Verified (`dd36f2e`) |

## 4. Non-functional requirements

| Requirement | Summary | Feature or responsibility | Sprint | AC | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| NFR-01 | Unauthenticated requests rejected without data | F-01; F-02 endpoints in AC-33; F-03 endpoints in AC-41; re-verified by SR-03 | 1 | AC-05, AC-33, AC-41 | TEST-05, TEST-33, TEST-41 | Verified (TEST-05 on `7828473`, TEST-33 on `dd36f2e`, TEST-41 on `1891aa0`) |
| NFR-02 | Cross-Borrower and cross-role access rejected | F-01, F-02, F-03 (cross-cutting rule); kept by F-06, F-09, F-13; re-verified by SR-03 | 1 | AC-06, AC-14, AC-15 | TEST-06, TEST-14, TEST-15, TEST-32, TEST-41 | Specified; F-01 part (TEST-06) verified on `7828473`, F-02 part (TEST-14, TEST-15) on `dd36f2e`, F-03 part (TEST-41) on `1891aa0`, TEST-32 (E2E, #20) to come |
| NFR-03 | Adaptive salted password hashing | F-01 | 1 | AC-07 | TEST-07 | Verified (`7828473`) |
| NFR-04 | Sign-out invalidates the session; 8-hour expiry (D-18) | F-01 | 1 | AC-03, AC-04 | TEST-03, TEST-04 | Verified (`7828473`) |
| NFR-05 | Concurrent checkouts give one active loan | F-03; kept by F-07, F-10 | 1 | AC-22 | TEST-22, TEST-52 | Verified (`1891aa0`) |
| NFR-06 | Data survives restart and redeploy | SR-01 (restart); SR-02 (redeploy, from Lab 5) | 1 | - | TEST-27; redeploy check in Lab 5 | Planned (restart half: TEST-27 passes on `ef7cd71`, PR #29; redeploy check pending) |
| NFR-07 | All settings from environment; no real secret in the repository | SR-01; SR-02 (Secret Manager) | 1 | - | TEST-28; manual clean-clone check | Verified (`ef7cd71`, PR #29) |
| NFR-08 | Consistent JSON errors, no stack trace | SR-01; re-verified by SR-03 | 1 | - | TEST-29 | Verified (`ef7cd71`, PR #29) |
| NFR-09 | History entry for every state change and request edit | F-02, F-03 (cross-cutting rule); kept by F-05, F-06, F-08, F-10 | 1 | AC-16, AC-23 | TEST-16, TEST-23 | Verified (TEST-16 on `dd36f2e`, TEST-23 on `1891aa0`) |
| NFR-10 | Request within 3 clicks from the catalog (D-19) | F-04 | 2 | Contract F-04 | - | Planned |
| NFR-11 | Lists within 2 seconds with 500 units (Proposed) | SR-03; applies to F-12, F-14 | 3 | - | Measured in Sprint 3 if Q-03 confirms | Planned |
| NFR-12 | Loading, empty and error states in every list | F-02, F-03 (cross-cutting rule) | 1 | AC-17, AC-25 | TEST-17, TEST-25 | Verified (TEST-17 on `dd36f2e`, TEST-25 on `1891aa0`) |

## 5. Uncovered requirements and approved changes

### 5.1 Uncovered requirements

None. Notes on three rows:

- NFR-04 expiry target and NFR-10 follow decisions D-18 and D-19 (Q-01 and Q-02 resolved). If the team changes the targets, the rows stay and their AC change.
- NFR-11 is kept only if Q-03 confirms the team can measure it; if not, it is removed through an SRS revision and recorded below.

### 5.2 Approved changes

| Date | Change | Reason | Reference |
| --- | --- | --- | --- |
| 2026-11-06 | Added FR-30, BR-17 and NFR-12; widened BR-16 and NFR-09 to cover request edits | Review of the SRS | PR #10, SRS v1.1 |
| 2026-11-06 | SRS merged, then reverted before its open questions were answered | Q-04 to Q-06 were still open | PR #23 |
| 2026-11-06 | Resolved Q-04, Q-05 and Q-06 as D-15, D-16 and D-17; Sprint 1 due date and rejected checkout added to FR-16 | Team decision | PR #24, SRS v1.2 |
| 2026-11-06 | F-03 contract adds AC-41 to AC-49 with TEST-41 to TEST-49 (TEST-n verifies AC-n), and supporting unit tests TEST-50 (due date, AC-19), TEST-51 (transitions, AC-19, AC-20, AC-43) and TEST-52 (unique-violation conversion, AC-22). TEST-41 (b) runs the F-03 cases of AC-06, as the F-01 contract states. AC-18 to AC-26 are unchanged. FR-09, FR-16, BR-02, BR-03 and NFR-05 move to Specified. `docs/features.md` section 1 gains the ID numbering rule, with blocks 33 to 40 for F-02 and 41 to 52 for F-03 | Failure cases in the F-03 design (unknown request or unit, request not pending, invalid body, line of another request, same-request race, unit list, checkout dialog) had no AC; numbering clarified in the PR #28 review | PR #28, F-03 contract v1.1 |
| 2026-11-06 | F-02 contract adds AC-33 to AC-40 with TEST-33 to TEST-40 (TEST-n verifies AC-n), in the block 33 to 40 reserved for F-02. AC-08 to AC-17 are unchanged. FR-04, FR-07, BR-01, BR-04, BR-05 and BR-17 move to Specified. With the F-03 contract (PR #28) already merged, the rows that F-02 and F-03 share also move to Specified: FR-08, BR-16, NFR-02, NFR-09 and NFR-12. NFR-01 gains AC-33 | Failure and boundary cases in the F-02 design (no session, invalid body, unknown item type, BR-04 limits and race, rule order, list and detail inputs, catalog request action) had no AC | PR #30, F-02 contract v1.1 |
| 2026-11-06 | FR-02, FR-03, NFR-03 and NFR-04 move to Verified: all their tests (TEST-01, TEST-03, TEST-04, TEST-07) pass on `7828473`. FR-01, NFR-01 and NFR-02 stay Specified, with the F-01 part noted, because they also depend on tests from #19 and #20 | F-01 implemented (#17); contract F-01 section 9, DoD item 6 | PR #31 |
| 2026-11-06 | FR-04, BR-01, BR-05 and BR-17 move to Verified: all their tests pass on `dd36f2e`. FR-07, FR-08, BR-04, BR-16, NFR-01, NFR-02, NFR-09 and NFR-12 stay Specified, with the F-02 part noted, because they also depend on tests from #19 and #20 | F-02 implemented (#18) | PR #32 |
| 2026-11-06 | FR-09, BR-02, BR-03, BR-16, NFR-01, NFR-05, NFR-09 and NFR-12 move to Verified: all their tests pass on `1891aa0` (server 160 passed, client 39 passed, 0 skipped). FR-08, FR-16 and NFR-02 stay Specified, with the F-03 part noted, because they also depend on the E2E tests TEST-30 and TEST-32 (#20). AC-to-test results are in `docs/features.md` 4.3.1 | F-03 implemented (#19); contract F-03 section 9, DoD item 6 | PR #33 |
| 2026-11-06 | SR-04 UI polish added to Sprint 1 (`docs/sprints/plan.md` v1.3, `docs/features.md` v1.4): one shared visual style for every Sprint 1 screen, recorded as "Visual style" in SDS 5.3 (v1.2). No requirement, AC, test or status changes: no routes, API calls, guards, server code or contract-specified text change, and all 39 client and 160 server tests pass without editing an assertion. The manual test guide was re-run and its screenshots replaced | The plain Bootstrap look would carry into the Deliverable 1 screenshots, the Lab 6 UAT and the demo video; the team chose the design from image mockups first | #34, PR #35 |
| 2026-11-07 | Resolved Q-01, Q-02 and Q-08 as D-18 to D-20; no requirement added or removed; no AC behavior changed. NFR-04, NFR-10 and BR-14 cite the decisions; AC-04 cites D-18 (`docs/features.md` v1.5, F-01 contract v1.5); SDS v1.3 and plan v1.4 follow. F-01 (v1.5) and F-02 (v1.2) contract status lines read "Agreed", as F-03 does. Manual test guide: no-borrowing-limit limitation, loan lengths per D-08, requests named by item type and Borrower, MT-14 example. No row in this document changes status | Team decision; PR #37 review | #36, PR #37, SRS v1.3 |
| 2026-11-07 | SR-04 defect fix: the narrow layout (two-row navigation bar, Pending requests rows as cards) now applies below 768 px instead of 576 px, and the Pending requests table scrolls inside its panel if it is ever wider than the panel. SR-04 in `docs/sprints/plan.md` v1.5 and `docs/features.md` v1.6 covers every width from 320 to 1440 px; SDS 5.3 "Visual style" updated (v1.4). CSS and markup in `client/` only: no requirement, AC, test or status changes, no server or contract text change, and all 39 client tests pass without editing an assertion. The 1280 px look is unchanged, so the manual test guide screenshots stay | Defect found after PR #35: from 576 to 764 px the Pending requests table was wider than its panel and the panel's clipped corner hid the Action column, so **Check out** could not be clicked (F-03, FR-16); from 576 to 636 px **Sign out** sat past the right edge of the navigation bar (F-01, FR-02) | #38, PR #39 |
