"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MEAL_LABEL,
  isGhGroupName,
  mealFormSuffix,
  type MealType,
} from "@/lib/emergency-meal";

type Group = { id: string; short_name: string; sort_order: number };
type Resident = {
  id: string;
  name: string;
  kana: string | null;
  group_id: string;
  meal_form: string[] | null;
};

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

export default function EmergencyEditClient({
  dateLabel,
  groups,
  residents,
  initialOverrides,
  defaultMeals,
}: {
  dateLabel: string;
  groups: Group[];
  residents: Resident[];
  initialOverrides: Record<string, MealType[]>;
  defaultMeals: MealType[];
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedMeals, setSelectedMeals] = useState<Set<MealType>>(
    new Set(defaultMeals),
  );
  const [overrides, setOverrides] = useState(initialOverrides);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; onUndo: () => void } | null>(
    null,
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

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

  async function callToggle(residentId: string, meals: MealType[]) {
    const res = await fetch("/api/kitchen-overrides/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ residentId, meals }),
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

  function applyLocalOverride(residentId: string, meals: MealType[], added: boolean) {
    setOverrides((prev) => {
      const current = new Set(prev[residentId] ?? []);
      for (const m of meals) {
        if (added) current.add(m);
        else current.delete(m);
      }
      return { ...prev, [residentId]: [...current] };
    });
  }

  async function handleTap(resident: Resident) {
    if (pendingId) return;
    const meals = [...selectedMeals];
    setPendingId(resident.id);
    try {
      const result = await callToggle(resident.id, meals);
      const added = result.action === "added";
      applyLocalOverride(resident.id, meals, added);

      const verb = result.type === "present" ? "食べる人" : "お休み";
      const message = added
        ? `たった今 ${result.residentName} さんを${result.mealLabel}${verb}に登録しました`
        : `たった今 ${result.residentName} さんの${result.mealLabel}の登録を取り消しました`;

      showToast(message, async () => {
        // 直前の操作を反転させる (事後取り消し)
        const undone = await callToggle(resident.id, meals);
        applyLocalOverride(resident.id, meals, undone.action === "added");
        setToast(null);
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "登録に失敗しました。", () => {});
    } finally {
      setPendingId(null);
    }
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
          <p className="text-sm text-zinc-500">{dateLabel}（当日のみ登録できます）</p>
        </div>
        <Link href="/" className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
          トップへ戻る
        </Link>
      </div>

      {!selectedGroup && (
        <div className="grid grid-cols-2 gap-4">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className="rounded-xl border border-zinc-300 bg-white py-10 text-2xl font-bold text-zinc-900 hover:bg-zinc-50"
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
              const marked = meals.every((m) => overrides[r.id]?.includes(m));
              return (
                <button
                  key={r.id}
                  onClick={() => handleTap(r)}
                  disabled={pendingId === r.id}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-4 text-left text-lg transition-colors disabled:opacity-50 ${
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
