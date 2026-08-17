"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatDateLabel, todayInTokyo } from "@/lib/board-date";
import {
  MEAL_LABEL,
  defaultEmergencyMeals,
  isGhGroupName,
  mealFormSuffix,
  type MealType,
} from "@/lib/emergency-meal";
import { useOnlineStatus } from "@/lib/use-online-status";
import OfflineBanner from "@/components/offline-banner";

type Group = { id: string; short_name: string; sort_order: number };
type Resident = {
  id: string;
  name: string;
  kana: string | null;
  group_id: string;
  meal_form: string[] | null;
};

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

function overrideKey(date: string, residentId: string): string {
  return `${date}|${residentId}`;
}

export default function EmergencyEditClient() {
  const today = todayInTokyo();
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);
  const dateOptions = [
    { date: today, label: "当日" },
    { date: tomorrow, label: "翌日" },
    { date: dayAfterTomorrow, label: "翌々日" },
  ];

  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [selectedMeals, setSelectedMeals] = useState<Set<MealType>>(
    () => new Set(defaultEmergencyMeals()),
  );
  // キーは `${date}|${residentId}` (前日・当日の2日分をまとめて保持する)
  const [overrides, setOverrides] = useState<Record<string, MealType[]>>({});
  const [toast, setToast] = useState<{ message: string; onUndo: () => void } | null>(
    null,
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 利用者ごとにAPI呼び出しを直列化するチェーン。楽観的UIで画面は即座に
  // 更新するが、連打時にサーバーへのリクエストが並行実行されると
  // toggle APIの読み取り→書き込みが競合し、意図しない状態(残留/二重)に
  // なり得るため、同一利用者への呼び出しは常に前回完了後に送る。
  const pendingChains = useRef<Map<string, Promise<unknown>>>(new Map());
  const online = useOnlineStatus();

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // 区分・利用者・当日〜翌々日の緊急上書きは、Next.jsサーバーを経由せず
  // クライアントからSupabaseへ直接問い合わせる(S3の日付切替と同じ方式)。
  // 開いた瞬間に見た目は表示し、一覧はデータ到着後に埋める。3日分をまとめて
  // 取得し、日付トグルは再フェッチなしでクライアント側の絞り込みだけで
  // 切り替える。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [groupsRes, residentsRes, overridesRes] = await Promise.all([
        supabase
          .from("resident_groups")
          .select("id, short_name, sort_order")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("residents")
          .select("id, name, kana, group_id, meal_form")
          .is("left_on", null)
          .order("kana", { nullsFirst: false })
          .order("name"),
        supabase
          .from("kitchen_overrides")
          .select("resident_id, meal, date")
          .in("date", [today, tomorrow, dayAfterTomorrow]),
      ]);
      if (cancelled) return;

      if (groupsRes.error || residentsRes.error || overridesRes.error) {
        setLoadError("データの取得に失敗しました。通信環境をご確認のうえ再読み込みしてください。");
        setDataLoading(false);
        return;
      }

      const overridesByKey: Record<string, MealType[]> = {};
      for (const o of overridesRes.data ?? []) {
        const key = overrideKey(o.date, o.resident_id);
        (overridesByKey[key] ??= []).push(o.meal);
      }

      setGroups(groupsRes.data ?? []);
      setResidents(residentsRes.data ?? []);
      setOverrides(overridesByKey);
      setDataLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [today, tomorrow, dayAfterTomorrow]);

  function showToast(message: string, onUndo: () => void) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, onUndo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  function toggleMeal(meal: MealType) {
    setSelectedMeals((prev) => {
      const next = new Set(prev);
      if (next.has(meal)) next.delete(meal);
      else next.add(meal);
      return next.size > 0 ? next : prev; // 最低1つは選択状態を維持する
    });
  }

  async function callToggle(residentId: string, meals: MealType[], date: string) {
    const res = await fetch("/api/kitchen-overrides/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ residentId, meals, date }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? "登録に失敗しました。");
    }
    return res.json() as Promise<{
      action: "added" | "removed";
      residentName: string;
      mealLabel: string;
      type: "absent" | "present";
    }>;
  }

  function applyLocalOverride(residentId: string, meals: MealType[], added: boolean, date: string) {
    setOverrides((prev) => {
      const key = overrideKey(date, residentId);
      const current = new Set(prev[key] ?? []);
      for (const m of meals) {
        if (added) current.add(m);
        else current.delete(m);
      }
      return { ...prev, [key]: [...current] };
    });
  }

  function handleTap(resident: Resident) {
    if (!online) return;
    const date = selectedDate;
    const meals = [...selectedMeals];
    const wasMarked = meals.every((m) => overrides[overrideKey(date, resident.id)]?.includes(m));
    const willAdd = !wasMarked;
    const isGhResident = isGhGroupName(
      groups.find((g) => g.id === resident.group_id)?.short_name ?? "",
    );
    const verb = isGhResident ? "食べる人" : "お休み";
    const mealLabel = meals.map((m) => MEAL_LABEL[m]).join("・");
    const dayLabel = dateOptions.find((d) => d.date === date)?.label ?? "";

    // 楽観的UI: サーバー応答を待たず、タップした瞬間に画面とトーストを確定する (§6.4)
    applyLocalOverride(resident.id, meals, willAdd, date);
    const message = willAdd
      ? `たった今 ${resident.name} さんを${dayLabel}の${mealLabel}${verb}に登録しました`
      : `たった今 ${resident.name} さんの${dayLabel}の${mealLabel}の登録を取り消しました`;
    showToast(message, () => handleTap(resident));

    // 裏でAPIを呼ぶ。失敗した場合のみ画面を元に戻す。
    // 同一利用者・同一日への直前の呼び出しが終わってから送る(連打時の競合防止)。
    const chainKey = overrideKey(date, resident.id);
    const previous = pendingChains.current.get(chainKey) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => callToggle(resident.id, meals, date))
      .catch((e) => {
        applyLocalOverride(resident.id, meals, !willAdd, date);
        showToast(
          e instanceof Error ? e.message : "登録に失敗しました。通信環境をご確認ください。",
          () => {},
        );
      });
    pendingChains.current.set(chainKey, next);
  }

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;
  const isGh = selectedGroup ? isGhGroupName(selectedGroup.short_name) : false;

  const groupResidents = residents
    .filter((r) => r.group_id === selectedGroupId)
    .sort((a, b) => (a.kana ?? a.name).localeCompare(b.kana ?? b.name, "ja"));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">緊急入力</h1>
          <p className="text-sm text-zinc-500">当日・翌日・翌々日分のみ登録できます</p>
        </div>
        <Link href="/" className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
          トップへ戻る
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500">対象日:</span>
        {dateOptions.map((d) => (
          <button
            key={d.date}
            onClick={() => setSelectedDate(d.date)}
            disabled={!online}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${
              selectedDate === d.date
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-700"
            }`}
          >
            {d.label}（{formatDateLabel(d.date)}）
          </button>
        ))}
      </div>

      {!online && <OfflineBanner message="通信復旧後に操作できます。" />}

      {loadError && (
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">{loadError}</p>
      )}

      {dataLoading && !loadError && (
        <p className="p-4 text-center text-zinc-400">読み込み中…</p>
      )}

      {!dataLoading && !loadError && !selectedGroup && (
        <div className="grid grid-cols-2 gap-4">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              disabled={!online}
              className="rounded-xl border border-zinc-300 bg-white py-10 text-2xl font-bold text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 disabled:hover:bg-zinc-100"
            >
              {g.short_name}
              <span className="mt-2 block text-sm font-normal text-zinc-500">
                {isGhGroupName(g.short_name) ? "を食べる人にする" : "を休みにする"}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedGroup && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-900">
              {selectedGroup.short_name}を{isGh ? "食べる人にする" : "休みにする"}
            </h2>
            <button
              onClick={() => setSelectedGroupId(null)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
            >
              区分を選び直す
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">対象:</span>
            {MEAL_ORDER.map((m) => (
              <button
                key={m}
                onClick={() => toggleMeal(m)}
                className={`rounded-full border px-4 py-2 text-sm font-medium ${
                  selectedMeals.has(m)
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white text-zinc-700"
                }`}
              >
                {MEAL_LABEL[m]}
              </button>
            ))}
          </div>

          <div className="max-h-[560px] space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-2">
            {groupResidents.length === 0 && (
              <p className="p-4 text-center text-zinc-400">在籍者がいません。</p>
            )}
            {groupResidents.map((r) => {
              const meals = [...selectedMeals];
              const marked = meals.every((m) =>
                overrides[overrideKey(selectedDate, r.id)]?.includes(m),
              );
              return (
                <button
                  key={r.id}
                  onClick={() => handleTap(r)}
                  disabled={!online}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-4 text-left text-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    marked
                      ? "border-amber-400 bg-amber-50"
                      : "border-zinc-200 bg-white hover:bg-zinc-50"
                  }`}
                >
                  <span className="font-medium text-zinc-900">
                    {r.name}
                    {mealFormSuffix(r.meal_form)}
                  </span>
                  {marked && (
                    <span className="rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-white">
                      {isGh ? "食べる" : "休み中"}（タップで解除）
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="flex items-center gap-4 rounded-lg bg-zinc-900 px-5 py-3 text-white shadow-lg">
            <span>{toast.message}</span>
            <button
              onClick={toast.onUndo}
              className="rounded-md border border-white/40 px-3 py-1 text-sm font-medium"
            >
              取り消す
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
