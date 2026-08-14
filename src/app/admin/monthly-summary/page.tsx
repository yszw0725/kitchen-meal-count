import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { todayInTokyo } from "@/lib/board-date";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export default async function MonthlySummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") notFound();

  const params = await searchParams;
  const today = todayInTokyo();
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const year = Number(params.year) || todayYear;
  const month = Number(params.month) || todayMonth;

  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("get_monthly_summary", {
    p_year: year,
    p_month: month,
  });

  const summary = (rows ?? []) as Array<{
    date: string;
    breakfast_total: number;
    lunch_total: number;
    dinner_total: number;
  }>;

  const grandTotal = summary.reduce(
    (acc, r) => ({
      breakfast: acc.breakfast + Number(r.breakfast_total),
      lunch: acc.lunch + Number(r.lunch_total),
      dinner: acc.dinner + Number(r.dinner_total),
    }),
    { breakfast: 0, lunch: 0, dinner: 0 },
  );

  function monthLink(delta: number) {
    let y = year;
    let m = month + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    return `/admin/monthly-summary?year=${y}&month=${m}`;
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">月次集計（食単価清算用）</h1>
        <p className="mt-1 text-sm text-zinc-500">
          GH区分は平日昼を標準喫食として計算し、それ以外の食事は臨時喫食のみを加算します。
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3">
        <a href={monthLink(-1)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          ◀ 前月
        </a>
        <span className="text-lg font-bold text-zinc-900">
          {year}年{month}月
        </span>
        <a href={monthLink(1)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          翌月 ▶
        </a>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
          集計の取得に失敗しました: {error.message}
        </p>
      )}

      {!error && (
        <>
          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="text-sm text-zinc-500">月間合計食数</p>
            <div className="mt-2 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-zinc-500">朝食</p>
                <p className="text-3xl font-bold tabular-nums text-zinc-900">
                  {grandTotal.breakfast}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">昼食</p>
                <p className="text-3xl font-bold tabular-nums text-zinc-900">
                  {grandTotal.lunch}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">夕食</p>
                <p className="text-3xl font-bold tabular-nums text-zinc-900">
                  {grandTotal.dinner}
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-500">
                <tr>
                  <th className="px-3 py-2">日付</th>
                  <th className="px-3 py-2">曜日</th>
                  <th className="px-3 py-2 text-right">朝食計</th>
                  <th className="px-3 py-2 text-right">昼食計</th>
                  <th className="px-3 py-2 text-right">夕食計</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => {
                  const d = new Date(`${r.date}T00:00:00+09:00`);
                  const weekday = WEEKDAY_LABELS[d.getDay()];
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <tr
                      key={r.date}
                      className={`border-t border-zinc-100 ${isWeekend ? "bg-zinc-50" : ""}`}
                    >
                      <td className="px-3 py-1.5">{r.date}</td>
                      <td className="px-3 py-1.5">{weekday}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {r.breakfast_total}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.lunch_total}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {r.dinner_total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
