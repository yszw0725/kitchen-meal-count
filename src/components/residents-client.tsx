"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useOnlineStatus } from "@/lib/use-online-status";
import { todayInTokyo } from "@/lib/board-date";
import { MEAL_FORM_OPTIONS, mealFormSuffix } from "@/lib/emergency-meal";
import OfflineBanner from "@/components/offline-banner";

type Resident = {
  id: string;
  name: string;
  groupId: string;
  mealForm: string[];
  leftOn: string | null;
};

type Group = { id: string; name: string; short_name: string; sort_order: number };

function MealFormCheckboxes({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {MEAL_FORM_OPTIONS.map((opt) => (
        <label key={opt.code} className="flex items-center gap-1.5 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={value.includes(opt.code)}
            onChange={(e) => {
              if (e.target.checked) {
                onChange([...value, opt.code]);
              } else {
                onChange(value.filter((c) => c !== opt.code));
              }
            }}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function ResidentEditForm({
  resident,
  groups,
  online,
  onCancel,
  onSaved,
}: {
  resident: Resident;
  groups: Group[];
  online: boolean;
  onCancel: () => void;
  onSaved: (next: Resident) => void;
}) {
  const [name, setName] = useState(resident.name);
  const [groupId, setGroupId] = useState(resident.groupId);
  const [mealForm, setMealForm] = useState<string[]>(resident.mealForm);
  const [enrolled, setEnrolled] = useState(resident.leftOn === null);
  const [leftOn, setLeftOn] = useState(resident.leftOn ?? todayInTokyo());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!online) {
      setError("オフラインのため保存できません。");
      return;
    }
    if (!name.trim()) {
      setError("氏名を入力してください。");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const nextLeftOn = enrolled ? null : leftOn;
    const { error: dbError } = await supabase
      .from("residents")
      .update({
        name: name.trim(),
        group_id: groupId,
        meal_form: mealForm,
        left_on: nextLeftOn,
      })
      .eq("id", resident.id);
    setSaving(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    onSaved({ ...resident, name: name.trim(), groupId, mealForm, leftOn: nextLeftOn });
  }

  return (
    <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs text-zinc-500">氏名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500">区分</label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.short_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500">食形態</label>
        <div className="mt-1">
          <MealFormCheckboxes value={mealForm} onChange={setMealForm} />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500">在籍状態</label>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-zinc-700">
            <input
              type="radio"
              checked={enrolled}
              onChange={() => setEnrolled(true)}
            />
            在籍
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-700">
            <input
              type="radio"
              checked={!enrolled}
              onChange={() => setEnrolled(false)}
            />
            退所
          </label>
          {!enrolled && (
            <input
              type="date"
              value={leftOn}
              onChange={(e) => setLeftOn(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
            />
          )}
        </div>
        {!enrolled && (
          <p className="mt-1 text-xs text-zinc-400">
            指定した退所日までは引き続き食数計算に含まれ、翌日以降は除外されます。
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
        >
          キャンセル
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !online}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存する"}
        </button>
      </div>
    </div>
  );
}

function NewResidentForm({
  groups,
  online,
  onCreated,
}: {
  groups: Group[];
  online: boolean;
  onCreated: (resident: Resident) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [mealForm, setMealForm] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!online) {
      setError("オフラインのため登録できません。");
      return;
    }
    if (!name.trim() || !groupId) {
      setError("氏名・区分を入力してください。");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: dbError } = await supabase.rpc(
      "create_resident_with_default_pattern",
      {
        p_name: name.trim(),
        p_group_id: groupId,
        p_meal_form: mealForm,
      },
    );
    setSaving(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    onCreated({ id: data as string, name: name.trim(), groupId, mealForm, leftOn: null });
    setName("");
    setMealForm([]);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
      >
        ＋ 新規登録
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-4">
      <h2 className="font-medium text-zinc-900">利用者を新規登録</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs text-zinc-500">氏名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500">区分</label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.short_name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-zinc-500">食形態</label>
        <div className="mt-1">
          <MealFormCheckboxes value={mealForm} onChange={setMealForm} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          disabled={saving}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
        >
          キャンセル
        </button>
        <button
          onClick={handleCreate}
          disabled={saving || !online}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "登録中..." : "登録する"}
        </button>
      </div>
    </div>
  );
}

export default function ResidentsClient({
  initialResidents,
  groups,
}: {
  initialResidents: Resident[];
  groups: Group[];
}) {
  const [residents, setResidents] = useState(initialResidents);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const online = useOnlineStatus();

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.sort_order - b.sort_order),
    [groups],
  );

  const filtered = useMemo(() => {
    const list =
      groupFilter === "all" ? residents : residents.filter((r) => r.groupId === groupFilter);
    return [...list].sort((a, b) => {
      const ga = groupById.get(a.groupId)?.sort_order ?? 0;
      const gb = groupById.get(b.groupId)?.sort_order ?? 0;
      return ga - gb || a.name.localeCompare(b.name, "ja");
    });
  }, [residents, groupFilter, groupById]);

  function handleUpdated(next: Resident) {
    setResidents((prev) => prev.map((r) => (r.id === next.id ? next : r)));
    setEditingId(null);
  }

  function handleCreated(resident: Resident) {
    setResidents((prev) => [...prev, resident]);
  }

  return (
    <div className="space-y-6">
      {!online && <OfflineBanner message="オフラインのため登録・編集内容を保存できません。" />}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-zinc-600">
          区分:
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm"
          >
            <option value="all">すべて</option>
            {sortedGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.short_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2">氏名</th>
              <th className="px-3 py-2">区分</th>
              <th className="px-3 py-2">食形態</th>
              <th className="px-3 py-2">在籍</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <Fragment key={r.id}>
                <tr className="border-t border-zinc-100">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{groupById.get(r.groupId)?.short_name ?? ""}</td>
                  <td className="px-3 py-2 text-zinc-500">
                    {mealFormSuffix(r.mealForm).replace(/[()]/g, "") || "－"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        r.leftOn === null
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-zinc-200 text-zinc-600"
                      }`}
                    >
                      {r.leftOn === null ? "在籍" : "退所"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/default-meals?resident=${r.id}`}
                      className="mr-2 text-xs text-zinc-500 underline hover:text-zinc-700"
                    >
                      標準喫食パターン
                    </Link>
                    <button
                      onClick={() => setEditingId(editingId === r.id ? null : r.id)}
                      className="rounded-md border border-zinc-300 px-3 py-1 text-xs"
                    >
                      {editingId === r.id ? "閉じる" : "編集"}
                    </button>
                  </td>
                </tr>
                {editingId === r.id && (
                  <tr className="border-t border-zinc-100">
                    <td colSpan={5} className="px-3 py-3">
                      <ResidentEditForm
                        resident={r}
                        groups={sortedGroups}
                        online={online}
                        onCancel={() => setEditingId(null)}
                        onSaved={handleUpdated}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                  該当する利用者がいません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <NewResidentForm groups={sortedGroups} online={online} onCreated={handleCreated} />
    </div>
  );
}
