"use client";

import { addDays, formatDateLabel } from "@/lib/board-date";
import { useTodayInTokyo } from "@/lib/use-today";

export default function DateBar({
  date,
  onDateChange,
}: {
  date: string;
  onDateChange: (newDate: string) => void;
}) {
  // 「今日」の判定はレンダーのたびにtodayInTokyo()を直接評価しない。
  // サーバーでの描画時刻とクライアントでのハイドレーション時刻が日付境界
  // (深夜0時前後)をまたぐと結果が食い違い、hydrationエラーになるため、
  // 初回描画では判定を保留(null=「今日ではない」扱い)し、マウント後にのみ
  // 実際の値へ更新する(useTodayInTokyo内部で解決)。
  const today = useTodayInTokyo();
  const isToday = date === today;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 compact:py-1.5 ${
        isToday
          ? "border-zinc-200 bg-white"
          : "border-amber-300 bg-amber-50"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => onDateChange(addDays(date, -1))}
          aria-label="前日"
          className="flex h-14 w-14 items-center justify-center rounded-md border border-zinc-300 text-xl hover:bg-zinc-100 compact:h-10 compact:w-10 compact:text-base"
        >
          ◀
        </button>

        <label className="relative">
          <span className="text-lg font-bold text-zinc-900">
            {formatDateLabel(date)}
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="日付を選択"
          />
        </label>

        <button
          onClick={() => onDateChange(addDays(date, 1))}
          aria-label="翌日"
          className="flex h-14 w-14 items-center justify-center rounded-md border border-zinc-300 text-xl hover:bg-zinc-100 compact:h-10 compact:w-10 compact:text-base"
        >
          ▶
        </button>
      </div>

      <div className="flex items-center gap-3">
        {!isToday && (
          <span className="text-sm font-medium text-amber-700">
            本日以外を表示中
          </span>
        )}
        <button
          onClick={() => today && onDateChange(today)}
          disabled={isToday}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          今日
        </button>
      </div>
    </div>
  );
}
