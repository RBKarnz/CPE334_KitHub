// State transitions of SRS section 8 (contract F-03 3.2). Stub for the failing tests of #19; implemented next.
export type TransitionEntity = "REQUEST" | "UNIT" | "LOAN";

export function assertTransition(_entity: TransitionEntity, _from: string | null, _to: string): void {
  throw new Error("assertTransition is not implemented yet (#19)");
}
