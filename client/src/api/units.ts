// Units of an item type (contract F-03 5.2). Stub for the failing UI tests of #19; implemented next.
export type UnitStatus = "AVAILABLE" | "ON_LOAN" | "MAINTENANCE" | "RETIRED";

export interface UnitSummary {
  id: number;
  assetTag: string;
  status: UnitStatus;
}

export const fetchUnits = (_itemTypeId: number, _status?: UnitStatus): Promise<UnitSummary[]> =>
  Promise.reject(new Error("fetchUnits is not implemented yet (#19)"));
