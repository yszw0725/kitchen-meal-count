"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MEAL_LABEL, type MealType } from "@/lib/board-types";

type Group = { id: string; short_name: string; sort_order: number };
type Override = {
  id: string;
  date: string;
  meal: MealType;
  group_id: string;
  override_count: number;
  reason: string;
  created_at: string;
};

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

export default function CountOverridesClient({
  groups,
  initialOverrides,
  today,
  userId,
}: {
  groups: Group[];
  initialOverrides: Override[];
  today: string;
  userId: string;
}) {
  const [overrides, setOverrides] = useState(initialOverrides);
  const [date, setDate] = useState(today);
  const [meal, setMeal] = useState<MealType>("lunch");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [overrideCount, setOverrideCount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const groupName = (id: string) => groups.find((g) => g.id === id)?.short_name ?? "(不明)";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (reason.trim() === "") {
      setError("理由を入力してください。");
      return;
    }
    const count = Number(overrideCount);
    if (!Number.isInteger(count) || count < 0) {
      setError("実食数は0以上の整数で入力してください。");
      return;
    }
    if (!groupId) {
      setError("区分を選択してください。");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("count_overrides")
      .upsert(
        {
          date,
          meal,
          group_id: groupId,
          override_count: count,
          reason: reason.trim(),
          created_by: userId,
        },
        { onConflict: "date,meal,group_id" },
      )
      .select("id, date, meal, group_id, override_count, reason, created_at")
      .single();
    setSubmitting(false);

    if (dbError) {
      setError(dbError.message);
      return;
    }

    setOverrides((prev) => [data, ...prev.filter((o) => o.id !== data.id)]);
    setReason("");
    setOverrideCount("");
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    const supabase = createClient();
    const { error: dbError } = await supabase.from("count_overrides").delete().eq("id", id);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    setOverrides((prev) => prev.filter((o) => o.id !== id));
    setConfirmDeleteId(null);
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-zinc-200 p-4"
      >
        <h2 className="font-medium text-zinc-900">新規登録・更新</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className="block text-xs text-zinc-500">日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">食事</label>
            <select
              value={meal}
              onChange={(e) => setMeal(e.target.value as MealType)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            >
              {MEAL_ORDER.map((m) => (
                <option key={m} value={m}>
                  {MEAL_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500">区分</label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.short_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500">修正後の実食数</label>
            <input
              type="number"
              min={0}
              value={overrideCount}
              onChange={(e) => setOverrideCount(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-zinc-500">
            理由 <span className="text-red-600">(必須)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            placeholder="例: 外泊連絡が電話のみのため"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "保存中..." : "保存"}
        </button>
      </form>

      <div>
        <h2 className="font-medium text-zinc-900">登録済みの修正 (直近100件)</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2">日付</th>
                <th className="px-3 py-2">食事</th>
                <th className="px-3 py-2">区分</th>
                <th className="px-3 py-2">修正後</th>
                <th className="px-3 py-2">理由</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {overrides.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-zinc-400">
                    登録はありません。
                  </td>
                </tr>
              )}
              {overrides.map((o) => (
                <tr key={o.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2">{o.date}</td>
                  <td className="px-3 py-2">{MEAL_LABEL[o.meal]}</td>
                  <td className="px-3 py-2">{groupName(o.group_id)}</td>
                  <td className="px-3 py-2 font-medium">{o.override_count}</td>
                  <td className="px-3 py-2 text-zinc-600">{o.reason}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleDelete(o.id)}
                      className={`rounded-md border px-2 py-1 text-xs ${
                        confirmDeleteId === o.id
                          ? "border-red-400 bg-red-50 text-red-700"
                          : "border-zinc-300 text-zinc-600"
                      }`}
                    >
                      {confirmDeleteId === o.id ? "本当に解除する" : "解除"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
