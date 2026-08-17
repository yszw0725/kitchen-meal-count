import type { MealType } from "@/lib/board-types";

export type ImportError = {
  row: number;
  column: string;
  value: string;
  message: string;
};

export type ParsedMenuItem = {
  date: string; // ISO yyyy-mm-dd
  meal: MealType;
  sortOrder: number;
  dishName: string;
};

export type ParseSuccess = {
  ok: true;
  items: ParsedMenuItem[];
};

export type ParseFailure = {
  ok: false;
  errors: ImportError[];
};

export type ParseResult = ParseSuccess | ParseFailure;
