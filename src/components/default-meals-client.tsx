"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MEAL_LABEL, type MealType } from "@/lib/board-types";
import { useOnlineStatus } from "@/lib/use-online-status";
import OfflineBanner from "@/components/offline-banner";

type Resident = { id: string; name: string; group_id: string; left_on: string | null };
type Group = { id: string; short_name: string; sort_order: number };
type DefaultMealRow = { resident_id: string; weekday: number; meal: MealType; eats: boolean };

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export default function DefaultMealsClient({
  residents,
  groups,
  initialDefaultMeals,
}: {
  residents: Resident[];
  groups: Group[];
  initialDefaultMeals: DefaultMealRow[];
}) {
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const sortedResidents = useMemo(
    () =>
      [...residents].sort((a, b) => {
        const ga = groupById.get(a.group_id)?.sort_order ?? 0;
        const gb = groupById.get(b.group_id)?.sort_order ?? 0;
        return ga - gb || a.name.localeCompare(b.name, "ja");
      }),
    [residents, groupById],
  );

  const [selectedId, setSelectedId] = useState(sortedResidents[0]?.id ?? "");
  const [rows, setRows] = useState(initialDefaultMeals);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const online = useOnlineStatus();

  const grid = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of rows) {
      if (r.resident_id === selectedId) {
        map.set(`${r.weekday}:${r.meal}`, r.eats);
      }
    }
    return map;
  }, [rows, selectedId]);

  function toggle(weekday: number, meal: MealType) {
    setSaved(false);
    const key = `${weekday}:${meal}`;
    const current = grid.get(key) ?? false;
    setRows((prev) => {
      const exists = prev.some(
        (r) => r.resident_id === selectedId && r.weekday === weekday && r.meal === meal,
      );
      if (exists) {
        return prev.map((r) =>
          r.resident_id === selectedId && r.weekday === weekday && r.meal === meal
            ? { ...r, eats: !current }
            : r,
        );
      }
      return [...prev, { resident_id: selectedId, weekday, meal, eats: !current }];
    });
  }

  async function handleSave() {
    if (!online) {
      setError("オフラインのため保存できません。");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);

    const payload = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      for (const meal of MEAL_ORDER) {
        payload.push({
          resident_id: selectedId,
          weekday,
          meal,
          eats: grid.get(`${weekday}:${meal}`) ?? false,
        });
      }
    }

    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("resident_default_meals")
      .upsert(payload, { onConflict: "resident_id,weekday,meal" });

    setSaving(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    setSaved(true);
  }

  const selectedResident = sortedResidents.find((r) => r.id === selectedId);

  return (
    <div className="space-y-4">
      {!online && <OfflineBanner message="オフラインのため保存できません。" />}
      <div>
        <label className="block text-xs text-zinc-500">利用者</label>
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setSaved(false);
          }}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          {sortedResidents.map((r) => (
            <option key={r.id} value={r.id}>
              {groupById.get(r.group_id)?.short_name ?? ""} / {r.name}
            </option>
          ))}
        </select>
      </div>

      {selectedResident && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="min-w-full text-center text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-3 py-2 text-left">食事＼曜日</th>
                {WEEKDAY_LABELS.map((w, i) => (
                  <th key={i} className="px-3 py-2">
                    {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEAL_ORDER.map((meal) => (
                <tr key={meal} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-left font-medium text-zinc-700">
                    {MEAL_LABEL[meal]}
                  </td>
                  {WEEKDAY_LABELS.map((_, weekday) => {
                    const eats = grid.get(`${weekday}:${meal}`) ?? false;
                    return (
                      <td key={weekday} className="px-2 py-2">
                        <button
                          onClick={() => toggle(weekday, meal)}
                          className={`h-8 w-8 rounded-md border text-sm font-bold ${
                            eats
                              ? "border-emerald-400 bg-emerald-100 text-emerald-700"
                              : "border-zinc-300 bg-white text-zinc-300"
                          }`}
                        >
                          {eats ? "○" : "-"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-emerald-700">保存しました。</p>}

      <button
        onClick={handleSave}
        disabled={saving || !selectedId || !online}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "保存中..." : "保存"}
      </button>
    </div>
  );
}
