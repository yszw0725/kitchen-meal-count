"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Group = {
  id: string;
  name: string;
  short_name: string;
  sort_order: number;
  is_active: boolean;
};

export default function GroupsClient({ initialGroups }: { initialGroups: Group[] }) {
  const [groups, setGroups] = useState(
    [...initialGroups].sort((a, b) => a.sort_order - b.sort_order),
  );
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newShortName, setNewShortName] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("");
  const [adding, setAdding] = useState(false);

  function updateLocal(id: string, patch: Partial<Group>) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  async function handleSave(group: Group) {
    setSavingId(group.id);
    setError(null);
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("resident_groups")
      .update({
        name: group.name,
        short_name: group.short_name,
        sort_order: group.sort_order,
        is_active: group.is_active,
      })
      .eq("id", group.id);
    setSavingId(null);
    if (dbError) setError(dbError.message);
  }

  async function handleToggleActive(group: Group) {
    const next = { ...group, is_active: !group.is_active };
    updateLocal(group.id, { is_active: next.is_active });
    await handleSave(next);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newName.trim() || !newShortName.trim()) {
      setError("名称・表示名を入力してください。");
      return;
    }
    setAdding(true);
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("resident_groups")
      .insert({
        name: newName.trim(),
        short_name: newShortName.trim(),
        sort_order: Number(newSortOrder) || groups.length + 1,
      })
      .select("id, name, short_name, sort_order, is_active")
      .single();
    setAdding(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    setGroups((prev) => [...prev, data].sort((a, b) => a.sort_order - b.sort_order));
    setNewName("");
    setNewShortName("");
    setNewSortOrder("");
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">表示名</th>
              <th className="px-3 py-2">表示順</th>
              <th className="px-3 py-2">状態</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-t border-zinc-100">
                <td className="px-3 py-2">
                  <input
                    value={g.name}
                    onChange={(e) => updateLocal(g.id, { name: e.target.value })}
                    className="w-full rounded border border-zinc-300 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={g.short_name}
                    onChange={(e) => updateLocal(g.id, { short_name: e.target.value })}
                    className="w-full rounded border border-zinc-300 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={g.sort_order}
                    onChange={(e) =>
                      updateLocal(g.id, { sort_order: Number(e.target.value) })
                    }
                    className="w-16 rounded border border-zinc-300 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => handleToggleActive(g)}
                    className={`rounded-full px-2 py-1 text-xs font-bold ${
                      g.is_active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-zinc-200 text-zinc-600"
                    }`}
                  >
                    {g.is_active ? "有効" : "無効"}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => handleSave(g)}
                    disabled={savingId === g.id}
                    className="rounded-md border border-zinc-300 px-3 py-1 text-xs disabled:opacity-50"
                  >
                    {savingId === g.id ? "保存中..." : "保存"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleAdd} className="space-y-3 rounded-lg border border-zinc-200 p-4">
        <h2 className="font-medium text-zinc-900">区分を追加</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-zinc-500">名称</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">表示名</label>
            <input
              value={newShortName}
              onChange={(e) => setNewShortName(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">表示順</label>
            <input
              type="number"
              value={newSortOrder}
              onChange={(e) => setNewSortOrder(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={adding}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {adding ? "追加中..." : "追加"}
        </button>
      </form>
    </div>
  );
}
