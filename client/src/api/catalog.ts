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

export const fetchCategories = () => apiFetch<{ items: CatalogCategory[] }>("/categories").then((r) => r.items);
