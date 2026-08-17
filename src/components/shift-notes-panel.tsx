"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ShiftNoteInfo = {
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

export default function ShiftNotesPanel({
  userId,
  initialNote,
}: {
  userId: string;
  initialNote: ShiftNoteInfo;
}) {
  const [note, setNote] = useState(initialNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNote.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 厨房タブレットは開きっぱなしで運用されるため、他端末からの更新を
  // リアルタイムに反映する。編集中(入力途中)に反映してdraftが消えて
  // しまわないよう、editingの最新値をrefで参照する(このeffectはマウント
  // 時に1度だけ実行するため、クロージャがeditingの初期値を固定してしまう
  // ことを避けるため)。
  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("shift-notes-changes");

    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "shift_notes" },
      (payload) => {
        if (editingRef.current) return; // 編集中は上書きしない(保存/キャンセル後に最新化)
        const row = payload.new as { content: string; updated_at: string };
        setNote({ content: row.content, updatedAt: row.updated_at });
      },
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function startEdit() {
    setDraft(note.content);
    setError(null);
    setEditing(true);
  }

  // 編集中に他端末からの更新イベントを取りこぼしている可能性があるため、
  // 編集を終える(保存/キャンセルいずれも)たびにDBから読み直して確定させる。
  // 保存直後の自分の書き込みも、これで正しく反映される。
  async function refetchNote() {
    const supabase = createClient();
    const { data } = await supabase
      .from("shift_notes")
      .select("content, updated_at")
      .eq("id", true)
      .single();
    if (data) setNote({ content: data.content, updatedAt: data.updated_at });
  }

  function cancelEdit() {
    setEditing(false);
    void refetchNote();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const updatedAt = new Date().toISOString();
    // 行は常に1件(id=true)存在する前提(シングルトン)のためupdateのみで足りる。
    // upsertはINSERT権限も必要とするため、UPDATE専用のRLSポリシーと噛み合わない。
    const { error: saveError } = await supabase
      .from("shift_notes")
      .update({ content: draft, updated_by: userId, updated_at: updatedAt })
      .eq("id", true);
    setSaving(false);
    if (saveError) {
      setError("保存に失敗しました。通信環境をご確認ください。");
      return;
    }
    setEditing(false);
    await refetchNote();
  }

  const updatedAtLabel = formatUpdatedAt(note.updatedAt);

  return (
    <div
      id="notes-area"
      className="shrink-0 space-y-2 rounded-lg border border-zinc-200 bg-white p-4 compact:p-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-700">連絡ノート（掃除当番など）</h2>
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
            rows={4}
            disabled={saving}
            className="w-full rounded-md border border-zinc-300 p-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={cancelEdit}
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
          {note.content || <span className="text-zinc-400">まだ何も書かれていません。</span>}
        </p>
      )}

      {updatedAtLabel && !editing && (
        <p className="text-right text-xs text-zinc-400">{updatedAtLabel} 更新</p>
      )}
    </div>
  );
}
