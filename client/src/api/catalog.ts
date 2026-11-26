import { apiFetch } from "./client";

export interface CatalogItemType {
  id: number;
  name: string;
  description: string;
  isKit: boolean;
  maxLoanDays: number;
  maxQuantityPerRequest: number;
  availableCount: number;
}

export interface CatalogCategory {
  id: number;
  name: string;
  description: string | null;
  /** Copied to new item types in this category (D-08); added by F-09 (F09-D9). */
  defaultMaxLoanDays: number;
  defaultMaxQuantity: number;
  itemTypes: CatalogItemType[];
}

/** GET /api/item-types/:id (contract F-04 5.1, F04-D6): the catalog item plus its category. */
export interface ItemTypeDetail extends CatalogItemType {
  category: { id: number; name: string };
}

export const getItemType = (id: number) => apiFetch<ItemTypeDetail>(`/item-types/${id}`);

export const fetchCategories = () => apiFetch<{ items: CatalogCategory[] }>("/categories").then((r) => r.items);
