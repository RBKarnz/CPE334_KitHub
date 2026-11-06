# KitHub: Software Requirements Specification

## 1. Document info

| Field | Value |
| --- | --- |
| Product | KitHub, a web-based inventory and borrowing system |
| Course | CPE 334, Project Deliverable 1, Part A |
| Version | 1.3 |
| Date | 2026-11-07 |
| Authors | Teerakarn Noiruksa (67070501062), Methipat Mansap (67070501071) |
| Theme | 2. Inventory and Borrowing System |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-06 | Teerakarn Noiruksa | First baseline for the whole product (Sprints 1 to 3) |
| 1.1 | 2026-11-06 | Teerakarn Noiruksa | Review of PR #10: added FR-30, BR-17, NFR-12, permissions table and Q-09; history covers edits and system actions; clarified availability before Sprint 3; fixed rule links and examples |
| 1.2 | 2026-11-06 | Teerakarn Noiruksa | Resolved Q-04, Q-05 and Q-06 as decisions D-15, D-16 and D-17; A-04 and A-05 now point to them |
| 1.3 | 2026-11-07 | Teerakarn Noiruksa, Methipat Mansap | Resolved Q-01, Q-02 and Q-08 as D-18, D-19 and D-20; NFR-04, NFR-10 and BR-14 now point to them |

## 2. Introduction

### 2.1 Purpose

This document specifies what KitHub must do across all three sprints. It defines the actors, scope, functional requirements (FR), business rules (BR), non-functional requirements (NFR), state models, assumptions and decisions. Screens, endpoints and database tables are defined in the System-Level SDS and the feature contracts, not here.

### 2.2 Stakeholder problem

A Computer Engineering faculty's hardware room lends devices to students for lab work and projects, for example microcontroller boards, single-board computers, sensors, measurement instruments and cables. Today the process is on paper. A student walks to the room and fills in a form with their details and the device they want. A staff member checks the shelf, hands the device over and keeps the form. Returns are also recorded on paper.

This process causes four problems:

1. Students cannot see what is available before walking to the room.
2. Staff cannot see at a glance which unit is with whom, or what is overdue.
3. Paper forms get lost, are hard to search and give no history per device.
4. Nothing stops the same unit from being recorded as lent twice.

### 2.3 Product goal and context

Students request devices online and track their own loans. Hardware room staff maintain the catalog, check devices out and in, and see the current state of the inventory.

KitHub is a course project. It uses synthetic data only and is not the faculty's official system.

### 2.4 Glossary

| Term | Meaning |
| --- | --- |
| Category | A broad family used to browse the catalog, for example "Microcontroller boards" or "Instruments" |
| Item type | A specific model inside a category, for example "Arduino Uno R3". It has a description, a maximum loan length in days and a maximum quantity per request |
| Kit | An item type whose unit is a fixed set of small parts, for example "Transistor kit (2N2222 ×4)". It is borrowed, counted and returned as one unit |
| Unit | One physical device or kit of an item type |
| Asset tag | The unique identifier of a unit, for example `KH-ARD-0007` |
| Borrow request (request) | A Borrower's request with one or more lines and one loan length in days for the whole request |
| Request line (line) | One item type and a quantity inside a request |
| Open request | A request in state `PENDING` or `APPROVED` |
| Loan | One unit checked out to a Borrower against a request line. All loans of a request share the request's due date |
| Due date | Checkout time plus the request's loan length. In Sprint 1, checkout time plus the item type's maximum loan length (D-16) |
| Overdue | A checked-out request whose due date has passed while at least one of its units is not returned. Overdue is derived, not stored as a state |
| History entry | An append-only record of one state change or request edit: the record changed, what changed, the actor and the time |
| System actor | The actor recorded for changes the product makes without a user action, such as expiry. It cannot sign in |

## 3. Actors and responsibilities

KitHub has exactly two roles, and each account has exactly one role (D-02).

| Role | Who | Responsibilities |
| --- | --- | --- |
| Borrower | A student of the faculty | Browse the catalog, create requests, edit and cancel own open requests, view own requests, loans and history |
| Custodian | Hardware room staff or an assigned TA | Maintain categories, item types and units; approve or reject requests; check units out and in; record unit condition; view all requests, loans, history and reports |

Accounts are seeded (D-03). Neither role can create accounts through the product.

### 3.1 Permissions

| Operation | Not signed in | Borrower | Custodian |
| --- | --- | --- | --- |
| View catalog and availability | No | Yes | Yes |
| Create, edit or cancel a request | No | Own only | No |
| View requests, loans, history | No | Own only | All |
| Approve, reject, check out, return | No | No | Yes |
| Manage categories, item types and units | No | No | Yes |
| View reports | No | No | Yes |

Permissions are enforced on the server; hiding a control in the UI is not authorization (BR-05, BR-17, NFR-01, NFR-02).

## 4. Scope and exclusions

### 4.1 Scope by sprint

| Sprint (due) | Scope | Course requirement it meets |
| --- | --- | --- |
| Sprint 1 (2026-11-08) | Sign in, sign out and current user. Seeded categories, item types and units. A Borrower requests one unit of one item type and sees the request. A Custodian views pending requests and records checkout of a chosen unit, which creates an active loan and makes the unit unavailable. Checkout of an unavailable unit and a second active loan on the same unit are rejected | Theme 2 Sprint 1 example in the Group Work Specification |
| Sprint 2 (2026-11-29) | Requests with several lines and one loan length. Approval and rejection with a reason. Editing a pending request and cancelling an open request. Checkout of one unit per quantity. Return of all units with condition per unit, and early return of a single unit. Management of categories, item types, units and their limits. Retiring units | Core expansion |
| Sprint 3 (2026-12-13) | Expiry of approved requests that are not picked up. Overdue status and overdue list. Borrowing limit per Borrower. Search and filter. History per unit and per Borrower. Inventory summary report. Hardening of errors and permissions | Completion and hardening |

### 4.2 Exclusions

KitHub does not provide:

- Fines, payments or deposits
- Real notifications by email, LINE or SMS. The UI may show reminders inside the app only
- Barcode or QR scanning hardware. Asset tags are typed or selected
- Reservations for a future date or time slot
- Loan extensions. A Borrower who needs a device longer returns it and submits a new request (D-10)
- Editing an approved request. The Borrower cancels it and submits a new one (D-11)
- Self-registration, password recovery, email verification, university single sign-on, or several roles per account
- Integration with real university systems, or real student data
- More than one hardware room or department
- Consumables that are taken and not returned. Small parts are lent only as returnable kits (D-12)

## 5. Functional requirements

FRs are grouped by feature area. "Related BR" lists the rules the FR must enforce.

### 5.1 Authentication

| ID | Requirement | Actor | Sprint | Related BR |
| --- | --- | --- | --- | --- |
| FR-01 | A user can sign in with a seeded account's username and password. On success the system starts a session for that account. Invalid credentials are rejected with a message that does not reveal whether the username exists | Borrower, Custodian | 1 | - |
| FR-02 | A signed-in user can sign out. The session ends at once, and later requests that use it are treated as not signed in | Borrower, Custodian | 1 | - |
| FR-03 | A signed-in user can see their own display name and role | Borrower, Custodian | 1 | - |

### 5.2 Catalog

| ID | Requirement | Actor | Sprint | Related BR |
| --- | --- | --- | --- | --- |
| FR-04 | A signed-in user can browse categories and the item types in each category, with the number of units currently available for each item type | Borrower, Custodian | 1 | - |
| FR-05 | A signed-in user can open an item type and see its description, maximum loan length, maximum quantity per request and available unit count | Borrower, Custodian | 2 | BR-07, BR-08 |
| FR-06 | A signed-in user can search item types by name and filter them by category and by availability | Borrower, Custodian | 3 | - |

### 5.3 Requests

| ID | Requirement | Actor | Sprint | Related BR |
| --- | --- | --- | --- | --- |
| FR-07 | A Borrower can create a request for one unit of one item type. The request is stored as `PENDING` and belongs to the signed-in Borrower | Borrower | 1 | BR-01, BR-04, BR-05, BR-17; from Sprint 3: BR-14, BR-15 |
| FR-08 | A Borrower can see a list of their own requests with each request's lines, state and creation time, and open one to see its details | Borrower | 1 | BR-05 |
| FR-09 | A Custodian can see a list of all `PENDING` requests with the Borrower, lines and creation time | Custodian | 1 | - |
| FR-30 | A Custodian can see a list of all requests in any state, filter it by state (for example `APPROVED`), and open any request to see its lines, Borrower and history | Custodian | 2 | - |
| FR-10 | A Borrower can create a request with one or more lines (item type and quantity) and one loan length in days for the whole request. The UI shows which item type sets the maximum loan length and suggests a separate request for items needed longer | Borrower | 2 | BR-01, BR-04, BR-07, BR-08, BR-17; from Sprint 3: BR-14, BR-15 |
| FR-11 | A Borrower can edit their own `PENDING` request: add or remove lines, change quantities and change the loan length. The edit is recorded in history | Borrower | 2 | BR-01, BR-04, BR-07, BR-08, BR-10, BR-16, BR-17; from Sprint 3: BR-14, BR-15 |
| FR-12 | A Borrower can cancel their own `PENDING` or `APPROVED` request. The request becomes `CANCELLED` | Borrower | 2 | BR-10, BR-17 |
| FR-13 | A Custodian can approve a `PENDING` request as a whole. The request becomes `APPROVED` | Custodian | 2 | BR-09 |
| FR-14 | A Custodian can reject a `PENDING` request with a non-empty reason. The request becomes `REJECTED` and its Borrower can see the reason | Custodian | 2 | BR-09 |
| FR-15 | An `APPROVED` request that is not checked out within 48 hours of approval becomes `EXPIRED`, and its reserved quantities become available again. The change is recorded with the System actor | System actor | 3 | BR-13, BR-16 |

### 5.4 Loans

| ID | Requirement | Actor | Sprint | Related BR |
| --- | --- | --- | --- | --- |
| FR-16 | A Custodian can record checkout of a `PENDING` request by choosing one `AVAILABLE` unit of the requested item type. The system creates one `ACTIVE` loan with due date = checkout time + the item type's maximum loan length (D-16), sets the unit to `ON_LOAN` and sets the request to `CHECKED_OUT`. If no unit of the item type is `AVAILABLE`, checkout is rejected and the request stays `PENDING` (D-17). Replaced by FR-17 from Sprint 2, when checkout requires an `APPROVED` request; Sprint 2 tests cover FR-17 only | Custodian | 1 | BR-02, BR-03, BR-16 |
| FR-17 | A Custodian can record checkout of an `APPROVED` request by choosing one `AVAILABLE` unit per quantity on each line. The system creates one `ACTIVE` loan per unit, sets the due date for all of them and sets the request to `CHECKED_OUT` | Custodian | 2 | BR-02, BR-03, BR-06, BR-08, BR-11, BR-12; from Sprint 3: BR-13 |
| FR-18 | A Borrower can see their own active loans with each unit's item type, asset tag and due date | Borrower | 2 | BR-05 |
| FR-19 | A Custodian can see all active loans with the Borrower, unit and due date | Custodian | 2 | - |
| FR-20 | A Custodian can record the return of all units of a `CHECKED_OUT` request, with a condition per unit that defaults to good. Each loan becomes `RETURNED` and the request becomes `RETURNED` | Custodian | 2 | BR-11 |
| FR-21 | A Custodian can record the early return of a single unit of a `CHECKED_OUT` request, with its condition. The request stays `CHECKED_OUT` until every unit is returned | Custodian | 2 | BR-11 |
| FR-22 | The system shows a request as overdue to its Borrower and to Custodians, and a Custodian can see a list of all overdue requests with the units not yet returned | Borrower, Custodian | 3 | BR-15 |

### 5.5 Catalog management

| ID | Requirement | Actor | Sprint | Related BR |
| --- | --- | --- | --- | --- |
| FR-23 | A Custodian can create and edit categories, and create and edit item types with a description, maximum loan length and maximum quantity per request | Custodian | 2 | BR-07, BR-08 |
| FR-24 | A Custodian can add a unit to an item type with a unique asset tag. The new unit is `AVAILABLE` | Custodian | 2 | - |
| FR-25 | A Custodian can set a unit in `MAINTENANCE` back to `AVAILABLE` when it is repaired | Custodian | 2 | BR-11 |
| FR-26 | A Custodian can retire a unit that is not `ON_LOAN`. The unit becomes `RETIRED` | Custodian | 2 | BR-12 |

### 5.6 History and reports

| ID | Requirement | Actor | Sprint | Related BR |
| --- | --- | --- | --- | --- |
| FR-27 | A Custodian can see the history of a unit: every state change and every loan, with the acting user and time | Custodian | 3 | BR-16 |
| FR-28 | A Borrower can see the history of their own requests and loans. A Custodian can see the same history for any Borrower | Borrower, Custodian | 3 | BR-05, BR-16 |
| FR-29 | A Custodian can see an inventory summary: for each item type, the number of units in each unit state, the number of active loans and the number of overdue requests | Custodian | 3 | - |

## 6. Business rules

| ID | Rule | Example of a rejected case | Sprint |
| --- | --- | --- | --- |
| BR-01 | A request line can be created only for an item type with enough available units for its quantity at that moment. In Sprint 1 a request has exactly one line with quantity 1. Until Sprint 3, available units = units in `AVAILABLE` state, so an approval does not reserve units: checkout of an approved request can still be rejected under BR-02 if no unit is left, and the request stays `APPROVED` until its Borrower cancels it (accepted limitation, D-15). From Sprint 3, quantities reserved by `APPROVED` requests are also subtracted (BR-13) | A Borrower requests an item type with 0 available units. The request is rejected and nothing is stored | 1 |
| BR-02 | Checkout is allowed only for a unit in `AVAILABLE` state that belongs to the line's item type | A Custodian checks out a unit that is `ON_LOAN`, or a unit of a different item type. The checkout is rejected and no loan is created | 1 |
| BR-03 | A unit has at most one `ACTIVE` loan, even when two checkouts of it are attempted at the same time | Two Custodians submit checkout of `KH-ARD-0007` at the same moment. Exactly one succeeds; the other is rejected and no second loan exists | 1 |
| BR-04 | A Borrower cannot hold two open requests that contain the same item type. To get more of it, they edit the pending request, or cancel the approved one and submit a new one. After a request is checked out, the Borrower may request the same item type again | A Borrower with a pending request for "Arduino Uno R3" creates a second request for "Arduino Uno R3". The second request is rejected | 1 |
| BR-05 | The Borrower of a request, loan or history entry is always the signed-in user. A client cannot choose another user's identity, and a Borrower cannot read another Borrower's records | A Borrower sends a request that names another Borrower as owner, or asks for another Borrower's request by ID. The action is rejected and no data of the other Borrower is returned | 1 |
| BR-06 | The Borrower chooses only the item type and quantity, never the unit. The Custodian assigns one available unit per quantity at checkout | A Borrower's request names a specific asset tag. The whole request is rejected and nothing is stored | 2 |
| BR-07 | A line's quantity is at least 1 and at most the item type's maximum quantity per request | A Borrower requests 2 units of "Digital multimeter" (maximum 1), or a quantity of 0. The request is rejected | 2 |
| BR-08 | A request has one loan length for all its lines, from 1 day up to the smallest maximum loan length among its item types. Due date = checkout time + loan length | A request for an Arduino (14 days) and a multimeter (3 days) asks for 7 days. The request is rejected because the limit is 3 days | 2 |
| BR-09 | A request is approved or rejected as a whole. Rejection requires a non-empty reason, which the Borrower can see | A Custodian approves only one line of a two-line request, or rejects a request with an empty reason. The action is rejected | 2 |
| BR-10 | A Borrower can cancel only their own request, and only while it is `PENDING` or `APPROVED`. A Borrower can edit only their own request, and only while it is `PENDING`. An edit is checked against the same rules as a new request | A Borrower edits an `APPROVED` request, or cancels a `CHECKED_OUT` request. The action is rejected | 2 |
| BR-11 | Units are normally returned together with a condition per unit that defaults to good. A single unit may be returned early as an exception. A unit returned damaged goes to `MAINTENANCE` and cannot be checked out until it is set back to `AVAILABLE` | A Custodian records a unit's return as damaged but asks to set the unit to `AVAILABLE`. The return is rejected; a damaged unit can only go to `MAINTENANCE` | 2 |
| BR-12 | A unit on loan cannot be retired, and a retired unit cannot be checked out | A Custodian retires a unit that is `ON_LOAN`. The action is rejected and the unit stays `ON_LOAN` | 2 |
| BR-13 | An approved request reserves its quantities. If it is not checked out within 48 hours of approval, it becomes `EXPIRED` and the reservation is released | A Custodian checks out a request that expired. The checkout is rejected | 3 |
| BR-14 | A Borrower may hold at most 5 units in total across active loans and open requests. A kit counts as one unit. A Borrower under the limit may request at any time without returning earlier loans. Only active loans and open requests count (D-20) | A Borrower with 4 units on loan creates a request for 2 more units. The request is rejected | 3 |
| BR-15 | A Borrower with an overdue request cannot create a new request until every unit of that request is returned | A Borrower with one unit overdue creates a new request. The request is rejected | 3 |
| BR-16 | Every state change of a request, unit or loan, and every edit of a request, is recorded with its actor and the time. The actor is the signed-in user who acted, or the System actor for automatic changes such as expiry. History entries are never edited or deleted | No operation exists to edit or delete a history entry, and the data layer rejects any update or delete of one | 1 |
| BR-17 | Only Borrowers create, edit or cancel requests. A Custodian cannot create, edit or cancel a request, for themselves or for a Borrower | A Custodian submits a new request or cancels a Borrower's request. The action is rejected and nothing changes | 1 |

## 7. Non-functional requirements

| ID | Requirement | Measurable target | Verification | Sprint |
| --- | --- | --- | --- | --- |
| NFR-01 | Authentication | A request to any protected operation without a valid session is rejected and returns no private data | API test | 1 |
| NFR-02 | Authorization | A Borrower who requests another Borrower's request or loan is rejected and receives none of its fields. A Borrower who calls a Custodian operation, or a Custodian who calls a Borrower-only operation (create, edit or cancel a request), is rejected and nothing changes | API test | 1 |
| NFR-03 | Password storage | Every stored password value is a salted hash from an adaptive algorithm with a configurable cost (for example bcrypt or Argon2), not a plain digest. Pass when: no stored value equals its plain-text password, the stored value identifies the adaptive algorithm and its cost, and two accounts with the same password have different stored values | Database/unit test | 1 |
| NFR-04 | Session lifecycle | Sign-out invalidates the session immediately. Sessions expire 8 hours after sign-in (D-18) | API test | 1 |
| NFR-05 | Data integrity under concurrency | Two simultaneous checkouts of the same unit produce exactly one `ACTIVE` loan | Integration test | 1 |
| NFR-06 | Persistence | A record created before an application restart is still present after it. From Lab 5, the same holds after a redeployment | Integration test (Sprint 1); deployment check (Lab 5) | 1 |
| NFR-07 | Configuration and secrets | Every setting is read from environment variables. `.env.example` lists all of them with placeholder values only, and no real secret is in the repository | Review + clean-clone build | 1 |
| NFR-08 | Error handling | Every error response uses one JSON shape with an error code and a message, and never contains a stack trace or internal details | API test | 1 |
| NFR-09 | Auditability | Every state change listed in section 8 and every request edit creates a history entry with its actor (signed-in user or System actor) and a timestamp | Integration test | 1 |
| NFR-10 | Usability | A Borrower can submit a request within 3 clicks from the catalog (D-19) | Manual check + UI test | 2 |
| NFR-11 | Performance | Catalog and loan lists respond within 2 seconds with 500 units on the deployed service (Proposed, Q-03) | Measurement on the deployed service | 3 |
| NFR-12 | List states | Every list shows a loading state, an empty state and an error state, starting with the Sprint 1 lists (catalog, my requests, pending requests) | UI test + manual check | 1 |

Course constraints that also apply to the whole product:

- Every workflow runs through a real UI, an application/API layer and a persistent database. No data is kept only in the browser or in server memory.
- The product is packaged with Docker and deployed on Google Cloud from Lab 5 (2026-11-15).
- Only synthetic data is used. No real payment gateway, messaging service or external API is used.

## 8. State models

Any transition that is not listed in this section is invalid. The system rejects it and nothing changes.

### 8.1 Unit

| From | To | Trigger | Sprint |
| --- | --- | --- | --- |
| `AVAILABLE` | `ON_LOAN` | Checkout | 1 |
| `ON_LOAN` | `AVAILABLE` | Return in good condition | 2 |
| `ON_LOAN` | `MAINTENANCE` | Return damaged | 2 |
| `MAINTENANCE` | `AVAILABLE` | Marked repaired by a Custodian | 2 |
| `AVAILABLE` or `MAINTENANCE` | `RETIRED` | Retired by a Custodian | 2 |

Invalid examples: `ON_LOAN` → `RETIRED`, `RETIRED` → any state, `MAINTENANCE` → `ON_LOAN`.

### 8.2 Request

| From | To | Trigger | Sprint |
| --- | --- | --- | --- |
| (new) | `PENDING` | Created by its Borrower | 1 |
| `PENDING` | `CHECKED_OUT` | Checkout by a Custodian (Sprint 1 only; from Sprint 2 checkout requires `APPROVED`) | 1 |
| `PENDING` | `APPROVED` | Approved by a Custodian | 2 |
| `PENDING` | `REJECTED` | Rejected by a Custodian with a reason | 2 |
| `PENDING` | `CANCELLED` | Cancelled by its Borrower | 2 |
| `APPROVED` | `CHECKED_OUT` | Checkout by a Custodian | 2 |
| `APPROVED` | `CANCELLED` | Cancelled by its Borrower | 2 |
| `CHECKED_OUT` | `RETURNED` | Every unit of the request is returned | 2 |
| `APPROVED` | `EXPIRED` | 48 hours pass after approval without checkout | 3 |

`REJECTED`, `CANCELLED`, `RETURNED` and `EXPIRED` are final. Invalid examples: `APPROVED` → `PENDING` (editing an approved request), `CHECKED_OUT` → `CANCELLED`, `REJECTED` → `APPROVED`.

### 8.3 Loan

| From | To | Trigger | Sprint |
| --- | --- | --- | --- |
| (new) | `ACTIVE` | Checkout of its unit | 1 |
| `ACTIVE` | `RETURNED` | Return of its unit | 2 |

`RETURNED` is final. Overdue is not a loan state; it is derived from the request's due date (section 2.4).

## 9. Assumptions

| ID | Assumption |
| --- | --- |
| A-01 | All accounts, devices and records are synthetic. No real student or staff data is used |
| A-02 | There is one hardware room, and every Custodian may act on every item type, unit, request and loan in it |
| A-03 | The Custodian checks the Borrower's identity at the counter before checkout; KitHub does not verify it again |
| A-04 | Before Sprint 3, a `PENDING` or `APPROVED` request does not reserve units. "Available" means units in `AVAILABLE` state. From Sprint 3, units reserved by approved requests are also subtracted (confirmed by D-15) |
| A-05 | In Sprint 1, a request has no loan length, so a loan's due date is checkout time + the item type's maximum loan length (confirmed by D-16) |
| A-06 | All times are stored with a time zone and shown in Asia/Bangkok time |
| A-07 | Asset tags are assigned by the Custodian and are unique across all item types |

## 10. Decisions log

| ID | Decision | Reason | Date |
| --- | --- | --- | --- |
| D-01 | Track individual units with asset tags, not only quantities | Staff must know which unit is with whom, and a unit must never be lent twice | 2026-11-05 |
| D-02 | Exactly two roles, Borrower and Custodian, and one role per account | Meets the course's two-role requirement and keeps permissions simple | 2026-11-05 |
| D-03 | Accounts are seeded; no self-registration or password recovery | Allowed by the course specification and keeps Sprint 1 small | 2026-11-05 |
| D-04 | The Borrower browses category → item type and requests a model; the Custodian picks the unit at checkout | Matches how the hardware room counter works today | 2026-11-05 |
| D-05 | Borrowing limit: 5 units in total per Borrower across active loans and open requests; instruments are also limited to 1 per request | Shares scarce devices fairly | 2026-11-05 |
| D-06 | No partial approval: a request is approved or rejected as a whole, and the Borrower may edit it while pending | Keeps one due date and one state per request | 2026-11-05 |
| D-07 | An approved request expires 48 hours after approval if not picked up | Releases reserved devices for other Borrowers | 2026-11-05 |
| D-08 | Default limits per category: 14 days for microcontroller boards, single-board computers, sensors and modules, component kits, and cables and accessories; 3 days for instruments. Maximum quantity per request: microcontroller boards 2, single-board computers 1, sensors and modules 4, component kits 3, cables and accessories 4, instruments 1. A Custodian can change them per item type | Instruments are shared and expensive, so they have the shortest loan and one per request | 2026-11-05 |
| D-09 | One loan length for the whole request, capped by the smallest maximum among its item types | All loans of a request share one due date and are returned together | 2026-11-05 |
| D-10 | No loan extensions; the Borrower returns the device and submits a new request | Keeps the request and loan states simple | 2026-11-05 |
| D-11 | An approved request cannot be edited; the Borrower cancels it and submits a new one | Approval stays valid for exactly what the Custodian approved | 2026-11-05 |
| D-12 | Small parts are lent only as returnable kits, and a kit counts as one unit | Consumables that are not returned are out of scope | 2026-11-05 |
| D-13 | Units are returned together by default ("return all"), and a single early return is an exception | Matches a request's single due date while allowing a damaged unit to come back early | 2026-11-05 |
| D-14 | A Borrower with an overdue request cannot create a new request until it is fully returned | Encourages on-time returns without fines | 2026-11-05 |
| D-15 | Approved requests reserve units only from Sprint 3, together with the 48-hour expiry (BR-13). In Sprint 2, checkout of an approved request can be rejected if another request took the last unit; this is an accepted limitation | Reserving in Sprint 2 without expiry would let an approved request hold units until its Borrower cancels it | 2026-11-06 |
| D-16 | In Sprint 1, a loan's due date is checkout time + the item type's maximum loan length. From Sprint 2 it is checkout time + the loan length chosen in the request (BR-08) | Sprint 1 requests have no loan length, but every loan needs a due date for the Sprint 3 overdue rules | 2026-11-06 |
| D-17 | In Sprint 1, if no unit is available when a Custodian checks out a `PENDING` request, the checkout is rejected and the request stays `PENDING`; this is an accepted limitation until Sprint 2 adds rejection and cancellation. Seed data has several units per item type so the demo does not hit this case | Sprint 1 has no `REJECTED` state or cancel action | 2026-11-06 |
| D-18 | A session expires 8 hours after sign-in, with no sliding renewal. The value stays configurable as `SESSION_TTL_HOURS` (default 8) | Covers a full day in the hardware room; implemented and tested by F-01 (AC-04) | 2026-11-07 |
| D-19 | Usability target: a Borrower can submit a request within 3 clicks from the catalog. Measured when NFR-10 is verified in Sprint 2 | Sprint 1 already meets it with one "Request" button per item type; Sprint 2 adds several lines per request, so the target is checked there | 2026-11-07 |
| D-20 | Only `ACTIVE` loans and units on lines of open requests (`PENDING` or `APPROVED`) count toward the 5-unit limit. `CANCELLED`, `REJECTED`, `EXPIRED` and `RETURNED` requests and returned loans do not count | A finished request holds no device; matches SDS 4.5 | 2026-11-07 |

## 11. Open questions

| ID | Question | Why it matters | Status |
| --- | --- | --- | --- |
| Q-01 | Is an 8-hour session expiry acceptable? | Sets NFR-04 and its test | Resolved: D-18 |
| Q-02 | Is "submit a request within 3 clicks from the catalog" the usability target we want? | Sets NFR-10 and its check | Resolved: D-19 |
| Q-03 | Can the team measure response time with 500 units on the deployed service in Sprint 3? If not, should NFR-11 be removed? | The course asks not to state targets that cannot be measured | Open; settle before the Sprint 3 measurement (SR-03) |
| Q-04 | Should approved requests reserve units from Sprint 2, when approval is introduced, instead of from Sprint 3? | Without a reservation, an approved request may find no unit at checkout | Resolved: D-15 (keep Sprint 3, accepted limitation) |
| Q-05 | In Sprint 1, is the due date checkout time + the item type's maximum loan length (A-05)? | Sprint 1 requests have no loan length, but loans need a due date for later overdue rules | Resolved: D-16 (yes) |
| Q-06 | In Sprint 1 there is no `REJECTED` state. What happens to a `PENDING` request when no unit is available at checkout? | Without an answer, the request stays pending with no way to close it until Sprint 2 | Resolved: D-17 (checkout rejected, request stays `PENDING`) |
| Q-07 | Does the 48-hour pickup window count hours when the hardware room is closed, such as weekends? | Affects BR-13 and its tests | Open; settle before the Sprint 3 contract |
| Q-08 | Do units in `CANCELLED`, `REJECTED` or `EXPIRED` requests count toward the 5-unit limit? (Assumed: no, only active loans and open requests count) | Affects BR-14 and its tests | Resolved: D-20 |
| Q-09 | How is expiry triggered: checked whenever a request is read or acted on, or by a scheduled job? | Decides when FR-15 happens, how it is tested, and how the System actor is recorded | Open; settle before the Sprint 3 contract |
