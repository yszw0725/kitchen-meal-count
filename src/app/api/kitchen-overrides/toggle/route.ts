import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/require-user";
import { addDays, isValidDateString, todayInTokyo } from "@/lib/board-date";
import { MEAL_LABEL, isGhGroupName, type MealType } from "@/lib/emergency-meal";

const VALID_MEALS: MealType[] = ["breakfast", "lunch", "dinner"];

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json().catch(() => null);
  const residentId = body?.residentId as string | undefined;
  const meals = (body?.meals as MealType[] | undefined)?.filter((m) =>
    VALID_MEALS.includes(m),
  );
  const requestedDate = body?.date as string | undefined;

  if (!residentId || !meals || meals.length === 0) {
    return NextResponse.json({ message: "不正なリクエストです。" }, { status: 400 });
  }

  // kitchen_overrides.date は前日・当日のみ許可(DB側のCHECK制約・RLSと
  // 同じ範囲)。クライアントから任意の日付は受け付けない。
  const today = todayInTokyo();
  const yesterday = addDays(today, -1);
  if (
    !requestedDate ||
    !isValidDateString(requestedDate) ||
    (requestedDate !== today && requestedDate !== yesterday)
  ) {
    return NextResponse.json(
      { message: "対象日は前日または当日のみ指定できます。" },
      { status: 400 },
    );
  }
  const targetDate = requestedDate;

  const { data: resident } = await supabase
    .from("residents")
    .select("id, name, group_id, resident_groups(short_name)")
    .eq("id", residentId)
    .single();

  if (!resident) {
    return NextResponse.json({ message: "利用者が見つかりません。" }, { status: 404 });
  }

  const shortName =
    (resident.resident_groups as unknown as { short_name: string } | null)?.short_name ?? "";
  const type = isGhGroupName(shortName) ? "present" : "absent";

  const { data: existing } = await supabase
    .from("kitchen_overrides")
    .select("meal")
    .eq("resident_id", residentId)
    .eq("date", targetDate)
    .in("meal", meals);

  const existingMeals = new Set((existing ?? []).map((e) => e.meal));
  const allMarked = meals.every((m) => existingMeals.has(m));
  const mealLabel = meals.map((m) => MEAL_LABEL[m]).join("・");

  if (allMarked) {
    const { error } = await supabase
      .from("kitchen_overrides")
      .delete()
      .eq("resident_id", residentId)
      .eq("date", targetDate)
      .in("meal", meals);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({
      action: "removed",
      residentName: resident.name,
      mealLabel,
      type,
    });
  }

  const missingMeals = meals.filter((m) => !existingMeals.has(m));
  const { error } = await supabase.from("kitchen_overrides").insert(
    missingMeals.map((m) => ({
      resident_id: residentId,
      date: targetDate,
      meal: m,
      type,
      created_by: user.id,
    })),
  );

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    action: "added",
    residentName: resident.name,
    mealLabel,
    type,
  });
}
