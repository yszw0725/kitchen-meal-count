import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import ResidentsClient from "@/components/residents-client";

export default async function ResidentsPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") notFound();

  const supabase = await createClient();
  const [{ data: residents }, { data: groups }] = await Promise.all([
    supabase
      .from("residents")
      .select("id, name, group_id, meal_form, entered_on, left_on")
      .order("name"),
    supabase
      .from("resident_groups")
      .select("id, name, short_name, sort_order")
      .order("sort_order"),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">利用者管理</h1>
        <p className="mt-1 text-sm text-zinc-500">
          利用者の登録・編集・退所処理を行います。新規登録すると、区分に応じた標準喫食パターン(入所系=全21マス／GH系=平日昼のみ)が自動で設定されます。
        </p>
      </div>
      <ResidentsClient
        initialResidents={(residents ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          groupId: r.group_id,
          mealForm: r.meal_form ?? [],
          enteredOn: r.entered_on,
          leftOn: r.left_on,
        }))}
        groups={groups ?? []}
      />
    </main>
  );
}
