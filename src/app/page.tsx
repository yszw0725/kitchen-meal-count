import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { isValidDateString, todayInTokyo } from "@/lib/board-date";
import type { BoardMeal } from "@/lib/board-types";
import SignOutButton from "@/components/sign-out-button";
import DateBar from "@/components/date-bar";
import DayBoardRealtime from "@/components/day-board-realtime";

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
  const { data: board, error } = await supabase.rpc("get_day_board", {
    p_date: date,
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">厨房食数管理</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">
            {profile?.display_name ?? user.email}（
            {role === "admin" ? "管理者" : "厨房"}）
          </span>
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

      <DateBar date={date} />

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
          食数データの取得に失敗しました: {error.message}
        </p>
      )}

      {!error && (
        <DayBoardRealtime date={date} initialBoard={(board ?? []) as BoardMeal[]} />
      )}
    </main>
  );
}
