# Change request #71: due date on a business day at 17:00 (Lab 7)

| Field | Value |
| --- | --- |
| Issue | #71 |
| Type | Change to behaviour already delivered in Sprint 1 (adaptive maintenance), not a defect |
| Decision | Team decision by Teerakarn Noiruksa and Methipat Mansap, 2026-11-25. No instructor or TA approval is needed (Lab 7 announcement "Lab 7 Spec Sheet Change", 2026-11-25) |
| Accepted Sprint 1 baseline (old rule) | tag `v0.1.0` = `d7cd8ea`; accepted by UAT on `main` `495142e`, revision `kithub-00009-6dr` (Lab 6) |
| Pre-change implementation | `main` `495142e` (no code change since then on `staging` `4a139e7`): `server/src/domain/due-date.ts` `computeDueAt()` |
| Intervening development | None between `495142e` and this change: no Sprint 2 code exists yet |
| Author / reviewer of this document | Teerakarn Noiruksa / Methipat Mansap |

## 1. Old and new rule

| | Old rule (F-03 contract v1.2, SRS v1.3 D-16) | New rule (F-03 contract v1.3, SRS v1.4 D-21) |
| --- | --- | --- |
| Formula | `dueAt = checkedOutAt + maxLoanDays × 24 h` | Start day = checkout date if a business day before 16:00 ICT, else the next business day; due day = start day + `maxLoanDays` calendar days, moved to Monday if Saturday or Sunday; due time 17:00 ICT |
| Time of day | Same as the checkout | Always 17:00 ICT (`T10:00:00.000Z`) |
| Weekend | Can fall due on Saturday or Sunday | Never |
| Late checkout | Same 24-hour days | At or after 16:00 counts from the next business day |
| Example: Fri 6 Nov 2026 14:30, 3 days | Mon 9 Nov 14:30 | Mon 9 Nov 17:00 |
| Example: Wed 25 Nov 2026 10:00, 3 days | Sat 28 Nov 10:00 | Mon 30 Nov 17:00 |
| Example: Wed 25 Nov 2026 16:00, 14 days | Wed 9 Dec 16:00 | Thu 10 Dec 17:00 |
| Loan length | Item type `maxLoanDays` (D-08, D-16) | Unchanged |
| Existing loans | - | Keep their stored `dueAt` |

## 2. Impact table

| Requirement | Feature | SRS / Feature SDS / System SDS | AC | STS tests | Code modules | Impact |
| --- | --- | --- | --- | --- | --- | --- |
| FR-16, D-16, new D-21 | F-03 | SRS glossary "Due date", FR-16, A-05, D-16, D-21; F-03 contract 3.3, 3.4; SDS 4.2 `loans.dueAt`, 4.5 | AC-19 (wording), AC-54 to AC-57 | TEST-19, TEST-50 revised; TEST-54 to TEST-57 new | `server/src/domain/due-date.ts` | Rule changes; signature `computeDueAt(checkedOutAt, maxLoanDays)` kept, so the caller `loans.service.ts` needs no change |
| FR-16, D-21 | F-03 | F-03 contract 3.1, 4.3, 5.5; SDS 5.1, 6.6, 7.1 | AC-58 | TEST-58 new | New route in `server/src/features/units/units.routes.ts` (with `units.schemas.ts`, `units.service.ts`); `client/src/api/units.ts`; `client/src/pages/pending/CheckoutDialog.tsx` | New read-only endpoint `GET /api/item-types/:id/due-date-preview`, Custodian only; preview line in the dialog |
| NFR-01, NFR-02 (roles) | F-01, F-03 | SDS 7.1 permission matrix | AC-58 (access part), AC-06, AC-41 | TEST-58 (b), (c); TEST-41 unchanged | `authenticate`, `requireRole("CUSTODIAN")` on the new route | New endpoint must reject Borrowers (`403`) and no session (`401`) like the other F-03 endpoints |
| FR-08, FR-16 | F-02, F-03 | F-03 contract 4.4 | AC-60, AC-26 | TEST-60 new (display); TEST-26 unchanged | `client/src/pages/RequestDetailPage.tsx`, `client/src/format.ts` | No code change expected: they format whatever `dueAt` is stored |
| FR-16 | F-03 | F-03 contract 4.3 (success message) | AC-49 | TEST-49 (e) text updated | `client/src/pages/pending/CheckoutDialog.tsx` | Message format unchanged; example value changes |
| Persistence | F-03 | F-03 contract 6.1, 6.3; SDS 4.2 | AC-59 | TEST-59 new (integration + manual) | `server/prisma/migrations` | No schema change and no migration. Stored `dueAt` values are not recalculated |
| Historical data | F-03 | SRS D-21 ("Loans created before the change keep their due date") | AC-59 | TEST-59 manual post-deploy check of production Request #5 (due 8 Dec 2026 22:07 under the old rule) | - | Production has loans with old-rule due dates; they stay valid |
| Callers and dependencies | F-03 | F-03 contract 6.3 | AC-19 | TEST-19 | `server/src/features/loans/loans.service.ts` | Calls `computeDueAt(now, maxLoanDays)` inside the checkout transaction; unchanged |
| UI and API validation | F-03 | F-03 contract 3.5, 5.5 | AC-58 | TEST-58 (d), (e) | `units.schemas.ts` | Path `id` integer ≥ 1; no query field allowed |
| End-to-end journey | #20 | F-03 contract 8.1 | AC-19, AC-26 | TEST-30 assertion revised | `e2e/journey.spec.ts` | Old assertion "due = checkout + 14 × 24 h" fails under the new rule; revised to "17:00 ICT on Monday to Friday, 14 to 17 days after the ICT checkout date" (real server clock, so no fixed value) |
| Manual tests | F-03 | `manual-test-guide.md` MT-14 and section 5 | AC-19, AC-54, AC-58 | MT-14 updated | - | Example and expected text changed |
| Sprint 2 (BR-08, F-07) | F-07 | SRS BR-08, D-16 | - | - | `computeDueAt` | F-07 will pass the request's `loanDays`; the business-day rule applies to it as well. No conflict |
| Sprint 3 (FR-22, F-11 overdue) | F-11 | SDS 4.5 "Overdue request" | - | - | - | Overdue stays `dueAt < now`; with the new rule a loan never becomes overdue at night or on a weekend |
| Not applicable: request creation, BR-01 to BR-05 | F-02 | - | AC-08 to AC-17, AC-33 to AC-40 | Regression only | `requests.*` | Does not read or write `dueAt` (it is `null` until checkout) |
| Not applicable: authentication and sessions | F-01 | - | AC-01 to AC-07 | Regression only | `auth.*` | No change; the new route reuses the existing middleware |
| Not applicable: history entries | F-03 | F-03 contract 3.10 | AC-23, AC-24 | Regression only | `loans.service.ts` | History entries do not store the due date |
| Not applicable: deployment and configuration | SR-02 | `deployment.md` | - | CI, Deploy demo smoke test | `deploy/`, `.github/workflows/` | No new environment variable or secret; the rule uses the fixed ICT offset, not the server time zone |

## 3. Behaviour that must stay unchanged and how it is protected

| Preserved behaviour | Protected by |
| --- | --- |
| Checkout state changes (`PENDING` → `CHECKED_OUT`, `AVAILABLE` → `ON_LOAN`, one `ACTIVE` loan) and rejections | TEST-19 (non-date parts), TEST-20 to TEST-22, TEST-42 to TEST-48, TEST-51, TEST-52 |
| Three history entries per checkout, append-only history | TEST-23, TEST-24 |
| Custodian-only checkout and unit list; no session rejected | TEST-41, TEST-32 (E2E) |
| BR-04 and the other request rules (Lab 6 correction #68) | TEST-08 to TEST-17, TEST-11b, TEST-33 to TEST-40, TEST-31 (E2E) |
| Authentication and roles | TEST-01 to TEST-07 |
| The full journey | TEST-30 (E2E, revised due-date assertion only) |

Regression run for the change: `npm run typecheck` and `npm test` in `server/`, `npm test` in `client/`, `npm run test:e2e`, on the GREEN commit, with passed / failed / skipped counts. No existing test is deleted, skipped or weakened; the revised expected values are listed in F-03 contract v1.3 section 8.2 with the old values.

## 4. Order of work

1. This document and the revised specifications (SRS v1.4, SDS v1.9, F-03 contract v1.3, `features.md` v1.10, `traceability.md` v1.12, manual test guide) on branch `docs/71-due-date-contract`; PR into `staging`, reviewed by Methipat Mansap, merged **before** any code.
2. RED: branch `feature/71-due-date` from the merged `staging`; commit the new and revised tests only; run them on that commit (pre-change code) and keep the failing output.
3. GREEN: implementation commit; the same tests pass; regression run as in section 3.
4. PR review, CI, `staging`, release PR into `main`, Deploy demo, post-deploy checks: a checkout shows a 17:00 business-day due date, Request #5 keeps its old due date, and a Borrower still gets `403` on the Custodian endpoints.
