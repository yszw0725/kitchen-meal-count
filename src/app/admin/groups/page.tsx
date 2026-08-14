import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import GroupsClient from "@/components/groups-client";

export default async function GroupsPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") notFound();

  const supabase = await createClient();
  const { data: groups } = await supabase
    .from("resident_groups")
    .select("id, name, short_name, sort_order, is_active")
    .order("sort_order");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">区分管理</h1>
        <p className="mt-1 text-sm text-zinc-500">
          既存区分は無効化のみ可能です（物理削除はできません）。
        </p>
      </div>
      <GroupsClient initialGroups={groups ?? []} />
    </main>
  );
}
