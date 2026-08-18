"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateLabel } from "@/lib/board-date";

export type ShiftImportInfo = {
  id: string;
  startDate: string;
  endDate: string;
  originalFilename: string;
  uploadedAt: string;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ShiftImportStatus({ current }: { current: ShiftImportInfo | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  if (!current) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-sm text-zinc-400">現在アップロードされている勤務表はありません。</p>
      </div>
    );
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/shift-import/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: current!.id }),
    });
    const body = await res.json().catch(() => ({}));
    setDeleting(false);

    if (!res.ok) {
      setError(body.message ?? "削除に失敗しました。");
      return;
    }
    if (body.warning) {
      setWarning(body.warning);
    }
    setConfirming(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-sm font-medium text-zinc-700">現在アップロードされている勤務表</p>
      <p className="mt-1 text-sm text-zinc-600">
        対象期間: {formatDateLabel(current.startDate)} 〜 {formatDateLabel(current.endDate)}
      </p>
      <p className="text-xs text-zinc-400">
        {current.originalFilename} / {formatDateTime(current.uploadedAt)} アップロード
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {warning && <p className="mt-2 text-sm text-amber-600">{warning}</p>}

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          削除
        </button>
      ) : (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">
            この勤務表を削除すると、厨房タブレットの勤務表画面には「まだアップロードされていません」と表示されます。ファイルから読み取った日付紐づけの会議・行事予定も合わせて削除されます(手入力の行事・会議予定欄、掃除当番メモは削除されません)。本当に削除しますか？
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
            >
              キャンセル
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "削除中..." : "削除する"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
