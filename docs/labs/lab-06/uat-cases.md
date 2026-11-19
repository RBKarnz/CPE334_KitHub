# KitHub Sprint 1 UAT Cases (Lab 6)

| Field | Value |
| --- | --- |
| Product | KitHub, a web-based inventory and borrowing system |
| Course | CPE 334, Lab 6: independent user acceptance testing and defect management |
| Version | 1.0 |
| Date | 2026-11-19 |
| Authors | Teerakarn Noiruksa (67070501062), Methipat Mansap (67070501071), Section 1, team TH-037 "FREE ROBUX" |
| UAT Team | TH-051 "string a, b" (LECTRA) |
| Scope | Sprint 1 contract of tag `v0.1.0`: [F-01](../../sprints/sprint-1/F-01-auth.md), [F-02](../../sprints/sprint-1/F-02-request.md), [F-03](../../sprints/sprint-1/F-03-checkout.md); AC IDs from [features.md](../../features.md) |
| Handoff | [handoff.md](handoff.md): URL, version under test, accounts, data rules and how to report findings |

## Revision history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 2026-11-19 | Teerakarn Noiruksa | First version: six cases UAT-01 to UAT-06 covering the four required categories, run order, recording template |

## 1. How to use these cases

- Run the cases in the order of section 2 on the URL and version named in [handoff.md](handoff.md). Every expected result can be checked on screen; no explanation from us is needed.
- Use desktop Chrome. Times on screen are Asia/Bangkok (ICT). The first page load can take up to 30 s while Cloud Run starts.
- `<URL>` below means `https://kithub-itgltxbgxa-as.a.run.app`.
- The database is shared and not fresh. Request numbers come from the success messages: write them down as R, S and T when a step asks you to. Available counts are compared before and after, never assumed.
- Passwords come through a private message. Never type them into a report, an Issue or a screenshot.
- Record what you actually see, using the template in section 4. A step that cannot be run is **BLOCKED** with the reason, not a pass.

## 2. Case index and run order

| ID | Category (Lab 6 handout 3.1) | Feature and acceptance criteria | Depends on | Units it uses |
| --- | --- | --- | --- | --- |
| UAT-06 | Supporting: sign-in rejection and sign-out | F-01 AC-01, AC-02, AC-03 | none | none |
| UAT-01 | **Normal domain journey** | F-01 AC-01; F-02 AC-08, AC-09, AC-13; F-03 AC-18, AC-19, AC-26, AC-49 | none | 1 ESP32 DevKitC |
| UAT-02 | **Business rule / boundary** | F-02 AC-10, AC-11, AC-40 (BR-01, BR-04) | none | none (creates request S) |
| UAT-03 | **Forbidden role / ownership** | F-01 AC-05, AC-06; F-02 AC-14, AC-15, AC-33, AC-39, AC-40 | R from UAT-01, S from UAT-02 | none |
| UAT-04 | **State / history / persistence** | F-03 AC-43, AC-47, AC-26; F-01 AC-03; NFR-06 | S from UAT-02 | 1 HC-SR04 ultrasonic sensor |
| UAT-05 | Business rule: loan length by category | F-03 AC-19; SRS D-08, D-16 | none | 1 Digital multimeter |

Run order: **UAT-06, UAT-01, UAT-02, UAT-03, UAT-04, UAT-05**. UAT-03 needs R and S; UAT-04 needs S. The other cases are independent. One tester drives at a time so that requests do not collide.

If a case stops halfway and leaves a Pending request (for example S), check it out as `custodian1` before you run the case again; otherwise the rerun shows the duplicate-request alert of UAT-02.

## 3. Cases

### UAT-06 Sign-in rejection and sign-out

| Field | Value |
| --- | --- |
| Reference | F-01 AC-01, AC-02, AC-03 (FR-01, FR-02, FR-03, NFR-04) |
| Purpose | Wrong credentials never start a session; sign-out ends it |
| Role | none, then Borrower (`borrower1`) |
| Preconditions | Signed out, at `<URL>/login` |
| Synthetic inputs | `borrower1` with the wrong password `wrong-pass-123`; the unknown user `nobody99` with any password |

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Enter `borrower1` and `wrong-pass-123`, press **Sign in** | "Username or password is incorrect."; the username stays, the password field is empty; still on the sign-in page |
| 2 | Enter `nobody99` and any password, press **Sign in** | The **same** message; nothing says that the user does not exist |
| 3 | Sign in as `borrower1` with the real password | Lands on Catalog; the navigation bar shows "Borrower One" and a "Borrower" badge |
| 4 | Press **Sign out**; then type `<URL>/catalog` in the address bar | The sign-in page opens; the catalog is not shown |

### UAT-01 Normal journey: request, checkout, see the loan

| Field | Value |
| --- | --- |
| Reference | F-01 AC-01; F-02 AC-08, AC-09, AC-13; F-03 AC-18, AC-19, AC-26, AC-49 (FR-04, FR-07, FR-08, FR-09, FR-16) |
| Purpose | A Borrower requests an item, a Custodian checks it out, and the Borrower sees the active loan |
| Roles | Borrower (`borrower2`), Custodian (`custodian1`) |
| Preconditions | ESP32 DevKitC shows at least 1 available; `borrower2` has no open ESP32 DevKitC request |
| Synthetic inputs | Item type "ESP32 DevKitC" (Microcontroller boards, 14-day loan) |

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Sign in as `borrower2` | Catalog; the bar shows "Borrower Two" and "Borrower" |
| 2 | Read the ESP32 DevKitC count; write it down as N | "N available", N ≥ 1 |
| 3 | Press **Request** on ESP32 DevKitC | "Request #R submitted." Write down R |
| 4 | Open **My requests** | Request #R at the top (newest first), **Pending**, "ESP32 DevKitC × 1" and its creation time |
| 5 | Open Request #R | The detail page shows Pending, the same line and the same time |
| 6 | Sign out; sign in as `custodian1` | Lands on **Pending requests**; a row for #R with Borrower Two, ESP32 DevKitC, quantity 1 and **Check out** |
| 7 | Press **Check out** on #R | The dialog says "Borrower Two (borrower2) · ESP32 DevKitC" and lists only `KH-ESP-…` units |
| 8 | Choose the first unit; write its asset tag down as U; look at the confirm button | The button reads "Check out U for Request #R" |
| 9 | Press the button | "Request #R checked out: U, due D" (D is checked in step 11); #R leaves the pending list |
| 10 | Open **Catalog** | ESP32 DevKitC shows N − 1 available |
| 11 | Sign out; sign in as `borrower2`; open My requests, then #R | **Checked out**; the detail shows unit U, "Checked out C" and "Due D", where D = C + 14 days at the same clock time |

### UAT-02 Business rules: no available unit, no duplicate open request

| Field | Value |
| --- | --- |
| Reference | F-02 AC-10, AC-11, AC-40 (BR-01, BR-04) |
| Purpose | An item type with 0 available cannot be requested; a Borrower holds at most one open request per item type |
| Role | Borrower (`borrower2`) |
| Preconditions | `borrower2` has no open HC-SR04 ultrasonic sensor request. If S from an earlier run is still Pending, first run UAT-04 steps 1 and 2 to check it out |
| Synthetic inputs | Item types "Oscilloscope" (its only unit is in maintenance, so 0 available) and "HC-SR04 ultrasonic sensor" |

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Signed in as `borrower2`, scroll to Instruments, then Oscilloscope | "None available"; the **Request** button is disabled, so nothing can be sent |
| 2 | Press **Request** on HC-SR04 ultrasonic sensor | "Request #S submitted." Write down S |
| 3 | Press **Request** on HC-SR04 ultrasonic sensor again | Alert "You already have an open request for HC-SR04 ultrasonic sensor (Request #S)." |
| 4 | Open **My requests** | Exactly one HC-SR04 ultrasonic sensor request (#S, Pending); no second one |
| 5 | Leave #S Pending | It is used in UAT-03 and UAT-04 |

### UAT-03 Forbidden role and another Borrower's data

| Field | Value |
| --- | --- |
| Reference | F-01 AC-05, AC-06; F-02 AC-14, AC-15, AC-33, AC-39, AC-40 (BR-05, BR-17, NFR-01, NFR-02) |
| Purpose | A signed-out user, a Borrower and a Custodian cannot reach what their role or ownership does not allow, and nothing leaks or changes |
| Roles | none, Borrower (`borrower1`), Custodian (`custodian1`) |
| Preconditions | R from UAT-01 (Checked out) and S from UAT-02 (Pending) exist and belong to `borrower2` |
| Synthetic inputs | R, S and the request ID `999999`, which does not exist |

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Signed out, open `<URL>/api/requests` | JSON with `"code": "UNAUTHENTICATED"` (status 401); no request data |
| 2 | Sign in as `borrower1`; open `<URL>/pending` | The Forbidden page: "You do not have permission to do this." |
| 3 | Open `<URL>/requests/R` (R from UAT-01) | "Request not found."; no item, unit, Borrower or due date is shown |
| 4 | Open `<URL>/api/requests/R` | JSON 404 with `"code": "NOT_FOUND"` and the message "Request R does not exist."; no other field |
| 5 | Open `<URL>/api/requests/999999` | The same form as step 4 with 999999, so another Borrower's request cannot be told apart from a missing one |
| 6 | Open **My requests** | Neither #R nor #S is listed |
| 7 | DevTools, Console: paste `fetch('/api/requests/S/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({units:[{lineId:1,unitId:1}]})}).then(r=>r.json().then(b=>console.log(r.status,b)))` with S replaced by its number | `403` with `"code": "FORBIDDEN"`: a Borrower cannot check out |
| 8 | Sign out; sign in as `custodian1`; open **Catalog** | Counts are shown, with **no Request buttons** |
| 9 | Still as `custodian1`, DevTools, Console: paste `fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lines:[{itemTypeId:1,quantity:1}]})}).then(r=>r.json().then(b=>console.log(r.status,b)))`; then reload **Pending requests** | `403` with `"code": "FORBIDDEN"`; no new request from Custodian One appears: a Custodian cannot create a request |
| 10 | Look at **Pending requests**, then open `<URL>/requests/R` | #S is still Pending; #R is still Checked out with unit U and due D from UAT-01: nothing changed |

### UAT-04 State: one checkout only, and the state is kept

| Field | Value |
| --- | --- |
| Reference | F-03 AC-43, AC-47, AC-26; F-01 AC-03; NFR-06 |
| Purpose | Two Custodians cannot both check out one request, and the result persists |
| Roles | Custodian (`custodian1` in window A), Custodian (`custodian2` in private window B), Borrower (`borrower2`) |
| Preconditions | S (HC-SR04 ultrasonic sensor, `borrower2`) is Pending; HC-SR04 ultrasonic sensor shows M available, M ≥ 2 |
| Synthetic inputs | Request S and two different HC-SR04 units |

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Window A: sign in as `custodian1`. Window B (private window): sign in as `custodian2`. In both, open Pending requests and press **Check out** on #S | Both dialogs list `KH-SR04-…` units |
| 2 | Window A: choose a unit; write its asset tag down as V; confirm | "Request #S checked out: V, due …" (14 days) |
| 3 | Window B: choose a **different** unit; confirm | The dialog stays open with the alert "Request #S cannot be checked out because it is CHECKED_OUT, not PENDING."; the list behind it reloads without #S |
| 4 | Window B: open Catalog | HC-SR04 ultrasonic sensor shows M − 1: only one unit went on loan |
| 5 | Window B: open `<URL>/requests/S` | Checked out with unit V only |
| 6 | Window A: press **Sign out**, then the browser **Back** button, then reload | The sign-in page; the old session no longer works |
| 7 | In the retest session (another day, after any redeploy), or at the end of the first session if there is no retest: sign in as `borrower2` and open #R and #S | Both are still Checked out with units U and V and the same due dates. Record the revision that is running at that time. If this is done in the first session, it shows persistence across sign-out and a new session, not across a redeploy |

### UAT-05 Instruments have a 3-day loan

| Field | Value |
| --- | --- |
| Reference | F-03 AC-19; SRS D-08, D-16 |
| Purpose | Due date = checkout time + the item type's maximum loan length: 3 days for Instruments, 14 days for the other categories |
| Roles | Borrower (`borrower2`), Custodian (`custodian1`) |
| Preconditions | Digital multimeter shows at least 1 available; `borrower2` has no open Digital multimeter request |
| Synthetic inputs | Item type "Digital multimeter" (Instruments) |

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | As `borrower2`, press **Request** on Digital multimeter | "Request #T submitted." Write down T |
| 2 | Sign out; sign in as `custodian1`; check out #T with any `KH-DMM-…` unit | "Request #T checked out: …, due D" |
| 3 | Open `<URL>/requests/T` | The detail shows "Checked out C" and "Due D", where D = C + 3 days at the same clock time (for example C = 19 Nov 2026 14:00 gives D = 22 Nov 2026 14:00); not 14 days |

## 4. Recording template for the UAT Team

One row per case run. Write what the screen showed, not the expected text.

| Case ID | Tester (team) | Date and time (ICT) | Tested version (commit, revision) | Inputs used (R, S, T, U, V, N, M) | Actual result | Result (PASS / FAIL / BLOCKED) | Evidence ID | Issue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UAT-06 |  |  |  |  |  |  |  |  |
| UAT-01 |  |  |  |  |  |  |  |  |
| UAT-02 |  |  |  |  |  |  |  |  |
| UAT-03 |  |  |  |  |  |  |  |  |
| UAT-04 |  |  |  |  |  |  |  |  |
| UAT-05 |  |  |  |  |  |  |  |  |

For a rejected operation (UAT-02 step 3, UAT-03, UAT-04 step 3), keep two pieces of evidence: the rejection, and the protected record afterwards showing that it did not change.
