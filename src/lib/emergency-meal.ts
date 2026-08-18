export type MealType = "breakfast" | "lunch" | "dinner";

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
};

/** 急な欠食・臨時喫食の連絡は昼食に集中するため、時間帯に関わらず常に昼食を既定にする。 */
export function defaultEmergencyMeals(): MealType[] {
  return ["lunch"];
}

export function isGhGroupName(shortName: string): boolean {
  return shortName.includes("GH");
}

const MEAL_FORM_LABELS: Record<string, string> = {
  kizami: "キ",
  diet: "ダ",
  araimiji: "粗",
  chomiji: "超",
};
const MEAL_FORM_ORDER = ["kizami", "diet", "araimiji", "chomiji"];

export const MEAL_FORM_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "kizami", label: "刻み食" },
  { code: "diet", label: "ダイエット食" },
  { code: "araimiji", label: "粗みじん食" },
  { code: "chomiji", label: "超みじん食" },
];

export function mealFormSuffix(mealForm: string[] | null | undefined): string {
  if (!mealForm || mealForm.length === 0) return "";
  const sorted = [...mealForm].sort(
    (a, b) => MEAL_FORM_ORDER.indexOf(a) - MEAL_FORM_ORDER.indexOf(b),
  );
  const labels = sorted.map((c) => MEAL_FORM_LABELS[c] ?? "").join("");
  return labels ? `(${labels})` : "";
}
