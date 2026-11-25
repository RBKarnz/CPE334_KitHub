// Units of an item type and the due-date preview, for the checkout dialog (contract F-03 5.2, 5.5).
// Custodian only.
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

export interface DueDatePreview {
  itemTypeId: number;
  maxLoanDays: number;
  /** The server time the preview used. */
  at: string;
  /** The due date a checkout at `at` would get (D-21). */
  dueAt: string;
}

/** GET /item-types/:id/due-date-preview (contract F-03 5.5, #71). */
export const fetchDueDatePreview = (itemTypeId: number) =>
  apiFetch<DueDatePreview>(`/item-types/${itemTypeId}/due-date-preview`);
