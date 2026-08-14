export type MealType = "breakfast" | "lunch" | "dinner";

export type BoardGroup = {
  group_id: string;
  short_name: string;
  enrolled_count: number;
  actual_count: number;
  is_overridden: boolean;
  absent_names: string[];
  extra_names: string[];
  present_names: string[];
};

export type BoardMeal = {
  meal: MealType;
  groups: BoardGroup[];
  resident_total: number;
  staff_count: number;
  visitor_count: number;
  cooking_total: number;
};

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
};

export function isGhGroup(shortName: string): boolean {
  return shortName.includes("GH");
}
