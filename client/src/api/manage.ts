// Catalog management for Custodians (contract F-09 5): categories, item types and units.
import type { CatalogCategory } from "./catalog";
import { apiFetch } from "./client";
import type { UnitStatus } from "./units";

/** A category without its item types (F09-D9). */
export type ManagedCategory = Omit<CatalogCategory, "itemTypes">;

export interface CategoryInput {
  name: string;
  description: string | null;
  defaultMaxLoanDays: number;
  defaultMaxQuantity: number;
}

/** The item type representation of F04-D6. */
export interface ManagedItemType {
  id: number;
  name: string;
  description: string;
  isKit: boolean;
  maxLoanDays: number;
  maxQuantityPerRequest: number;
  availableCount: number;
  category: { id: number; name: string };
}

export interface ItemTypeInput {
  categoryId: number;
  name: string;
  description: string;
  isKit: boolean;
  maxLoanDays: number;
  maxQuantityPerRequest: number;
}

export interface ManagedUnit {
  id: number;
  assetTag: string;
  status: UnitStatus;
  itemType: { id: number; name: string };
}

export const createCategory = (body: CategoryInput) =>
  apiFetch<ManagedCategory>("/categories", { method: "POST", body });

export const updateCategory = (id: number, body: Partial<CategoryInput>) =>
  apiFetch<ManagedCategory>(`/categories/${id}`, { method: "PATCH", body });

export const createItemType = (body: ItemTypeInput) =>
  apiFetch<ManagedItemType>("/item-types", { method: "POST", body });

export const updateItemType = (id: number, body: Partial<ItemTypeInput>) =>
  apiFetch<ManagedItemType>(`/item-types/${id}`, { method: "PATCH", body });

/** The asset tag is sent as typed; the server trims and upper-cases it (F09-D6). */
export const addUnit = (itemTypeId: number, assetTag: string) =>
  apiFetch<ManagedUnit>(`/item-types/${itemTypeId}/units`, { method: "POST", body: { assetTag } });

export const repairUnit = (unitId: number) => apiFetch<ManagedUnit>(`/units/${unitId}/repair`, { method: "POST", body: {} });

export const retireUnit = (unitId: number) => apiFetch<ManagedUnit>(`/units/${unitId}/retire`, { method: "POST", body: {} });
