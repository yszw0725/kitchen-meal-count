"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { weekdayOfDate } from "@/lib/board-date";
import {
  MEAL_LABEL,
  defaultEmergencyMeals,
  isGhGroupName,
  mealFormSuffix,
  type MealType,
} from "@/lib/emergency-meal";
import { useOnlineStatus } from "@/lib/use-online-status";
import OfflineBanner from "@/components/offline-banner";
import DateBar from "@/components/date-bar";

type Group = { id: string; short_name: string; sort_order: number };
type Resident = {
  id: string;
  name: string;
  kana: string | null;
  group_id: string;
  meal_form: string[] | null;
};
type ExceptionType = "absent" | "present";

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner"];

function exceptionKey(residentId: string, meal: MealType): string {
  return `${residentId}|${meal}`;
}

type MealTarget = { meal: MealType; type: ExceptionType };

export default function EmergencyEditClient({
  userId,
  initialDate,
}: {
  userId: string;
  initialDate: string;
}) {
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  // S2トップで表示中の日付から遷移してきた場合はその日付を引き継ぐ
  // (単独で開いた場合は当日が初期値になる)。値はサーバー側(page.tsx)で
  // 確定済みのため、クライアント側でtodayInTokyo()を再評価しない
  // (サーバー/クライアントで日付境界をまたぐとhydrationエラーになるため)。
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [selectedMeals, setSelectedMeals] = useState<Set<MealType>>(
    () => new Set(defaultEmergencyMeals()),
  );
  // 選択中の日付をURLにも反映する(S2のday-board-realtimeと同じ方式)。
  // 反映しないと、登録操作中に何らかの理由で画面が再読み込みされた場合、
  // URLに残ったままの古い日付(初回遷移時の日付)に巻き戻ってしまう。
  function handleDateChange(newDate: string) {
    setSelectedDate(newDate);
    window.history.replaceState(null, "", `/emergency-edit?date=${newDate}`);
  }
  // キーは `${residentId}|${meal}` (選択中の日付1日分のみ保持する。
  // 日付は制限なく任意に選べるため、以前のような数日分の先読みはせず、
  // 日付が変わるたびに取得し直す)。値は登録されている例外の種別。
  const [exceptions, setExceptions] = useState<Record<string, ExceptionType>>({});
  // 種別(欠食/臨時喫食)は区分ではなく、利用者ごとの標準喫食パターン
  // (resident_default_meals.eats、選択中日付の曜日分)によって決める。
  // キーは `${residentId}|${meal}`。標準=true(食べる予定)ならタップで欠食を、
  // 標準=falseならタップで臨時喫食を登録する。
  const [defaultMeals, setDefaultMeals] = useState<Record<string, boolean>>({});
  const [defaultMealsLoadedFor, setDefaultMealsLoadedFor] = useState<string | null>(null);
  // handleTapは「タップ→取消トースト→取消ボタン押下でhandleTapを再度呼ぶ」という
  // 構造のため、取消ボタンのコールバックは直前のタップ時点のレンダーに閉じ込められた
  // 古いexceptionsを参照してしまう(古いレンダーのhandleTapをそのまま捕まえるため)。
  // refで常に最新のexceptionsを参照できるようにし、取消が正しく直前の変更を
  // 打ち消せるようにする。
  const exceptionsRef = useRef(exceptions);
  useEffect(() => {
    exceptionsRef.current = exceptions;
  }, [exceptions]);
  // setState(true)を effect 内で同期的に呼ばず、「どの日付分として読み込まれたか」を
  // 非同期コールバック内でのみ更新する形にして loading を導出する
  // (react-hooks/set-state-in-effect対応、default-meals-clientと同じ考え方)。
  const [exceptionsLoadedFor, setExceptionsLoadedFor] = useState<string | null>(null);
  const exceptionsLoading =
    exceptionsLoadedFor !== selectedDate || defaultMealsLoadedFor !== selectedDate;
  const [toast, setToast] = useState<{ message: string; onUndo: () => void } | null>(
    null,
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 利用者ごとにAPI呼び出しを直列化するチェーン。楽観的UIで画面は即座に
  // 更新するが、連打時にサーバーへのリクエストが並行実行されると
  // 読み取り→書き込みが競合し、意図しない状態(残留/二重)になり得るため、
  // 同一利用者への呼び出しは常に前回完了後に送る。
  const pendingChains = useRef<Map<string, Promise<unknown>>>(new Map());
  const online = useOnlineStatus();

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // 区分・利用者は日付に依存しないため初回のみ取得する(S3の日付切替と同じ方式で
  // Next.jsサーバーを経由せずクライアントから直接Supabaseへ問い合わせる)。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [groupsRes, residentsRes] = await Promise.all([
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
      ]);
      if (cancelled) return;

      if (groupsRes.error || residentsRes.error) {
        setLoadError("データの取得に失敗しました。通信環境をご確認のうえ再読み込みしてください。");
        setDataLoading(false);
        return;
      }

      setGroups(groupsRes.data ?? []);
      setResidents(residentsRes.data ?? []);
      setDataLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 欠食・臨時喫食の登録状況(meal_exceptions)は、選択中の日付が変わるたびに
  // 取得し直す(任意の日付を選べるようになったため、以前のような数日分の
  // 先読みはしない)。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("meal_exceptions")
        .select("resident_id, meal, type")
        .eq("date", selectedDate);
      if (cancelled) return;

      if (error) {
        setLoadError("データの取得に失敗しました。通信環境をご確認のうえ再読み込みしてください。");
        setExceptionsLoadedFor(selectedDate);
        return;
      }

      const map: Record<string, ExceptionType> = {};
      for (const row of data ?? []) {
        map[exceptionKey(row.resident_id, row.meal as MealType)] = row.type as ExceptionType;
      }
      setExceptions(map);
      setExceptionsLoadedFor(selectedDate);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  // 標準喫食パターン(resident_default_meals)も、選択中の日付の曜日が変わるたびに
  // 取得し直す(施設全体でも1曜日分=最大26名×3食=78件程度でPostgRESTの
  // 上限には収まる)。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const weekday = weekdayOfDate(selectedDate);
      const { data, error } = await supabase
        .from("resident_default_meals")
        .select("resident_id, meal, eats")
        .eq("weekday", weekday);
      if (cancelled) return;

      if (error) {
        setLoadError("データの取得に失敗しました。通信環境をご確認のうえ再読み込みしてください。");
        setDefaultMealsLoadedFor(selectedDate);
        return;
      }

      const map: Record<string, boolean> = {};
      for (const row of data ?? []) {
        map[exceptionKey(row.resident_id, row.meal as MealType)] = row.eats as boolean;
      }
      setDefaultMeals(map);
      setDefaultMealsLoadedFor(selectedDate);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  // 標準喫食パターンの真偽から、タップで登録すべき種別を決める。
  // 標準=true(食べる予定) → タップで欠食(absent)、標準=false → タップで臨時喫食(present)。
  // 標準パターン行は在籍者登録時に必ずシードされるが、未取得時のフォールバックは
  // 「基本は毎食喫食」という在籍利用者の原則(§7.1)に合わせ true とする。
  function residentTargetType(residentId: string, meal: MealType): ExceptionType {
    const eats = defaultMeals[exceptionKey(residentId, meal)] ?? true;
    return eats ? "absent" : "present";
  }

  function mealTargetsFor(residentId: string, meals: MealType[]): MealTarget[] {
    return meals.map((meal) => ({ meal, type: residentTargetType(residentId, meal) }));
  }

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

  async function writeExceptions(
    residentId: string,
    date: string,
    targets: MealTarget[] | null,
    meals: MealType[],
  ) {
    const supabase = createClient();
    if (targets === null) {
      const { error } = await supabase
        .from("meal_exceptions")
        .delete()
        .eq("resident_id", residentId)
        .eq("date", date)
        .in("meal", meals);
      if (error) throw error;
      return;
    }
    const { error } = await supabase.from("meal_exceptions").upsert(
      targets.map(({ meal, type }) => ({
        resident_id: residentId,
        date,
        meal,
        type,
        created_by: userId,
      })),
      { onConflict: "resident_id,date,meal" },
    );
    if (error) throw error;
  }

  function applyLocalException(residentId: string, values: Array<{ meal: MealType; type: ExceptionType | null }>) {
    setExceptions((prev) => {
      const next = { ...prev };
      for (const { meal, type } of values) {
        const key = exceptionKey(residentId, meal);
        if (type === null) delete next[key];
        else next[key] = type;
      }
      return next;
    });
  }

  function handleTap(resident: Resident) {
    if (!online) return;
    const date = selectedDate;
    const meals = [...selectedMeals];
    const targets = mealTargetsFor(resident.id, meals);
    const wasMarked = targets.every(
      ({ meal, type }) => exceptionsRef.current[exceptionKey(resident.id, meal)] === type,
    );
    const previousValues = meals.map((meal) => ({
      meal,
      type: exceptionsRef.current[exceptionKey(resident.id, meal)] ?? null,
    }));
    const nextValues: Array<{ meal: MealType; type: ExceptionType | null }> = wasMarked
      ? meals.map((meal) => ({ meal, type: null }))
      : targets;
    const nextTargets: MealTarget[] | null = wasMarked ? null : targets;

    const distinctTypes = new Set(targets.map((t) => t.type));
    const verb = distinctTypes.size === 1
      ? (distinctTypes.has("present") ? "食べる人" : "お休み")
      : targets.map((t) => `${MEAL_LABEL[t.meal]}は${t.type === "present" ? "食べる人" : "お休み"}`).join("・");
    const mealLabel = meals.map((m) => MEAL_LABEL[m]).join("・");

    // 楽観的UI: サーバー応答を待たず、タップした瞬間に画面とトーストを確定する (§6.4)
    applyLocalException(resident.id, nextValues);
    const message = !wasMarked
      ? distinctTypes.size === 1
        ? `たった今 ${resident.name} さんを${mealLabel}${verb}に登録しました`
        : `たった今 ${resident.name} さんの${verb}を登録しました`
      : `たった今 ${resident.name} さんの${mealLabel}の登録を取り消しました`;
    showToast(message, () => handleTap(resident));

    // 裏でDBを更新する。失敗した場合のみ画面を元に戻す。
    // 同一利用者・同一日への直前の呼び出しが終わってから送る(連打時の競合防止)。
    const chainKey = `${date}|${resident.id}`;
    const previous = pendingChains.current.get(chainKey) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => writeExceptions(resident.id, date, nextTargets, meals))
      .catch((e) => {
        applyLocalException(resident.id, previousValues);
        showToast(
          e instanceof Error ? e.message : "登録に失敗しました。通信環境をご確認ください。",
          () => {},
        );
      });
    pendingChains.current.set(chainKey, next);
  }

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  const groupResidents = residents
    .filter((r) => r.group_id === selectedGroupId)
    .sort((a, b) => (a.kana ?? a.name).localeCompare(b.kana ?? b.name, "ja"));

  // 見出しの文言は区分ではなく、選択中の対象食について区分内の利用者の標準喫食
  // パターンから実際に登録される種別を集計して決める(GH=平日昼のみtrueが基本だが
  // 利用者ごとに個別調整され得るため、区分だけでは決まらない)。
  const selectedMealsList = [...selectedMeals];
  const headingTypes = new Set(
    groupResidents.flatMap((r) => selectedMealsList.map((m) => residentTargetType(r.id, m))),
  );
  const headingText =
    selectedGroup && headingTypes.size === 1
      ? `${selectedGroup.short_name}を${headingTypes.has("present") ? "食べる人にする" : "休みにする"}`
      : `${selectedGroup?.short_name ?? ""}の欠食・臨時喫食を登録する`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">欠食・臨時喫食の登録</h1>
          <p className="text-sm text-zinc-500">任意の日付を選んで登録できます</p>
        </div>
        <Link href="/" className="rounded-md border border-zinc-300 px-4 py-2 text-sm">
          トップへ戻る
        </Link>
      </div>

      <DateBar date={selectedDate} onDateChange={handleDateChange} />

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
            <h2 className="text-lg font-bold text-zinc-900">{headingText}</h2>
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

          {exceptionsLoading ? (
            <p className="p-4 text-center text-zinc-400">読み込み中…</p>
          ) : (
            <div className="max-h-[560px] space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-2">
              {groupResidents.length === 0 && (
                <p className="p-4 text-center text-zinc-400">在籍者がいません。</p>
              )}
              {groupResidents.map((r) => {
                const targets = mealTargetsFor(r.id, selectedMealsList);
                const marked = targets.every(
                  ({ meal, type }) => exceptions[exceptionKey(r.id, meal)] === type,
                );
                const rowTypes = new Set(targets.map((t) => t.type));
                const badgeLabel =
                  rowTypes.size === 1 ? (rowTypes.has("present") ? "食べる" : "休み中") : "登録済み";
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
                        {badgeLabel}（タップで解除）
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
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
