# Lab 7: engineering metrics (Part C) and release readiness (Part D)

| Field | Value |
| --- | --- |
| Change | #71, due date at 17:00 ICT on a business day with a 16:00 checkout cutoff (D-21) |
| Repository | https://github.com/RBKarnz/CPE334_KitHub |
| Deployed release | `main` `6ada56d` (release PR #89), Deploy demo run 45630366597, Cloud Run revision `kithub-00010-slp` (100% traffic), image digest `sha256:825e7962fff33d6f6c71f3ef6b6880dcd659e6a549fb03dc4f706fe2b5f57803`, https://kithub-itgltxbgxa-as.a.run.app |
| Accepted Sprint 1 baseline | tag `v0.1.0` = `d7cd8ea`; accepted by UAT on `main` `495142e` (`kithub-00009-6dr`, Lab 6) |
| Pre-change implementation | `main` `495142e` |
| Snapshot | 2026-11-26 00:43 ICT (2026-11-25T17:43Z) |
| Observation window (M1, M2, M5) | 25 Nov 2026, 00:00 to 24:00 ICT = `2026-11-24T17:00Z` to `2026-11-25T17:00Z`: the day #71 was specified, implemented, released and checked |
| Status | Draft by Teerakarn Noiruksa for review by Methipat Mansap; the retrospective answers (D.3) are the team's to confirm |

## Part C. Five metrics

Each source list is in `evidence/metrics/` with its command and snapshot time, so the values can be reconciled without opening GitHub.

| ID | Metric | Definition and scope | Window or snapshot | Value | Source |
| --- | --- | --- | --- | --- | --- |
| M1 | Completed Issues | Issues of this repository closed as completed in the window. Duplicates or cancelled work would be counted apart; there were none (both `stateReason` = `COMPLETED`) | 25 Nov ICT | **2**: #64 (Lab 6 Part B, closed 15:15 ICT), #71 (Lab 7 change, closed 21:27 ICT) | `metrics/m1-issues.txt` |
| M2 | Merged PRs | PRs merged in the window, by target branch | 25 Nov ICT | **12**: 11 into `staging` (#72, #80 to #88, #90), 1 into `main` (#89) | `metrics/m2-prs.txt` |
| M3 | Automated test results | Passed / failed / skipped of the `test-and-docker` job inside Deploy demo run 45630366597, on the deployed commit `main` `6ada56d` | Run of 25 Nov 21:06 to 21:07 ICT | Server (Vitest, 27 files): **185 / 0 / 0**. Client (Vitest, 5 files): **42 / 0 / 0**. E2E (Playwright): **4 / 0 / 0** | `metrics/m3-tests.txt` |
| M4 | UAT defect status | Issues labelled `uat-finding`. Resolved = fix merged into `main`, deployed, and the reporting team's retest passed, then the Issue closed | Status at the snapshot | **1 opened, 1 resolved, 0 open** (all time). #68 opened 24 Nov 01:25 ICT, closed 24 Nov 19:48 ICT. None opened or resolved in the M1/M2 window | `metrics/m4-uat-defects.txt`; retest in the Lab 6 report |
| M5 | CI run outcomes | Runs of `ci-docker.yml` (all branches, all from `pull_request`) created in the window; Deploy demo (`deploy.yml`) counted apart | 25 Nov ICT | `ci-docker.yml`: **34 runs: 30 success, 0 failure, 4 cancelled** (4 / 34 = 11.8%). Each cancelled run was replaced seconds later by a run on a newer commit of the same branch (45616730635, 45618486626, 45620797106, 45628685666). `deploy.yml`: **1 run, 1 success** (45630366597) | `metrics/m5-ci-runs.txt` |

Two values to reconcile in the PDF: M2's 12 rows are listed in `m2-prs.txt`; M5's 30 / 0 / 4 are the `conclusion` column of `m5-ci-runs.txt`.

### C.2 Interpretation (at most 100 words)

The values are healthy: 0 failed tests (M3), 0 failed CI runs (M5), 0 open UAT defects (M4). The risk they show is concentration: 7 of the 12 PRs in M2 were merged within 7 minutes (13:07 to 13:14 UTC), and the D-21 rule reaches the browser through only one of 4 E2E tests (TEST-30). F-07 (#77) replaces the Sprint 1 checkout that TEST-30 uses. Action: Teerakarn keeps TEST-30's 17:00 business-day assertion and reruns TEST-54 to TEST-59 in the F-07 PR before the Sprint 2 release on 28 Nov, recording the counts as in M3.

(98 words.)

## Part D. Release readiness for the maintained Sprint 1 scope

### D.1 Checklist

| Item | Status at the snapshot | Evidence |
| --- | --- | --- |
| Submitted and deployed version | `main` `6ada56d`, revision `kithub-00010-slp`, digest `sha256:825e7962…7803` | Deploy demo run 45630366597; #71 comment |
| Defects by severity and status | UAT: #68 (major, BR-04 duplicate open request) resolved and closed 24 Nov. No open defect of any severity in the Sprint 1 scope | M4 |
| Automated tests on the deployed commit | Server 185 / 0 / 0, client 42 / 0 / 0, E2E 4 / 0 / 0 (passed / failed / skipped) | M3 |
| Changed behaviour, test-first | RED `e08dbb2` (server 22 failed, client 2 failed, all assertions), GREEN `b1898d5` | `evidence/red-*.txt`, `evidence/green-*.txt`, `evidence/regression-summary.md` |
| Selected user checks on production (manual) | 5 of 5 passed: preview and stored due date Thu 10 Dec 17:00 (Request #7), Request #5 keeps 8 Dec 22:07, `403` for a Borrower and `401` without a session on the preview, the Borrower → Custodian → Borrower journey | `evidence/postdeploy/` |
| Failed or skipped checks | Smoke test login step `SKIP` (no smoke credentials configured, `deployment.md` 7.4). No failed check | Deploy demo run log |
| Technical debt | 3 items, D.2 | - |
| Configuration and secrets | No new variable or secret for #71. `SEED_DEMO_REQUESTS` (#73) is not set in Deploy demo, so production has no demo requests. No secret in Git or in the evidence | `change-71.md` "deployment and configuration" row; seed log line in run 45630366597 |
| Documentation and run instructions | SRS v1.4 (D-21), SDS v1.9, F-03 contract v1.3, `change-71.md`, manual test guide MT-12 to MT-14 updated before code. README run instructions unchanged and still valid. One wrong statement found and corrected: "E2E is not run by CI" (`evidence/regression-summary.md`, correction) | PR #72, this PR |
| Deployment and smoke | Deploy demo success; migration `kithub-migrate-99gw2` completed; smoke `/api/health`, `/api/ready`, `/`, `/api/categories` PASS | Run 45630366597 |
| Later-sprint changes in the same release | Sprint 2 migration `20261125104833_sprint2_columns` (nullable columns, no Sprint 1 code reads them), demo-request seed behind a flag, Sprint 2 contracts and docs. They are not Lab 7 evidence | Release PR #89 body |

**Decision: READY** for the maintained Sprint 1 scope: the approved D-21 change works on the deployed revision, and the previously accepted Sprint 1 behaviour (request rules with the #68 fix, checkout, roles and access, history, persistence) passes its regression suites and the post-deploy journey. This is not a statement that Sprints 2 and 3 are complete.

Outstanding items (do not block READY):

| Item | Owner | Action |
| --- | --- | --- |
| Smoke login step is skipped | Teerakarn | Add a dedicated smoke Borrower and the `SMOKE_USERNAME` / `SMOKE_PASSWORD` secrets before the final release, or record the decision to keep it skipped |
| Request #7 and KH-ARD-0001 are on loan on production (post-deploy check data) | Teerakarn | Return them with F-08 once it is released |

### D.2 Technical debt

| Item | Impact | Priority | Disposition / action |
| --- | --- | --- | --- |
| No smoke-test sign-in: a deploy can pass smoke while sign-in is broken | A broken login would be found only by users or the next E2E run | Medium | Smoke credentials before Final Delivery (owner Teerakarn) |
| D-21 is checked in the browser only by TEST-30's range assertion (14 to 17 days, 17:00, Mon to Fri) | A wrong day inside the range would not fail E2E; the unit and API tests (TEST-54 to TEST-59) carry the exact values | Low | Keep as is; F-07 must keep the assertion (C.2) |
| Holidays are not business days in D-21 (Mon to Fri only) | A loan can fall due on a public holiday | Low | Accepted scope of #71 (`change-71.md`); a holiday calendar would be a new change request |

### D.3 Retrospective (draft for the team)

| Question | Answer |
| --- | --- |
| What helped? | Writing the impact table, the contract and every expected due date before code, checked against a small reference implementation, meant the RED run failed only where expected and GREEN needed no test changes. |
| What hurt? | Evidence was re-recorded after the fact and one claim ("E2E is not run by CI") was wrong until we read the workflow; parallel docs PRs also conflicted on the same `traceability.md` rows. |
| What will change for the final release? | Save the RED/GREEN output into the repository in the same PR as the commits, check a claim against the workflow or log before writing it, and merge one docs PR at a time for shared files. |
