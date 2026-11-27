// Inventory summary report, Custodian only (contract F-14 5.1).
import { apiFetch } from "./client";

export interface InventoryCounts {
  available: number;
  onLoan: number;
  maintenance: number;
  retired: number;
  totalUnits: number;
  activeLoans: number;
  overdueRequests: number;
}

export interface InventoryRow extends InventoryCounts {
  itemType: { id: number; name: string };
  category: { id: number; name: string };
}

export interface InventoryReport {
  generatedAt: string;
  items: InventoryRow[];
  totals: InventoryCounts;
}

export const fetchInventoryReport = () => apiFetch<InventoryReport>("/reports/inventory");
