import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { isValidDateString, todayInTokyo } from "@/lib/board-date";
import type { BoardMeal } from "@/lib/board-types";
import type { AnnouncementRow } from "@/lib/announcements";
import type { DocumentRow } from "@/lib/documents";
import SignOutButton from "@/components/sign-out-button";
import DayBoardRealtime from "@/components/day-board-realtime";
import AnnouncementBanner from "@/components/announcement-banner";
import DocumentLinks from "@/components/document-links";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const date = isValidDateString(params.date) ? params.date : todayInTokyo();
  const role = profile?.role ?? "kitchen";

  const supabase = await createClient();
  const [{ data: board, error }, { data: documents }, { data: latestAnnouncement }] =
    await Promise.all([
      supabase.rpc("get_day_board", { p_date: date }),
      supabase.from("documents").select("category, storage_path, original_filename, uploaded_at"),
      supabase
        .from("announcements")
        .select("id, content, created_at, profiles(display_name)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const initialLatest: AnnouncementRow | null = latestAnnouncement
    ? {
        id: latestAnnouncement.id,
        content: latestAnnouncement.content,
        created_at: latestAnnouncement.created_at,
        poster_name:
          (latestAnnouncement.profiles as unknown as { display_name: string } | null)
            ?.display_name ?? "管理者",
      }
    : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col space-y-4 p-4 compact:flex-none compact:h-dvh compact:space-y-2 compact:overflow-hidden compact:p-3 portrait:flex-none portrait:h-dvh portrait:space-y-2 portrait:overflow-hidden portrait:p-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-xl font-bold text-zinc-900">厨房食数管理</h1>
          <DocumentLinks documents={(documents ?? []) as DocumentRow[]} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">
            {profile?.display_name ?? user.email}（
            {role === "admin" ? "管理者" : "厨房"}）
          </span>
          <Link href="/history" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
            履歴
          </Link>
          {role === "admin" && (
            <Link
              href="/admin"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            >
              管理者画面
            </Link>
          )}
          <SignOutButton />
        </div>
      </div>

      <AnnouncementBanner initialLatest={initialLatest} />

      {error && (
        <p className="shrink-0 rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
          食数データの取得に失敗しました: {error.message}
        </p>
      )}

      <DayBoardRealtime date={date} initialBoard={(board ?? []) as BoardMeal[]} />
    </main>
  );
}
