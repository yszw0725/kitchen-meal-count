import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  classifyOrigin,
  originLabel,
  summarizeChangeLog,
  type ChangeLogRow,
} from "@/lib/change-log-summary";

const ORIGIN_STYLE: Record<string, string> = {
  excel: "bg-blue-100 text-blue-800",
  kitchen: "bg-amber-100 text-amber-800",
  manual: "bg-rose-100 text-rose-800",
  system: "bg-zinc-100 text-zinc-600",
};

export default async function HistoryPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: logs }, { data: residents }, { data: groups }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("change_logs")
        .select("id, actor_id, table_name, record_pk, action, before, after, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("residents").select("id, name"),
      supabase.from("resident_groups").select("id, short_name"),
      supabase.from("profiles").select("id, display_name"),
    ]);

  const ctx = {
    residentNames: Object.fromEntries((residents ?? []).map((r) => [r.id, r.name])),
    groupNames: Object.fromEntries((groups ?? []).map((g) => [g.id, g.short_name])),
    actorNames: Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name])),
  };

  const rows = (logs ?? []) as ChangeLogRow[];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">変更履歴</h1>
        <p className="mt-1 text-sm text-zinc-500">直近200件を新しい順に表示しています。</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200">
        {rows.length === 0 && (
          <p className="p-6 text-center text-zinc-400">履歴はまだありません。</p>
        )}
        <ul className="divide-y divide-zinc-100">
          {rows.map((row) => {
            const origin = classifyOrigin(row);
            const actorName =
              row.actor_id && ctx.actorNames[row.actor_id]
                ? ctx.actorNames[row.actor_id]
                : origin === "excel"
                  ? "—"
                  : "不明なユーザー";
            const isManual = origin === "manual";
            return (
              <li
                key={row.id}
                className={`flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-4 ${
                  isManual ? "bg-rose-50/50" : ""
                }`}
              >
                <span className="shrink-0 text-xs text-zinc-400 sm:w-40">
                  {new Date(row.created_at).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}
                </span>
                <span
                  className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-bold sm:w-28 ${ORIGIN_STYLE[origin]}`}
                >
                  {originLabel(origin)}
                </span>
                <span className="shrink-0 text-xs text-zinc-500 sm:w-24">{actorName}</span>
                <span className={isManual ? "font-medium text-rose-900" : "text-zinc-800"}>
                  {summarizeChangeLog(row, ctx)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
