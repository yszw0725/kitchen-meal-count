"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { todayInTokyo } from "@/lib/board-date";
import { MEAL_LABEL, type MealType } from "@/lib/board-types";
import { useOnlineStatus } from "@/lib/use-online-status";
import OfflineBanner from "@/components/offline-banner";

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

export default function VisitorCountClient({
  dateLabel,
  userId,
}: {
  dateLabel: string;
  userId: string;
}) {
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<MealType, number>>({
    breakfast: 0,
    lunch: 0,
    dinner: 0,
  });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 区分ごとにAPI呼び出しを直列化するチェーン。連打時の競合を防ぐため、
  // 同一区分への呼び出しは常に前回完了後に送る (S5と同じ考え方)。
  const pendingChains = useRef<Map<MealType, Promise<unknown>>>(new Map());
  const online = useOnlineStatus();

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const today = todayInTokyo();
      const [extrasRes, overridesRes] = await Promise.all([
        supabase.from("daily_meal_extras").select("meal, visitor_count").eq("date", today),
        supabase
          .from("kitchen_visitor_overrides")
          .select("meal, visitor_count")
          .eq("date", today),
      ]);
      if (cancelled) return;

      if (extrasRes.error || overridesRes.error) {
        setLoadError("データの取得に失敗しました。通信環境をご確認のうえ再読み込みしてください。");
        setDataLoading(false);
        return;
      }

      const extrasByMeal = new Map(extrasRes.data?.map((r) => [r.meal, r.visitor_count]));
      const overridesByMeal = new Map(overridesRes.data?.map((r) => [r.meal, r.visitor_count]));

      setCounts({
        breakfast: overridesByMeal.get("breakfast") ?? extrasByMeal.get("breakfast") ?? 0,
        lunch: overridesByMeal.get("lunch") ?? extrasByMeal.get("lunch") ?? 0,
        dinner: overridesByMeal.get("dinner") ?? extrasByMeal.get("dinner") ?? 0,
      });
      setDataLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  function adjust(meal: MealType, delta: number) {
    if (!online) return;
    const previous = counts[meal];
    const next = Math.max(0, previous + delta);
    if (next === previous) return;

    // 楽観的UI: サーバー応答を待たず、タップした瞬間に画面を確定する
    setCounts((prev) => ({ ...prev, [meal]: next }));

    const chain = pendingChains.current.get(meal) ?? Promise.resolve();
    const nextChain = chain
      .catch(() => {})
      .then(async () => {
        const supabase = createClient();
        const { error } = await supabase.from("kitchen_visitor_overrides").upsert(
          {
            date: todayInTokyo(),
            meal,
            visitor_count: next,
            created_by: userId,
          },
          { onConflict: "date,meal" },
        );
        if (error) throw error;
      })
      .catch(() => {
        setCounts((prev) => ({ ...prev, [meal]: previous }));
        showToast("来客数の更新に失敗しました。通信環境をご確認ください。");
      });
    pendingChains.current.set(meal, nextChain);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">来客数を変更</h1>
          <p className="text-sm text-zinc-500">{dateLabel}（当日のみ登録できます）</p>
        </div>
        <Link href="/" className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
          トップへ戻る
        </Link>
      </div>

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
