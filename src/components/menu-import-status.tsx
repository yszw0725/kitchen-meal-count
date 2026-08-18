"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateLabel } from "@/lib/board-date";

export type MenuImportInfo = {
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

function MenuImportRow({ item }: { item: MenuImportInfo }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/menu-import/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }),
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
      <p className="text-sm text-zinc-600">
        対象週: {formatDateLabel(item.startDate)} 〜 {formatDateLabel(item.endDate)}
      </p>
      <p className="text-xs text-zinc-400">
        {item.originalFilename} / {formatDateTime(item.uploadedAt)} アップロード
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
            この献立表を削除すると、厨房タブレットの献立表画面でこの週を閲覧できなくなります。本当に削除しますか？
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

export default function MenuImportStatus({ items }: { items: MenuImportInfo[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-sm text-zinc-400">現在アップロードされている献立表はありません。</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-zinc-700">
        アップロード済みの週間献立表({items.length}件)
      </p>
      {items.map((item) => (
        <MenuImportRow key={item.id} item={item} />
      ))}
    </div>
  );
}
