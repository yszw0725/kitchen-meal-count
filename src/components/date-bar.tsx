"use client";

import { useRouter } from "next/navigation";
import { addDays, formatDateLabel, todayInTokyo } from "@/lib/board-date";

export default function DateBar({ date }: { date: string }) {
  const router = useRouter();
  const today = todayInTokyo();
  const isToday = date === today;

  function goTo(newDate: string) {
    router.push(`/?date=${newDate}`);
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
        isToday
          ? "border-zinc-200 bg-white"
          : "border-amber-300 bg-amber-50"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => goTo(addDays(date, -1))}
          aria-label="前日"
          className="flex h-14 w-14 items-center justify-center rounded-md border border-zinc-300 text-xl hover:bg-zinc-100"
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
            onChange={(e) => e.target.value && goTo(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="日付を選択"
          />
        </label>

        <button
          onClick={() => goTo(addDays(date, 1))}
          aria-label="翌日"
          className="flex h-14 w-14 items-center justify-center rounded-md border border-zinc-300 text-xl hover:bg-zinc-100"
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
          onClick={() => goTo(today)}
          disabled={isToday}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          今日
        </button>
      </div>
    </div>
  );
}
