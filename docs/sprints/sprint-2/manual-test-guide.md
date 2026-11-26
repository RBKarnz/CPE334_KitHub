# Sprint 2 Manual Test Guide (my part: F-06, F-07, F-08)

| Field | Value |
| --- | --- |
| Covers | F-06 approve and reject, All requests and history; F-07 checkout of approved requests with several units, loan lists; F-08 return all and early return. F-04, F-05 and F-09 scenarios are added by their PRs |
| Replaces | Sprint 1 guide MT-11, MT-12, MT-14 and MT-15, whose checkout of a `PENDING` request no longer exists (F07-D1). MT-01 to MT-10, MT-13, MT-16 and MT-17 still apply; see section 5 |
| Expected results from | Contracts F-06 v1.1, F-07 v1.0, F-08 v1.1 and the UI texts asserted by TEST-25, TEST-49, TEST-88, TEST-89, TEST-101 and TEST-109 |
| Walkthrough | Automated browser walkthrough of MT-20 to MT-30, 26 Nov 2026 03:39 ICT, on `feature/78-returns` `7650522` (F-06, F-07 and F-08 code), demo seed with `SEED_DEMO_REQUESTS`: all as expected. Script `e2e/sprint2-walkthrough.spec.ts` (Playwright, Chromium, built app, `kithub_test`); screenshots in `img/mt/`. A manual walkthrough by a person adds its own date and results in the "Actual result" column |
| Time needed | About 20 minutes |

**MT scenarios are manual checks.** They supplement the automated tests (TEST-xx); section 6 maps each scenario to its tests.

## 1. Start from zero

Follow the [Sprint 1 guide](../sprint-1/manual-test-guide.md) section 1, with one addition in `server/.env`:

| Variable | What to put |
| --- | --- |
| `SEED_DEMO_DATA` | `true` (Borrower accounts) |
| `SEED_DEMO_REQUESTS` | `true`, so the seed adds one request in each Sprint 2 state (#73). It needs `SEED_DEMO_DATA=true` and adds requests only to a database that has none |

Then reset to a fresh demo (`npx prisma migrate reset` in `server/`, answer `y`) and start the server and client.

Never set `SEED_DEMO_REQUESTS` for production. Deploy demo does not set it.

## 2. Accounts and demo requests

Accounts as the Sprint 1 guide section 2. On a fresh database the demo requests are numbered in this order (otherwise identify them by Borrower and item type):

| # | Borrower | State | Items | Loan length | Note |
| --- | --- | --- | --- | --- | --- |
| 1 | `borrower1` | Pending | Arduino Uno R3 × 2, HC-SR04 ultrasonic sensor × 1 | 7 days | Used for approve, multi-unit checkout and return all |
| 2 | `borrower2` | Approved | ESP32 DevKitC × 1 | 14 days | Ready for checkout from the start |
| 3 | `borrower2` | Rejected | Raspberry Pi 4 Model B × 1 | 14 days | Reason "All Raspberry Pi units are booked for the IoT workshop this week." |
| 4 | `borrower1` | Cancelled | Digital multimeter × 1 | 3 days | - |
| 5 | `borrower1` | Checked out | DHT22 temperature and humidity sensor × 2 (`KH-DHT-0001`, `KH-DHT-0002`) | 14 days | Used for early returns |
| 6 | `borrower2` | Returned | Transistor kit (2N2222 ×4) × 1 (`KH-TRK-0001`) | 7 days | Shows on Loans → Returned |

All demo times are a few hours to a few days before the moment the seed ran.

## 3. What changed on screen

| Role | Lands on | Links |
| --- | --- | --- |
| Borrower | Catalog | Catalog, My requests, My loans |
| Custodian | Ready for checkout | Ready for checkout, All requests, Loans, Catalog |

- **Ready for checkout** (`/pending`, was Pending requests): `APPROVED` requests, oldest first, with items, loan length and approval time. `PENDING` requests are decided on All requests.
- **All requests** (`/requests` for a Custodian; a Borrower still gets My requests there): every request with a State filter.
- **Request detail**: loan length; the decision ("Approved by Custodian One, …" for a Custodian, "Approved …" without the name for the Borrower); **Approve** and **Reject** on a `PENDING` request; **Return all** and **Return this unit** on a `CHECKED_OUT` request; a History table for Custodians.
- **Checkout dialog**: one section per line ("Arduino Uno R3 — choose 2 of 5 available") with checkboxes; the confirm button counts the units.
- **My loans / Loans** (`/loans`): loans earliest due first; the Custodian view adds the Borrower and an Active / Returned filter.

## 4. Test scenarios

Run in order on a fresh demo database (section 1). Write "As expected" or what differed in **Actual result**.

| ID | Feature / AC | Role | Starting conditions | Steps | Expected result | Actual result |
| --- | --- | --- | --- | --- | --- | --- |
| MT-20 | F-06 / AC-80, AC-88 | Custodian | Fresh demo; sign in as `custodian1` | Note the landing page; open **All requests**; set State to `APPROVED`; set it back to All states | Lands on **Ready for checkout** listing Request #2 only. All requests shows the six requests oldest first, which is #6, #5, #4, #3, #2, #1 because the demo requests are dated back from the seed time (section 2), each with Borrower, items, state badge and creation time. With `APPROVED`: only #2. While a filter loads, "Loading…" replaces the rows | As expected, automated walkthrough ([screenshot](img/mt/mt-20-all-requests.png)) |
| MT-21 | F-06 / AC-81 | Custodian | As MT-20 | Open Request #3 | "Rejected by Custodian One, *[time]*" and "Reason: All Raspberry Pi units are booked for the IoT workshop this week."; History lists "Created" and "Request PENDING → REJECTED" with times and names; no Approve or Reject button | As expected, automated walkthrough ([screenshot](img/mt/mt-21-rejected-request.png)) |
| MT-22 | F-06 / AC-82, AC-89 | Custodian | As MT-20 | Open Request #1; press **Approve**; read the dialog; press Escape; press **Approve** again and confirm | Approve and Reject are shown; "Loan length: 7 days". The dialog asks "Approve Request #1 for Borrower One?"; Escape closes it with nothing changed. After confirming: "Request #1 approved.", the state is Approved, "Approved by Custodian One, *[time]*", History ends with "Request PENDING → APPROVED"; the buttons are gone | As expected, automated walkthrough ([screenshot](img/mt/mt-22-approved.png)) |
| MT-23 | F-06 / AC-83, AC-84, AC-89 | Borrower, then Custodian, then Borrower | As MT-22 | As `borrower2`, press **Request** on **Digital multimeter** in the Catalog, then **Submit request** on the new request form (Request #7; F-04 F04-D5). As `custodian1`, open Request #7, press **Reject**, type only spaces, then "Only one multimeter left for the lab session."; confirm. As `borrower2`, open Request #7 | The confirm button "Reject Request #7" stays disabled for spaces and is enabled with text; counter "n/500". "Request #7 rejected." As `borrower2`: Rejected, "Rejected *[time]*" without a Custodian name, "Reason: Only one multimeter left for the lab session.", no Approve or Reject button | As expected, automated walkthrough ([screenshot](img/mt/mt-23-borrower-sees-the-reason.png)) |
| MT-24 | F-07 / AC-90, AC-91, AC-101 | Custodian | Request #1 approved (MT-22) | Open **Ready for checkout**; press **Check out** on Request #1; pick one Arduino unit, then a second, then look at the other Arduino boxes; pick one HC-SR04 unit; confirm | Rows #1 and #2 with items, "7 days" and approval time. The dialog has "Arduino Uno R3 — choose 2 of 5 available" and "HC-SR04 ultrasonic sensor — choose 1 of 6 available", and "Due if checked out now: *[weekday date]*, 17:00" for 7 days (D-21). The confirm button reads "Check out" until 2 + 1 are picked, then "Check out 3 units for Request #1"; with 2 Arduinos picked the other Arduino boxes are disabled. After confirming: "Request #1 checked out: *[three asset tags]*, due *[the previewed date]*, 17:00"; #1 leaves the list | As expected, automated walkthrough ([screenshot](img/mt/mt-24-checkout-dialog.png)) |
| MT-25 | F-07 / AC-92, AC-95 (UI) | Custodian | As MT-24 | Open Request #4 (Cancelled) and Request #3 (Rejected) | Neither appears on Ready for checkout, and their detail pages show no Check out, Approve or Return control. (A checkout of a request that is not `APPROVED` is refused with `409`, TEST-92) | As expected, automated walkthrough |
| MT-26 | F-07 / AC-98, AC-99 | Borrower, then Custodian | After MT-24 | As `borrower1` open **My loans**. As `custodian1` open **Loans**; set Show to Returned | `borrower1`: the two DHT22 loans and the three loans of Request #1, earliest due first, each with item type, asset tag, request link, checkout time and due date; no Borrower column. `custodian1`: every active loan with the Borrower; Returned shows `KH-TRK-0001` of Request #6 | As expected, automated walkthrough ([screenshot](img/mt/mt-26-my-loans.png)) |
| MT-27 | F-08 / AC-105, AC-109 | Custodian | As MT-26 | Open Request #5; press **Return this unit** next to `KH-DHT-0001`; keep Good; confirm | The dialog "Return KH-DHT-0001" has Good selected. "KH-DHT-0001 returned."; the loan row shows "Returned *[time]* · Good"; the request stays Checked out with Return this unit only next to `KH-DHT-0002` | As expected, automated walkthrough ([screenshot](img/mt/mt-27-early-return.png)) |
| MT-28 | F-08 / AC-102, AC-103 | Custodian | After MT-24 | Open Request #1; press **Return all**; set the second Arduino to Damaged; confirm; open **Catalog** | The dialog "Return Request #1" lists the three units, all Good; the button reads "Return 3 units". After confirming: "Request #1 returned: 2 good, 1 damaged (*[asset tag]* sent to maintenance)."; the request is Returned. In the Catalog, Arduino Uno R3 shows "4 available" (5 before MT-24; the damaged unit is in maintenance) and HC-SR04 ultrasonic sensor "6 available" again | As expected, automated walkthrough ([screenshot](img/mt/mt-28-return-all.png)) |
| MT-29 | F-08 / AC-105 | Custodian | After MT-27 | Open Request #5; **Return this unit** next to `KH-DHT-0002`; choose Damaged; confirm | "KH-DHT-0002 returned. Request #5 returned."; the request is Returned; the loan row shows "· Damaged" | As expected, automated walkthrough |
| MT-30 | F-06, F-07, F-08 / AC-87, AC-100, AC-109 | Borrower | Signed in as `borrower1` | Open `/pending`; open Request #1 and Request #5; open `/requests` | `/pending`: Forbidden. The request pages show the state, decision time and loans, but no Approve, Reject, Check out or Return control and no History. `/requests` is My requests with no State filter. (The API refuses a Borrower with `403` on approve, reject, checkout and both returns: TEST-87, TEST-100, TEST-109) | As expected, automated walkthrough ([screenshot](img/mt/mt-30-borrower-view.png)) |

## 5. Sprint 1 scenarios after Sprint 2

| Sprint 1 MT | Status |
| --- | --- |
| MT-01 to MT-10 | Still valid. MT-09: `/pending` is now Ready for checkout and still Forbidden for a Borrower |
| MT-11, MT-12, MT-14, MT-15 | Replaced by MT-20 to MT-24: a Custodian approves first and checks out on Ready for checkout; the two-Custodian race of MT-15 is now TEST-96 and TEST-47 (automated) |
| MT-13 | Valid with MT-24's request: the count drops by the checked-out units, and the Borrower sees Checked out with the due date |
| MT-16, MT-17 | Valid; MT-16 (a) now shows "No approved requests." on Ready for checkout |

## 6. Automated tests behind each scenario

Every scenario is also run, in order, by `e2e/sprint2-walkthrough.spec.ts` (no TEST ID; it walks this guide, it does not add a rule).

| MT | Automated tests | E2E |
| --- | --- | --- |
| MT-20 | TEST-80, TEST-88 (`client/tests/AllRequestsPage.test.tsx`), TEST-25 | - |
| MT-21 | TEST-81 | - |
| MT-22 | TEST-82, TEST-89 (a), (b), (e) | TEST-30 (approve through the detail page) |
| MT-23 | TEST-83, TEST-84, TEST-89 (c), (f) | - |
| MT-24 | TEST-90, TEST-91, TEST-93, TEST-97, TEST-101 (a) to (c), TEST-49 | TEST-30 (checkout on Ready for checkout), TEST-53 |
| MT-25 | TEST-92, TEST-95 | - |
| MT-26 | TEST-98, TEST-99, TEST-101 (d) | - |
| MT-27, MT-29 | TEST-104, TEST-105, TEST-109 (UI) | - |
| MT-28 | TEST-102, TEST-103, TEST-109 (UI) | - |
| MT-30 | TEST-87, TEST-100, TEST-109 (API), TEST-88 (f) | TEST-32 |
