// Units of an item type, for the checkout dialog (contract F-03 5.2). Custodian only.
import { apiFetch } from "./client";

export type UnitStatus = "AVAILABLE" | "ON_LOAN" | "MAINTENANCE" | "RETIRED";

export interface UnitSummary {
  id: number;
  assetTag: string;
  status: UnitStatus;
}

/** Ordered by asset tag. Without `status`, every unit of the item type (F03-D8). */
export const fetchUnits = (itemTypeId: number, status?: UnitStatus) =>
  apiFetch<{ items: UnitSummary[] }>(
    `/item-types/${itemTypeId}/units${status ? `?status=${encodeURIComponent(status)}` : ""}`,
  ).then((r) => r.items);
