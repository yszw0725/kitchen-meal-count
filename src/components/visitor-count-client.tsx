"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isValidDateString, todayInTokyo } from "@/lib/board-date";
import { MEAL_LABEL, type MealType } from "@/lib/board-types";
import { useOnlineStatus } from "@/lib/use-online-status";
import OfflineBanner from "@/components/offline-banner";
import DateBar from "@/components/date-bar";

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

export default function VisitorCountClient({ initialDate }: { initialDate?: string }) {
  // S2トップで表示中の日付から遷移してきた場合はその日付を引き継ぐ
  // (単独で開いた場合は従来通り当日を初期値にする)。
  const [selectedDate, setSelectedDate] = useState<string>(
    isValidDateString(initialDate) ? initialDate : todayInTokyo(),
  );
  // setState(true)を effect 内で同期的に呼ばず、「どの日付分として読み込まれたか」を
  // 非同期コールバック内でのみ更新する形にして loading を導出する
  // (react-hooks/set-state-in-effect対応、default-meals-clientと同じ考え方)。
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const dataLoading = loadedFor !== selectedDate;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<MealType, number>>({
    breakfast: 0,
    lunch: 0,
    dinner: 0,
  });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 日付×区分ごとにAPI呼び出しを直列化するチェーン。連打時の競合を防ぐため、
  // 同一日付・同一食事への呼び出しは常に前回完了後に送る (S5と同じ考え方)。
  const pendingChains = useRef<Map<string, Promise<unknown>>>(new Map());
  const online = useOnlineStatus();

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // 来客数(daily_meal_extras.visitor_count)は、選択中の日付が変わるたびに
  // 取得し直す(任意の日付を選べるようになったため)。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("daily_meal_extras")
        .select("meal, visitor_count")
        .eq("date", selectedDate);
      if (cancelled) return;

      if (error) {
        setLoadError("データの取得に失敗しました。通信環境をご確認のうえ再読み込みしてください。");
        setLoadedFor(selectedDate);
        return;
      }

      const byMeal = new Map(data?.map((r) => [r.meal, r.visitor_count]));
      setCounts({
        breakfast: byMeal.get("breakfast") ?? 0,
        lunch: byMeal.get("lunch") ?? 0,
        dinner: byMeal.get("dinner") ?? 0,
      });
      setLoadedFor(selectedDate);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  function adjust(meal: MealType, delta: number) {
    if (!online) return;
    const date = selectedDate;
    const previous = counts[meal];
    const next = Math.max(0, previous + delta);
    if (next === previous) return;

    // 楽観的UI: サーバー応答を待たず、タップした瞬間に画面を確定する
    setCounts((prev) => ({ ...prev, [meal]: next }));

    const chainKey = `${date}|${meal}`;
    const chain = pendingChains.current.get(chainKey) ?? Promise.resolve();
    const nextChain = chain
      .catch(() => {})
      .then(async () => {
        const supabase = createClient();
        const { error } = await supabase.from("daily_meal_extras").upsert(
          {
            date,
            meal,
            visitor_count: next,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "date,meal" },
        );
        if (error) throw error;
      })
      .catch(() => {
        setCounts((prev) => ({ ...prev, [meal]: previous }));
        showToast("来客数の更新に失敗しました。通信環境をご確認ください。");
      });
    pendingChains.current.set(chainKey, nextChain);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">来客数を変更</h1>
          <p className="text-sm text-zinc-500">任意の日付を選んで登録できます</p>
        </div>
        <Link href="/" className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
          トップへ戻る
        </Link>
      </div>

      <DateBar date={selectedDate} onDateChange={setSelectedDate} />

      {!online && <OfflineBanner message="通信復旧後に操作できます。" />}

      {loadError && (
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">{loadError}</p>
      )}

      {dataLoading && !loadError && (
        <p className="p-4 text-center text-zinc-400">読み込み中…</p>
      )}

      {!dataLoading && !loadError && (
        <div className="space-y-3">
          {MEAL_ORDER.map((meal) => (
            <div
              key={meal}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4"
            >
              <span className="text-lg font-bold text-zinc-900">{MEAL_LABEL[meal]}</span>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => adjust(meal, -1)}
                  disabled={!online || counts[meal] <= 0}
                  aria-label={`${MEAL_LABEL[meal]}の来客数を減らす`}
                  className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-300 text-3xl font-bold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-16 text-center text-4xl font-bold tabular-nums text-zinc-900">
                  {counts[meal]}
                </span>
                <button
                  onClick={() => adjust(meal, 1)}
                  disabled={!online}
                  aria-label={`${MEAL_LABEL[meal]}の来客数を増やす`}
                  className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-300 text-3xl font-bold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ＋
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="flex items-center gap-4 rounded-lg bg-zinc-900 px-5 py-3 text-white shadow-lg">
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
