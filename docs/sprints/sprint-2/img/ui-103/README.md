# Sprint 2 screens after #103

Screenshots of every Sprint 2 screen after the style fix of #103, taken from `fix/103-sprint2-ui` (commit `b4e074c`):
- 21 screens at 1200 px wide
- 6 screens at 600 px wide

How they were taken:
- The client ran in Vite dev mode against a small local stand-in for `/api` that returns fixed data, because this computer has no usable PostgreSQL.
- Playwright (Chromium) took each screenshot at full page height.
- The data is made up for the screenshots: names, counts and dates follow the seed's style, but they are not production data.
- The stand-in is not part of the repository, and no test depends on these images.

File names: `b-` is a Borrower's view and `c-` a Custodian's, followed by the screen and the width.
