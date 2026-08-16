"use client";

import { useState } from "react";
import { MEAL_LABEL, isGhGroup, type BoardGroup, type BoardMeal } from "@/lib/board-types";
import { formatDateLabel } from "@/lib/board-date";

function GroupNames({ group }: { group: BoardGroup }) {
  if (isGhGroup(group.short_name)) {
    if (group.present_names.length === 0) {
      return <p className="text-xs text-zinc-400">（該当なし）</p>;
    }
    return (
      <p className="text-xs leading-snug text-zinc-600">
        {group.present_names.join("、")}
      </p>
    );
  }

  if (group.absent_names.length === 0) {
    return <p className="text-xs text-zinc-400">（欠食なし）</p>;
  }
  return (
    <p className="text-xs leading-snug text-zinc-600">
      欠食: {group.absent_names.join("、")}
      {group.extra_names.length > 0 && (
        <span className="ml-2 text-emerald-700">
          臨時喫食: {group.extra_names.join("、")}
        </span>
      )}
    </p>
  );
}

function MealCard({
  mealData,
  onSelectGroup,
  highlightKeys,
}: {
  mealData: BoardMeal;
  onSelectGroup: (group: BoardGroup) => void;
  highlightKeys: Set<string>;
}) {
  const totalHighlighted = highlightKeys.has(`${mealData.meal}:total`);

  return (
    <div className="flex min-h-[640px] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white compact:h-full compact:min-h-0">
      <div
        className={`border-b border-zinc-100 px-4 py-3 text-center transition-colors duration-700 compact:py-1.5 ${
          totalHighlighted ? "bg-amber-100" : ""
        }`}
      >
        <p className="text-sm font-medium text-zinc-500">{MEAL_LABEL[mealData.meal]}</p>
        <p className="text-6xl font-bold tabular-nums text-zinc-900 compact:text-5xl">
          {mealData.cooking_total}
          <span className="ml-1 text-xl font-medium text-zinc-500">食</span>
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 compact:space-y-1.5 compact:py-1.5">
        {mealData.groups.map((g) => {
          const groupHighlighted = highlightKeys.has(`${mealData.meal}:${g.group_id}`);
          return (
            <button
              key={g.group_id}
              onClick={() => onSelectGroup(g)}
              className={`w-full rounded-md p-2 text-left transition-colors duration-700 hover:bg-zinc-50 compact:p-1.5 ${
                groupHighlighted ? "bg-amber-100" : ""
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-800">
                  {g.short_name}
                  {g.is_overridden && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                      修正済み
                    </span>
                  )}
                </span>
                <span className="text-2xl font-semibold tabular-nums text-zinc-900 compact:text-xl">
                  {g.actual_count}
                </span>
              </div>
              <GroupNames group={g} />
            </button>
          );
        })}
      </div>

      <div className="space-y-1 border-t border-zinc-100 px-4 py-3 text-sm text-zinc-600 compact:py-1.5">
        <div className="flex justify-between">
          <span>利用者計</span>
          <span className="tabular-nums">{mealData.resident_total}</span>
        </div>
        <div className="flex justify-between">
          <span>職員</span>
          <span className="tabular-nums">{mealData.staff_count}</span>
        </div>
        <div className="flex justify-between">
          <span>来客</span>
          <span className="tabular-nums">{mealData.visitor_count}</span>
        </div>
      </div>
    </div>
  );
}

function DetailModal({
  date,
  meal,
  group,
  onClose,
}: {
  date: string;
  meal: BoardMeal;
  group: BoardGroup;
  onClose: () => void;
}) {
  const isGh = isGhGroup(group.short_name);
  const listLabel = isGh ? "喫食者" : "欠食者";
  const list = isGh ? group.present_names : group.absent_names;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-zinc-500">
          {formatDateLabel(date)} {MEAL_LABEL[meal.meal]} {group.short_name}
        </p>
        <p className="mt-1 text-lg font-bold text-zinc-900">
          {listLabel} {list.length}名（在籍 {group.enrolled_count}名）
        </p>
        {group.is_overridden && (
          <p className="mt-1 inline-block rounded bg-rose-100 px-2 py-1 text-xs font-bold text-rose-700">
            管理者により実食数が {group.actual_count} に手動修正されています
          </p>
        )}

        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm text-zinc-700">
          {list.length === 0 && <li className="text-zinc-400">（該当なし）</li>}
          {list.map((name) => (
            <li key={name} className="rounded bg-zinc-50 px-2 py-1">
              {name}
            </li>
          ))}
        </ul>

        {!isGh && group.extra_names.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium text-emerald-700">臨時喫食</p>
            <ul className="mt-1 space-y-1 text-sm text-zinc-700">
              {group.extra_names.map((name) => (
                <li key={name} className="rounded bg-emerald-50 px-2 py-1">
                  {name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-zinc-300 py-2 text-sm"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

export default function DayBoardView({
  date,
  board,
  highlightKeys = new Set(),
}: {
  date: string;
  board: BoardMeal[];
  highlightKeys?: Set<string>;
}) {
  const [selected, setSelected] = useState<{ meal: BoardMeal; group: BoardGroup } | null>(
    null,
  );

  return (
    <div className="compact:flex compact:h-full compact:min-h-0 compact:flex-col">
      <div className="grid grid-cols-3 gap-4 compact:min-h-0 compact:flex-1 compact:grid-rows-1">
        {board.map((m) => (
          <MealCard
            key={m.meal}
            mealData={m}
            onSelectGroup={(group) => setSelected({ meal: m, group })}
            highlightKeys={highlightKeys}
          />
        ))}
      </div>

      {selected && (
        <DetailModal
          date={date}
          meal={selected.meal}
          group={selected.group}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
