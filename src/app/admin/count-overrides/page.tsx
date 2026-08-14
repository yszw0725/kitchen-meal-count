import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { todayInTokyo } from "@/lib/board-date";
import CountOverridesClient from "@/components/count-overrides-client";

export default async function CountOverridesPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") notFound();

  const supabase = await createClient();
  const [{ data: groups }, { data: overrides }] = await Promise.all([
    supabase.from("resident_groups").select("id, short_name, sort_order").order("sort_order"),
    supabase
      .from("count_overrides")
      .select("id, date, meal, group_id, override_count, reason, created_at")
      .order("date", { ascending: false })
      .limit(100),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">実食数の手動修正</h1>
        <p className="mt-1 text-sm text-zinc-500">
          理由の入力が必須です。適用中はトップ画面に「修正済み」バッジが表示されます。
        </p>
      </div>
      <CountOverridesClient
        groups={groups ?? []}
        initialOverrides={overrides ?? []}
        today={todayInTokyo()}
        userId={user.id}
      />
    </main>
  );
}
