// The state transitions of SRS section 8, as data (SDS 3.5). Services call assertTransition
// before every state change, so an invalid transition is rejected the same way everywhere.
// Only the transitions the released sprint performs are listed (SDS 4.2); later sprints add rows.
import { ConflictError } from "../core/errors.js";

export type TransitionEntity = "REQUEST" | "UNIT" | "LOAN";

/** null as `from` means the record is created in the `to` state. */
const TRANSITIONS: Record<TransitionEntity, readonly (readonly [string | null, string])[]> = {
  REQUEST: [
    [null, "PENDING"], // SRS 8.2: a Borrower submits a request (F-02)
    ["PENDING", "CHECKED_OUT"], // SRS 8.2, Sprint 1 only: checkout by a Custodian (F-03)
  ],
  UNIT: [
    ["AVAILABLE", "ON_LOAN"], // SRS 8.1: checkout (F-03)
  ],
  LOAN: [
    [null, "ACTIVE"], // SRS 8.3: checkout of its unit (F-03)
  ],
};

/** 409 INVALID_STATE: the transition is not in SRS section 8 (DD-10). */
export class InvalidTransitionError extends ConflictError {
  constructor(entity: TransitionEntity, from: string | null, to: string) {
    super("INVALID_STATE", `A ${entity.toLowerCase()} cannot change from ${from ?? "(new)"} to ${to}.`);
  }
}

export function isAllowedTransition(entity: TransitionEntity, from: string | null, to: string): boolean {
  return TRANSITIONS[entity].some(([f, t]) => f === from && t === to);
}

/** Throws InvalidTransitionError unless `from → to` is an allowed transition of `entity`. */
export function assertTransition(entity: TransitionEntity, from: string | null, to: string): void {
  if (!isAllowedTransition(entity, from, to)) throw new InvalidTransitionError(entity, from, to);
}
