# SR-03 Hardening: performance, permission and error regression, UAT: Engineering Contract

## 1. Document info

| Field | Value |
| --- | --- |
| System responsibility | SR-03 Hardening: performance measurement, permission and error regression suite, UAT and maintenance defects |
| Sprint | 3 (due 2026-12-13); planned 7 to 12 Dec, after F-10 to F-14 (`plan.md` 6.3) |
| Version | 1.0 |
| Status | Proposed (PR for #112); implementation starts only after this contract is reviewed and merged |
| Date | 2026-11-27 |
| Authors | Teerakarn Noiruksa (67070501062); reviewer Methipat Mansap (67070501071) |
| Baseline | SRS v1.7 (this PR: D-24 settles Q-03), System-Level SDS v1.15 (6.5, 7.1 to 7.3, 9.5 to 9.7, 10, 11), contracts F-10 to F-14 |
| Issues | #112 this item; #107 to #111 (the Sprint 3 features it re-checks) |
| Definition of Done | [Product Definition of Done](../sprint-1/definition-of-done.md) and section 9 of this contract |
| AC/TEST block | 164 to 171 (claimed in #112) |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-27 | Teerakarn Noiruksa | First contract: Q-03 settled as D-24; AC-164 to AC-171, TEST-164 to TEST-171, decisions SR03-D1 to SR03-D8 |

Changes after approval get a new version row with the reason. AC and TEST IDs are never reused for a different meaning.

## 2. Requirements and dependencies

### 2.1 Linked requirements

| Type | IDs | What SR-03 does with it |
| --- | --- | --- |
| Non-functional | NFR-11 | Measures the response time of the catalog, loan and request lists with 500 units (D-24) |
| Non-functional (re-verified) | NFR-01, NFR-02, NFR-08 | One regression suite over every endpoint: no session `401`, wrong role `403`, another Borrower `404`, and one error shape |
| All Sprint 3 FR and BR | FR-06, FR-15, FR-22, FR-27 to FR-29, BR-13 to BR-15 | One end-to-end walkthrough and the Sprint 3 UAT on the release candidate |
| SRS decisions | D-24 (new, Q-03) | How and where NFR-11 is measured |
| SDS | 7.3 (how access is tested), 6.5 (error shape and check order), 9.6 and 9.7 (CI, deployment), 10 (test architecture), 11 (NFR-11 row) | Used as written |

### 2.2 Depends on

| Item | What SR-03 needs | Status |
| --- | --- | --- |
| F-10 to F-14 (#107 to #111) | Every Sprint 3 endpoint and page, so the suite and the walkthrough cover them | F-11 and F-14 on `staging`; F-10, F-12, F-13 planned |
| SR-02 (Lab 5) | The Docker image, CI and the Cloud Run deployment | Done |
| Lab 6 UAT format (`docs/labs/lab-06/uat-cases.md`) | The form of UAT cases and findings | Done |

### 2.3 Out of scope for SR-03

| Item | Why |
| --- | --- |
| New behaviour | SR-03 adds tests, scripts and fixes of defects found; a new rule needs a contract |
| Load testing (many users at once) | NFR-11 is a response time with a given data size, not a throughput target |
| Rate limiting of sign-in | Not in the SRS (SDS 13) |
| 500 units in the deployed database | Units and history cannot be deleted (BR-16, FR-26 retires only), so they would stay in the demo catalog (SR03-D1) |

## 3. Design

### 3.1 Q-03 and D-24

Q-03 asked whether the team can measure NFR-11 with 500 units on the deployed service, and whether to remove NFR-11 if not. Options:

| Option | For | Against |
| --- | --- | --- |
| A. Load 500 units into the deployed database and measure there | Exactly the SRS wording | Permanent: units cannot be deleted and every action writes history (BR-16); the extra category and units stay in UAT and the demo |
| B. Remove NFR-11 | No work | Loses the only performance requirement; F-12 and F-14 add list queries that should be checked |
| **C. (chosen)** Measure the release image with 500 units, and the deployed service with its own data | Same image and code as production; repeatable; the deployed check still covers Cloud Run and Cloud SQL latency | The 500-unit part runs on a developer machine, not Cloud Run |

**D-24 (SRS v1.7):** NFR-11 is kept and measured on the release candidate in two parts. (1) The release's Docker image, started with `docker compose` against a PostgreSQL database loaded with the performance data set (3.2): each measured endpoint answers within 2 seconds at the 95th percentile of 30 calls. (2) The deployed service with its own data: the same endpoints, read-only, same target. The 500 units are never loaded into the deployed database.

### 3.2 Performance data set (`server/scripts/perf-seed.ts`)

| Data | Amount |
| --- | --- |
| Categories | 6 (the demo seed's names) |
| Item types | 120 (20 per category), names like "Sensor 017" so a search matches about 1 in 10 |
| Units | 500: 400 `AVAILABLE`, 60 `ON_LOAN`, 25 `MAINTENANCE`, 15 `RETIRED` |
| Users | 2 Custodians, 40 Borrowers |
| Requests | 300 over every state: 40 `PENDING`, 20 `APPROVED`, 30 `REJECTED`, 30 `CANCELLED`, 40 `CHECKED_OUT` (60 `ACTIVE` loans, 10 of them overdue), 130 `RETURNED`, 10 `EXPIRED` |
| History | The entries those requests would have (about 1,500), inserted directly |

The script refuses to run unless the database name in `DATABASE_URL` ends with `_perf` (SR03-D2), and it reads no secret: the passwords of its accounts come from `PERF_PASSWORD`, which is not committed.

### 3.3 Measurement (`server/scripts/perf-measure.ts`)

- Signs in once per role through `POST /api/auth/login` with `PERF_USERNAME_*` and `PERF_PASSWORD` from the environment, then for each endpoint of 3.4: 5 warm-up calls, then 30 timed calls one after another, each from request start to the end of the body.
- Reports per endpoint: status, body size, min, median, 95th percentile (the 29th of the 30 sorted times, nearest rank) and max in milliseconds, as a Markdown table and as JSON in `docs/sprints/sprint-3/evidence/SR-03/`.
- Exits with code 1 if any call is not `200` or any 95th percentile is above 2,000 ms.
- Sends only `GET` requests after the sign-in, so it can run against the deployed service without changing data (SR03-D3).

### 3.4 Endpoints measured

| Endpoint | Role | Why |
| --- | --- | --- |
| `GET /api/categories` | Borrower | Catalog (NFR-11 "catalog") |
| `GET /api/item-types?search=Sensor&available=true` | Borrower | Catalog search (F-12) |
| `GET /api/loans` | Custodian | Loan list (NFR-11 "loan lists") |
| `GET /api/loans` | Borrower | Own loans |
| `GET /api/requests` | Custodian | All requests (largest list, with lines and loans) |
| `GET /api/requests?overdue=true` | Custodian | Overdue list (F-11) |
| `GET /api/reports/inventory` | Custodian | Inventory report (F-14) |
| `GET /api/history?borrowerId=<busiest Borrower>` | Custodian | Borrower history (F-13) |

### 3.5 Regression suite (`server/tests/api/regression/`)

- `routes.ts` lists every API route once: method, path with an example id, who may call it (anyone, signed in, Borrower, Custodian), whether it returns Borrower-owned records, and a valid example body.
- `access.test.ts` runs, for every row: no session → `401`; the wrong role → `403` with nothing changed; another Borrower → `404` or the record left out of a list. Expected results come from SDS 7.1.
- `errors.test.ts` checks the NFR-08 shape for each error status the API produces (SR03-D5).
- A guard test reads the routes registered on the Express app and fails if one is missing from `routes.ts`, so a later endpoint cannot skip the suite (SR03-D4).

### 3.6 Sprint 3 walkthrough (E2E) and narrow screens

`e2e/sprint3-walkthrough.spec.ts` runs the Sprint 3 pages in a real browser on the built app, with data prepared through `e2e/support/db.ts` (loans with a past `dueAt` for the overdue case, as the Sprint 2 walkthrough prepares its data). `e2e/narrow-screens.spec.ts` gains the Sprint 3 pages, checked at 320, 768 and 1440 px for no page-level horizontal scroll (SDS 5.3, SR-04).

### 3.7 UAT and defects

- `docs/sprints/sprint-3/uat-cases.md` (same columns as Lab 6) has at least one case per Sprint 3 AC group, run on the deployed release candidate by the student who did not build that feature (SR03-D6).
- Each finding gets an Issue with severity (High: a rule or access is wrong or data is lost; Medium: a wrong result with a workaround; Low: wording or layout). High and Medium are fixed before `v1.0.0`, each with a regression test that takes the AC's TEST number with a letter (`features.md` section 1). Low may be deferred with a line in the final report (SR03-D7).

### 3.8 Decisions made in this contract

| ID | Decision | Rationale |
| --- | --- | --- |
| SR03-D1 | Q-03 is settled as D-24 (option C of 3.1); the SRS NFR-11 row, Q-03 and the decision log change in this PR (SRS v1.7) | Keeps a measurable NFR-11 without permanent test data in the deployed catalog |
| SR03-D2 | The performance seed runs only on a database whose name ends with `_perf` | The same guard idea as the test database (`_test`, SDS 9.1): it can never run against development or production data |
| SR03-D3 | The deployed measurement is read-only and is started by a student with their own credentials in the shell; nothing is stored in the repository | NFR-07; no password is typed by a tool or written to a file |
| SR03-D4 | The regression suite lists routes by hand and a guard compares the list with the app's registered routes | A hand-written list states the expected access per route; the guard makes it complete |
| SR03-D5 | Error shape: every error body is exactly `{ error: { code, message, details?, requestId } }`, `requestId` equals the `X-Request-Id` header, and no body contains `stack`, `prisma`, `SELECT` or a file path | NFR-08 and SDS 6.5, checked the same way for every status |
| SR03-D6 | UAT cases are run by the student who did not build the feature | Same independence as the Lab 6 partner test, inside the team |
| SR03-D7 | High and Medium findings are fixed before `v1.0.0`; Low may be deferred and reported | Fits the exam period and the 13 Dec deadline |
| SR03-D8 | The final release check (AC-171) is a list in `docs/sprints/sprint-3/release-checklist.md` with the commit, the CI run and the deployed revision | The same evidence as the Sprint 2 release, in one place for the final report |

## 4. UI specification

No new screen. The walkthrough and the narrow-screen check exercise the pages of F-10 to F-14; a defect found there is fixed under 3.7.

## 5. API specification

No new endpoint. The regression suite checks every existing one against SDS 7.1 and 6.5.

## 6. Data specification

No schema change. The performance data set lives only in a local `_perf` database (3.2).

## 7. Acceptance criteria

| AC | Expected outcome | Requirements |
| --- | --- | --- |
| AC-164 | With the performance data set (3.2) and the release's Docker image, every endpoint of 3.4 answers `200` with a 95th percentile of 30 calls at most 2,000 ms; the table and JSON are recorded with the image digest and the commit | NFR-11, D-24 |
| AC-165 | On the deployed service, the same endpoints, called read-only, answer `200` with a 95th percentile at most 2,000 ms; the result is recorded with the Cloud Run revision; nothing in the deployed database changes except the measurement's own sessions | NFR-11, D-24, SR03-D3 |
| AC-166 | Every protected API route, without a session, answers `401 UNAUTHENTICATED` and no record data; the guard test fails if a registered route is missing from the route list | NFR-01, SR03-D4 |
| AC-167 | Every route restricted to one role answers `403 FORBIDDEN` to the other role, and nothing changes in the database | NFR-02, BR-17 |
| AC-168 | Every route that returns or acts on a Borrower-owned record answers `404 NOT_FOUND` to another Borrower (detail, edit, cancel), or leaves the record out of the list (requests, loans, overdue, history), with none of its fields | NFR-02, BR-05, DD-06 |
| AC-169 | Every error status the API produces (`400`, `401`, `403`, `404`, `409`, `415`, `500`, and `404` for an unknown `/api` path) has the SR03-D5 shape, the `requestId` of the `X-Request-Id` header, and no internal detail | NFR-08 |
| AC-170 | In a real browser on the built app: a Borrower searches the catalog and sends a request; a Custodian approves it and sees "Pick up by …", checks it out, opens Overdue (a prepared overdue request is listed), the inventory report and the unit history; the Borrower opens History and sees the steps. The Sprint 3 pages have no page-level horizontal scroll at 320, 768 and 1440 px | FR-06, FR-15, FR-22, FR-27 to FR-29, SDS 5.3 |
| AC-171 | On the final release candidate: the Sprint 3 UAT cases are run (3.7), every High and Medium finding is fixed with a regression test, the whole server, client and E2E suites pass, CI is green, and the post-deploy check (health, ready, sign in as each role, one request from creation to return) passes on the deployed revision; all recorded in the release checklist | NFR-01 to NFR-12 (regression), SR03-D6 to SR03-D8 |

## 8. Software Test Specification (STS)

### 8.1 Conventions

- API regression tests use the existing helpers and the test database; they create one record of each kind they need and never use the demo seed.
- Measurements (TEST-164, TEST-165) are scripts, not Vitest tests: their output files are the evidence. A run that fails the target is kept as evidence too, with the fix that followed.
- **TDD**: TEST-166 to TEST-169 are regression tests over existing behaviour, so they are expected to pass on the first run; any failure is a defect, which gets an Issue, a fix and a note in the evidence README. TEST-170 is written after F-10 to F-14 are on `staging`.

### 8.2 Test cases

| Test | AC | Level | Preconditions and input | Action | Expected result | Planned file |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-164 | AC-164 | Measurement | `docker compose` with the release image and a `kithub_perf` database; `perf-seed.ts` run once | `perf-measure.ts` against `http://localhost:<port>` | Every row `200`, p95 ≤ 2,000 ms; Markdown and JSON in `docs/sprints/sprint-3/evidence/SR-03/` with image digest and commit | `server/scripts/perf-seed.ts`, `server/scripts/perf-measure.ts` |
| TEST-165 | AC-165 | Measurement | The deployed release revision; credentials of one account per role typed by a student into their shell | `perf-measure.ts` against the service URL | Every row `200`, p95 ≤ 2,000 ms; the revision recorded; a count of requests, loans, units and history entries before and after is equal | `server/scripts/perf-measure.ts` |
| TEST-166 | AC-166 | API | One record of each kind (request, loan, unit, item type, category, Borrower) | For every row of `routes.ts` except public ones, call without a cookie; then the guard test | Each `401 UNAUTHENTICATED`, body has only `error`; the guard finds no registered route missing from the list | `server/tests/api/regression/access.test.ts` |
| TEST-167 | AC-167 | API | As TEST-166; snapshot of every table before and after | Every Custodian-only route as a Borrower; every Borrower-only route (create, edit, cancel) as a Custodian | Each `403 FORBIDDEN`; snapshot unchanged | `server/tests/api/regression/access.test.ts` |
| TEST-168 | AC-168 | API | B1's request, loan and history; B2 signed in | B2 calls `GET /api/requests/:id`, `PATCH` and `cancel` on B1's request; B2 lists requests, loans, `?overdue=true` and history | `404 NOT_FOUND` with no field of B1's request; B1's records absent from every list; nothing changed | `server/tests/api/regression/access.test.ts` |
| TEST-169 | AC-169 | API | Test route that throws (as TEST-29) | One call per status: malformed body (`400`), no cookie (`401`), wrong role (`403`), missing record (`404`), a rule (`409`), text body (`415`), the throwing route (`500`), `/api/nope` (`404`) | Each body has exactly the SR03-D5 keys; `requestId` equals `X-Request-Id`; no `stack`, `prisma`, `SELECT` or path in the body | `server/tests/api/regression/errors.test.ts` |
| TEST-170 | AC-170 | E2E | Built app on the test database; data from `e2e/support/db.ts`, including one overdue loan | The walkthrough of AC-170; then the Sprint 3 pages at 320, 768, 1440 px | Every step shows the expected text; no page-level horizontal scroll | `e2e/sprint3-walkthrough.spec.ts`, `e2e/narrow-screens.spec.ts` |
| TEST-171 | AC-171 | Release check | The release PR into `main` and its deployed revision | Run the UAT cases; suites; CI; post-deploy check | Every item of the release checklist ticked with its evidence; no open High or Medium finding | `docs/sprints/sprint-3/uat-cases.md`, `docs/sprints/sprint-3/release-checklist.md` |

### 8.3 Coverage checks

- NFR-11: TEST-164 and TEST-165. NFR-01: TEST-166. NFR-02: TEST-167 and TEST-168. NFR-08: TEST-169.
- Every route is in the access suite (guard in TEST-166).
- Every Sprint 3 feature appears in the walkthrough (TEST-170) and in the UAT cases (TEST-171).

## 9. Definition of Done (SR-03)

- This contract and SRS v1.7 (D-24) reviewed by Methipat Mansap and merged into `staging` before any SR-03 work.
- TEST-166 to TEST-170 merged into `staging` through a reviewed PR with CI green; any defect they found fixed and listed.
- TEST-164 and TEST-165 evidence in `docs/sprints/sprint-3/evidence/SR-03/`.
- TEST-171: the release checklist complete for `v1.0.0`.
- `docs/features.md` 6.6 and the `docs/traceability.md` rows for NFR-11 (and the SR-03 notes on NFR-01, NFR-02, NFR-08) updated with the results.

## 10. Traceability summary

| AC | Requirements | Tests | Planned files |
| --- | --- | --- | --- |
| AC-164 | NFR-11, D-24 | TEST-164 | `server/scripts/perf-seed.ts`, `server/scripts/perf-measure.ts` |
| AC-165 | NFR-11, D-24 | TEST-165 | `server/scripts/perf-measure.ts` |
| AC-166 | NFR-01 | TEST-166 | `server/tests/api/regression/access.test.ts` |
| AC-167 | NFR-02, BR-17 | TEST-167 | `server/tests/api/regression/access.test.ts` |
| AC-168 | NFR-02, BR-05 | TEST-168 | `server/tests/api/regression/access.test.ts` |
| AC-169 | NFR-08 | TEST-169 | `server/tests/api/regression/errors.test.ts` |
| AC-170 | FR-06, FR-15, FR-22, FR-27 to FR-29 | TEST-170 | `e2e/sprint3-walkthrough.spec.ts`, `e2e/narrow-screens.spec.ts` |
| AC-171 | NFR-01 to NFR-12 | TEST-171 | `docs/sprints/sprint-3/uat-cases.md`, `docs/sprints/sprint-3/release-checklist.md` |
