"use client";

import { useRef } from "react";
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
  const dateInputRef = useRef<HTMLInputElement>(null);

  // <input type="date">を透明なオーバーレイとして重ね、それ自体へのクリックで
  // ブラウザ標準のカレンダーが開くことに依存する実装は、機種・ブラウザによって
  // (特にiOS Safari等)信頼できずタップに反応しないことがある既知の問題がある。
  // そのため、可視のボタンで確実にクリックを拾い、showPicker()で明示的に
  // カレンダーを開く(inputへのポインタイベントは無効化し、値の保持と
  // ネイティブピッカーの表示先としてのみ使う)。
  function openCalendar() {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      el.showPicker();
    } else {
      el.focus();
      el.click();
    }
  }

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

        <div className="relative">
          <button
            type="button"
            onClick={openCalendar}
            aria-label="日付を選択(カレンダーを開く)"
            className="text-lg font-bold text-zinc-900 hover:underline"
          >
            {formatDateLabel(date)}
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-0 h-full w-full opacity-0 pointer-events-none"
          />
        </div>

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
