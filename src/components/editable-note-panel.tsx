"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type NoteInfo = {
  content: string;
  updatedAt: string | null;
};

function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// shift_events・shift_work_notesのように「常に最新1件を上書き編集する」
// シングルトンテーブル(id boolean primary key default true)向けの共通UI。
// 保存はupdateのみ(行は常に存在する前提のためupsertは使わない。upsertは
// INSERT権限も要求し、UPDATE専用のRLSポリシーと噛み合わないため。
// shift_notes実装時に判明した問題)。
export default function EditableNotePanel({
  table,
  title,
  emptyLabel,
  userId,
  initialNote,
  htmlId,
  rows = 3,
}: {
  table: "shift_events" | "shift_work_notes";
  title: string;
  emptyLabel: string;
  userId: string;
  initialNote: NoteInfo;
  htmlId?: string;
  rows?: number;
}) {
  const [note, setNote] = useState(initialNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNote.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setDraft(note.content);
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const updatedAt = new Date().toISOString();
    const { error: saveError } = await supabase
      .from(table)
      .update({ content: draft, updated_by: userId, updated_at: updatedAt })
      .eq("id", true);
    setSaving(false);
    if (saveError) {
      setError("保存に失敗しました。通信環境をご確認ください。");
      return;
    }
    setNote({ content: draft, updatedAt });
    setEditing(false);
  }

  const updatedAtLabel = formatUpdatedAt(note.updatedAt);

  return (
    <div id={htmlId} className="shrink-0 space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-700">{title}</h2>
        {!editing && (
          <button
            onClick={startEdit}
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            編集
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={rows}
            disabled={saving}
            className="w-full rounded-md border border-zinc-300 p-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-zinc-800">
          {note.content || <span className="text-zinc-400">{emptyLabel}</span>}
        </p>
      )}

      {updatedAtLabel && !editing && (
        <p className="text-right text-xs text-zinc-400">{updatedAtLabel} 更新</p>
      )}
    </div>
  );
}
