import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { todayInTokyo, formatDateLabel } from "@/lib/board-date";
import { defaultUpcomingMeals, type MealType } from "@/lib/emergency-meal";
import EmergencyEditClient from "@/components/emergency-edit-client";

export default async function EmergencyEditPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const today = todayInTokyo();

  const [{ data: groups }, { data: residents }, { data: overrides }] = await Promise.all([
    supabase
      .from("resident_groups")
      .select("id, short_name, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("residents")
      .select("id, name, kana, group_id, meal_form")
      .is("left_on", null)
      .order("kana", { nullsFirst: false })
      .order("name"),
    supabase
      .from("kitchen_overrides")
      .select("resident_id, meal")
      .eq("date", today),
  ]);

  const overridesByResident: Record<string, MealType[]> = {};
  for (const o of overrides ?? []) {
    (overridesByResident[o.resident_id] ??= []).push(o.meal);
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <EmergencyEditClient
        dateLabel={formatDateLabel(today)}
        groups={groups ?? []}
        residents={residents ?? []}
        initialOverrides={overridesByResident}
        defaultMeals={defaultUpcomingMeals()}
      />
    </main>
  );
}
