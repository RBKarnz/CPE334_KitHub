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
  itemTypes: CatalogItemType[];
}

export const fetchCategories = () => apiFetch<{ items: CatalogCategory[] }>("/categories").then((r) => r.items);
