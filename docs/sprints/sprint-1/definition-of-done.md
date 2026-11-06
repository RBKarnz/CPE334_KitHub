# KitHub: Product Definition of Done

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Date | 2026-11-06 |
| Authors | Teerakarn Noiruksa (67070501062), Methipat Mansap (67070501071) |
| Applies to | Every feature and system responsibility PR into `staging`, and every release PR into `main`, from Sprint 1 |

### Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-06 | Methipat Mansap | First version, created with the F-03 contract (#16) |

## 1. Done means all of the following

| # | Criterion | Evidence |
| --- | --- | --- |
| 1 | **Required behavior implemented.** Every acceptance criterion in the feature's merged contract works as specified, through the UI, the API and the database where the contract says so | The PR lists each AC with where it is implemented |
| 2 | **Planned verification executed.** Every test in the contract's STS exists and was run; manual checks are recorded as manual, not presented as automated | Test files and names match the STS; manual checks listed separately |
| 3 | **Meaningful tests passing.** The tests assert the expected outcome, including database state after rejections. None is disabled, skipped or weakened to pass. TDD tests show the failing run before the implementation and the passing run after | Test command, counts (passed, failed, skipped) and the tested commit SHA in the PR; red and green runs with their commit SHAs |
| 4 | **Review and integration complete.** The PR into `staging` is reviewed by the teammate, who records a specific check, question or finding. Authors do not approve their own PR. After merging, the tests pass on `staging` | GitHub review; test run on the `staging` merge commit |
| 5 | **Setup and documents current.** The README covers any new dependency, script, environment variable or setup step. The contract, `docs/features.md` and `docs/traceability.md` match the code; a change to the contract is a new version with its reason | README and document diffs, or "no change" stated in the PR |
| 6 | **Incomplete work disclosed.** Anything not done, any failing or skipped test, and any known limitation is listed in the PR and carried to the release notes | "Known limitations" section in the PR |
| 7 | **Completion shown by evidence.** Each criterion above is backed by a link, an output or a commit SHA that a reviewer can check. A statement by a team member or an AI tool that the work is done is not evidence | Links and outputs in the PR |
| 8 | **No secrets.** No password, token or real secret is in the code, tests, documents, screenshots or PR text | Reviewer check |

## 2. Release to `main`

A release is done when every feature in the sprint meets section 1, the integration and end-to-end tests pass on the release candidate commit on `staging`, the teammate has reviewed the release PR from `staging` into `main`, and the merge commit is tagged (for Sprint 1, `v0.1.0`) with the test results linked to that commit.
