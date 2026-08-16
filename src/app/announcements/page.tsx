import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import type { AnnouncementRow } from "@/lib/announcements";
import AnnouncementsClient from "@/components/announcements-client";

export default async function AnnouncementsPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, content, created_at, profiles(display_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows: AnnouncementRow[] = (announcements ?? []).map((a) => ({
    id: a.id,
    content: a.content,
    created_at: a.created_at,
    poster_name:
      (a.profiles as unknown as { display_name: string } | null)?.display_name ?? "管理者",
  }));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">連絡事項</h1>
        <Link href="/" className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
          トップへ戻る
        </Link>
      </div>
      <AnnouncementsClient
        initialAnnouncements={rows}
        isAdmin={profile?.role === "admin"}
        userId={user.id}
      />
    </main>
  );
}
