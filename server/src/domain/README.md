# server/src/domain

Pure business rules with no database or HTTP code (SDS 3.5): the state transition table for SRS section 8 (`transitions.ts`), due-date calculation and availability formulas. Services call these functions; unit tests cover them without a database.

Empty in the project skeleton (#13). The feature contracts in `docs/sprints/sprint-1/` specify the rules, and their implementation issues add the code here.
