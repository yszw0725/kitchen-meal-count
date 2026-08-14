export type MealType = "breakfast" | "lunch" | "dinner";

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
};

// 妥当な時間帯の閾値(提案): 各食の提供が一段落する時刻を「提供済み」の境界とする。
// これより前なら「まだ提供前」として自動選択の対象にする。
const MEAL_CUTOFF_MINUTES: Record<MealType, number> = {
  breakfast: 8 * 60 + 30, // 08:30
  lunch: 13 * 60 + 30, // 13:30
  dinner: 19 * 60 + 30, // 19:30
};

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

export function nowMinutesInTokyo(): number {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const tokyo = new Date(utcMs + 9 * 60 * 60000);
  return tokyo.getHours() * 60 + tokyo.getMinutes();
}

/** まだ提供前の食事区分を返す。全て提供済みの時間帯なら夕食のみを既定にする (未選択状態を避けるため)。 */
export function defaultUpcomingMeals(nowMinutes: number = nowMinutesInTokyo()): MealType[] {
  const upcoming = MEAL_ORDER.filter((m) => nowMinutes < MEAL_CUTOFF_MINUTES[m]);
  return upcoming.length > 0 ? upcoming : ["dinner"];
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

export function mealFormSuffix(mealForm: string[] | null | undefined): string {
  if (!mealForm || mealForm.length === 0) return "";
  const sorted = [...mealForm].sort(
    (a, b) => MEAL_FORM_ORDER.indexOf(a) - MEAL_FORM_ORDER.indexOf(b),
  );
  const labels = sorted.map((c) => MEAL_FORM_LABELS[c] ?? "").join("");
  return labels ? `(${labels})` : "";
}
