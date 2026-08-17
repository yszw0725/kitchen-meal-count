import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import DefaultMealsClient from "@/components/default-meals-client";

export default async function DefaultMealsPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") notFound();

  const supabase = await createClient();
  const [{ data: residents }, { data: groups }] = await Promise.all([
    supabase
      .from("residents")
      .select("id, name, group_id, left_on")
      .order("name"),
    supabase.from("resident_groups").select("id, short_name, sort_order").order("sort_order"),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">標準喫食パターン編集</h1>
        <p className="mt-1 text-sm text-zinc-500">
          新規利用者はExcel取込時に区分に応じた既定パターン（入所=全21マス／GH=平日昼のみ）が自動設定されます。ここではその後の個別調整を行います。
        </p>
      </div>
      <DefaultMealsClient
        residents={(residents ?? []).filter((r) => r.left_on === null)}
        groups={groups ?? []}
      />
    </main>
  );
}
