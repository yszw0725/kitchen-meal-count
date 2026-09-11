"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MEAL_LABEL, type MealType } from "@/lib/board-types";
import { todayInTokyo, formatDateLabel } from "@/lib/board-date";
import { useOnlineStatus } from "@/lib/use-online-status";
import OfflineBanner from "@/components/offline-banner";
import DateBar from "@/components/date-bar";

type Resident = { id: string; name: string; group_id: string; left_on: string | null };
type Group = { id: string; short_name: string; sort_order: number };
type DefaultMealRow = {
  resident_id: string;
  weekday: number;
  meal: MealType;
  eats: boolean;
  effective_from: string;
};

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];
// weekday(DBの値、0=日曜〜6=土曜)は変更せず、表示順のみ月曜始まりにする。
const WEEKDAY_LABELS_BY_NUMBER = ["日", "月", "火", "水", "木", "金", "土"];
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function DefaultMealsClient({
  residents,
  groups,
  initialResidentId,
}: {
  residents: Resident[];
  groups: Group[];
  initialResidentId?: string;
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

  const initialSelectedId =
    initialResidentId && residents.some((r) => r.id === initialResidentId)
      ? initialResidentId
      : (sortedResidents[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  // 選択中の利用者の全世代(effective_from違いを含む)を保持する。
  const [history, setHistory] = useState<DefaultMealRow[]>([]);
  // このマスからどの日付の内容を編集するか(既定は今日)。
  const [effectiveFrom, setEffectiveFrom] = useState(() => todayInTokyo());
  // 編集中のグリッド(historyをeffectiveFrom時点で解決した値からトグルで変更していく)。
  const [draft, setDraft] = useState<Map<string, boolean>>(new Map());
  // 読込中判定は明示的なsetState(true)を effect 内で同期的に呼ばず、
  // 「rows がどの利用者分として読み込まれたか」を非同期コールバック内でのみ
  // 更新する形にして導出する(react-hooks/set-state-in-effect対応)。
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const online = useOnlineStatus();
  const loading = selectedId !== "" && loadedFor !== selectedId;
  const today = todayInTokyo();

  // resident_default_mealsは利用者数×21件(7曜日×3食)×世代数になり、施設全体を
  // 一括取得するとPostgRESTの最大取得件数(既定1000件)を超過し得る(超過分は
  // クライアント側のrange指定を無視してサーバー側で黙って切り捨てられる)。
  // そのため選択中の利用者1名分だけを都度取得する方式にしている。
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("resident_default_meals")
      .select("resident_id, weekday, meal, eats, effective_from")
      .eq("resident_id", selectedId)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setHistory((data ?? []) as DefaultMealRow[]);
        }
        setLoadedFor(selectedId);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // history(全世代)から、effectiveFrom時点で有効な値を(weekday, meal)ごとに解決する
  // (対象日以前で最も新しいeffective_fromの行を採用する)。
  const resolved = useMemo(() => {
    const map = new Map<string, boolean>();
    const latest = new Map<string, string>();
    for (const r of history) {
      if (r.effective_from > effectiveFrom) continue;
      const key = `${r.weekday}:${r.meal}`;
      const currentLatest = latest.get(key);
      if (currentLatest === undefined || r.effective_from > currentLatest) {
        latest.set(key, r.effective_from);
        map.set(key, r.eats);
      }
    }
    return map;
  }, [history, effectiveFrom]);

  // selectedId・effectiveFromが変わるたびに、編集中グリッドをresolvedへリセットする。
  // (レンダー中にstateを調整する公式パターン。effect内で行うとcascading renderの
  // 原因になるため避ける)
  const resetKey = `${selectedId}|${effectiveFrom}|${loadedFor === selectedId ? "loaded" : "loading"}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setDraft(new Map(resolved));
    setSaved(false);
  }

  // 未来日(今日より後)に既に登録されている変更予定を、日付ごとにまとめて一覧表示する。
  const pendingChanges = useMemo(() => {
    const dates = [...new Set(history.filter((r) => r.effective_from > today).map((r) => r.effective_from))];
    return dates.sort();
  }, [history, today]);

  function toggle(weekday: number, meal: MealType) {
    setSaved(false);
    const key = `${weekday}:${meal}`;
    const current = draft.get(key) ?? false;
    setDraft((prev) => {
      const next = new Map(prev);
      next.set(key, !current);
      return next;
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

    const payload: DefaultMealRow[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      for (const meal of MEAL_ORDER) {
        payload.push({
          resident_id: selectedId,
          weekday,
          meal,
          eats: draft.get(`${weekday}:${meal}`) ?? false,
          effective_from: effectiveFrom,
        });
      }
    }

    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("resident_default_meals")
      .upsert(payload, { onConflict: "resident_id,weekday,meal,effective_from" });

    setSaving(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    // ローカルのhistoryにも反映し、再取得なしで「適用予定の変更」欄を更新する。
    setHistory((prev) => {
      const withoutThisGeneration = prev.filter((r) => r.effective_from !== effectiveFrom);
      return [...withoutThisGeneration, ...payload];
    });
    setSaved(true);
  }

  async function cancelPendingChange(date: string) {
    if (!online) {
      setError("オフラインのため削除できません。");
      return;
    }
    setError(null);
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("resident_default_meals")
      .delete()
      .eq("resident_id", selectedId)
      .eq("effective_from", date);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    setHistory((prev) => prev.filter((r) => r.effective_from !== date));
    if (effectiveFrom === date) {
      setEffectiveFrom(today);
    }
  }

  const selectedResident = sortedResidents.find((r) => r.id === selectedId);
  const isToday = effectiveFrom === today;

  return (
    <div className="space-y-4">
      {!online && <OfflineBanner message="オフラインのため保存できません。" />}
      <div>
        <label className="block text-xs text-zinc-500">利用者</label>
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setEffectiveFrom(today);
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
        <div>
          <label className="block text-xs text-zinc-500">いつから適用するか</label>
          <div className="mt-1">
            <DateBar date={effectiveFrom} onDateChange={setEffectiveFrom} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {isToday
              ? "今日から適用する内容を編集しています。保存すると即時反映されます。"
              : `${formatDateLabel(effectiveFrom)}から適用する内容を編集しています。それより前の日付には影響しません。`}
          </p>
        </div>
      )}

      {selectedResident && loading && <p className="text-sm text-zinc-400">読み込み中...</p>}

      {selectedResident && !loading && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="min-w-full text-center text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-3 py-2 text-left">食事＼曜日</th>
                {WEEKDAY_DISPLAY_ORDER.map((weekday) => (
                  <th key={weekday} className="px-3 py-2">
                    {WEEKDAY_LABELS_BY_NUMBER[weekday]}
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
                  {WEEKDAY_DISPLAY_ORDER.map((weekday) => {
                    const eats = draft.get(`${weekday}:${meal}`) ?? false;
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
        disabled={saving || loading || !selectedId || !online}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "保存中..." : "保存"}
      </button>

      {selectedResident && !loading && pendingChanges.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">適用予定の変更</p>
          <ul className="mt-2 space-y-1">
            {pendingChanges.map((date) => (
              <li key={date} className="flex items-center justify-between text-sm">
                <span className="text-amber-900">{formatDateLabel(date)}から適用予定</span>
                <span className="flex gap-2">
                  <button
                    onClick={() => setEffectiveFrom(date)}
                    className="rounded-md border border-amber-400 px-2 py-1 text-xs text-amber-800"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => cancelPendingChange(date)}
                    disabled={!online}
                    className="rounded-md border border-amber-400 px-2 py-1 text-xs text-amber-800 disabled:opacity-50"
                  >
                    取消
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
