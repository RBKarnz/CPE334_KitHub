# KitHub Sprint 1 UAT Handoff (Lab 6)

| Field | Value |
| --- | --- |
| Product | KitHub, a web-based inventory and borrowing system (Theme 2, Inventory and Borrowing System) |
| Course | CPE 334, Lab 6: independent user acceptance testing and defect management |
| Version | 1.0 |
| Date | 2026-11-19 |
| Product Team | Section 1, TH-037 "FREE ROBUX": Teerakarn Noiruksa (67070501062), Methipat Mansap (67070501071) |
| UAT Team | TH-051 "string a, b" (LECTRA) |
| Cases | [uat-cases.md](uat-cases.md): UAT-01 to UAT-06 |

## Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-19 | Teerakarn Noiruksa | First version: release under test, scope, accounts, data rules, deploy notice and how to report findings |

## 1. Release under test

| Item | Value |
| --- | --- |
| Application URL | <https://kithub-itgltxbgxa-as.a.run.app> |
| Accepted-for-test scope | The Sprint 1 contract released in tag `v0.1.0` (`d7cd8ea`): F-01 sign-in, sign-out and roles; F-02 catalog, borrow request, own request list and detail; F-03 pending list and checkout to an active loan |
| Deployed build under test | `main` at `55d3f55`, [Deploy demo run 43467354416](https://github.com/RBKarnz/CPE334_KitHub/actions/runs/43467354416), Cloud Run revision `kithub-00008-vbq`, image digest `sha256:9457fb3352f4fe7b16d5ce603a6dea7a65b708f20b0d890d7000fe92bdae3f45` |
| Why the build is newer than the tag | Since `v0.1.0`, `main` added the Lab 5 delivery files (Docker, CI, deploy) and two changes that touch no Sprint 1 rule: a tagline under the unchanged sign-in heading (#56) and a `db` field in `/api/ready`. `git diff v0.1.0 55d3f55 -- server/src client/src` changes only `client/src/pages/LoginPage.tsx` and `server/src/core/health.routes.ts`. No Sprint 2 feature is deployed |
| Out of scope (Sprint 2 or 3, not defects) | Approve or reject, cancel, return, several units per request, the borrowing limit, overdue status, loan or history screens, choosing a loan length, self-registration, password reset. The full list is in [manual-test-guide.md section 5](../../sprints/sprint-1/manual-test-guide.md#5-known-sprint-1-limitations) |

## 2. Accounts

Passwords are sent privately by Teerakarn Noiruksa to Thanawat Suntarawattana (UAT Team), by direct message only. They are never written in this file, an Issue, a chat group or a screenshot.

| Username | Display name | Role | Used in |
| --- | --- | --- | --- |
| `borrower1` | Borrower One | Borrower | UAT-03, UAT-06 |
| `borrower2` | Borrower Two | Borrower | UAT-01, UAT-02, UAT-04, UAT-05 |
| `custodian1` | Custodian One | Custodian | UAT-01, UAT-03, UAT-04, UAT-05 |
| `custodian2` | Custodian Two | Custodian | UAT-04 |

## 3. Data setup, reset and cleanup

| Item | Value |
| --- | --- |
| Data | Synthetic seed: 6 categories, 9 item types, 38 units. The database is shared with earlier work, so it is not fresh |
| Available counts at handoff | ESP32 DevKitC 4, HC-SR04 ultrasonic sensor 6, Digital multimeter 3, Oscilloscope 0 ("None available"), seen as `custodian1` on 2026-11-19 before the UAT Team started |
| Do not touch | **Request #1** (`borrower1`, USB-A to USB-B cable, Pending) is evidence for Lab 5. Never check it out |
| Reset | None. Clearing the history table would also delete Request #1, so the database is not reset between rounds |
| Cleanup | Sprint 1 has no cancel or return, so your requests and loans stay; they are synthetic. One full run uses 1 ESP32 DevKitC, 1 HC-SR04 ultrasonic sensor and 1 Digital multimeter unit |
| Low data | If a precondition count is 0, mark the case BLOCKED and message us; we will name another item type |
| Order | UAT-06, 01, 02, 03, 04, 05 ([uat-cases.md section 2](uat-cases.md#2-case-index-and-run-order)) |

## 4. Changes during testing

We do not deploy while you test. Please tell us by Discord direct message when you start and finish a session. Any deploy that could affect testing is announced there at least 2 hours before, with the new commit and revision. After a deploy we send the new version and the cases to rerun.

## 5. Reporting findings

Open an Issue at <https://github.com/RBKarnz/CPE334_KitHub/issues> titled `[UAT] <short summary>` with the text below, and send the link by Discord direct message. Questions go the same way. We reply to each Issue with a classification (accepted defect, duplicate, not-defect or enhancement) and the reason.

```markdown
Reporter: <name>, UAT Team TH-051
Date and time (ICT): <...>
Tested version: <commit>, <revision>, https://kithub-itgltxbgxa-as.a.run.app
Linked case / requirement: <UAT-0x step n> / <AC-xx>
Preconditions and data: <account and role, request numbers>

Steps to reproduce:
1. ...

Expected result: ...
Actual result: ...

Severity: <Critical | Major | Minor>, because <user impact>
Evidence: <screenshot with the time and URL visible; no password>
```

| Severity | Meaning for the user |
| --- | --- |
| Critical | Private data leaks, a forbidden action succeeds, data is lost, or the main journey cannot be done |
| Major | A Sprint 1 acceptance criterion or business rule fails, but other journeys still work |
| Minor | Wording, layout or a small detail differs; no rule is broken and the user can still finish |

## 6. Contacts

| Who | Discord | GitHub | Role in Lab 6 |
| --- | --- | --- | --- |
| Teerakarn Noiruksa | `_rbkz` | `RBKarnz` | Accounts and passwords, deploys |
| Methipat Mansap | `studypurpose_1` | `Bobbie-CPE38` | Cases and triage |

Chat: Discord direct messages between the two teams (no group channel).
