"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABEL,
  type DocumentCategory,
  type DocumentRow,
} from "@/lib/documents";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function UploadCard({
  category,
  current,
}: {
  category: DocumentCategory;
  current: DocumentRow | undefined;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("category", category);
    formData.append("file", file);

    const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
    const body = await res.json().catch(() => ({}));

    setUploading(false);
    if (!res.ok) {
      setError(body.message ?? "アップロードに失敗しました。");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-lg font-bold text-zinc-900">{DOCUMENT_CATEGORY_LABEL[category]}</h2>
      {current ? (
        <p className="mt-1 text-sm text-zinc-500">
          現在のファイル: {current.original_filename}（{formatDateTime(current.uploaded_at)} 更新）
        </p>
      ) : (
        <p className="mt-1 text-sm text-zinc-400">まだアップロードされていません。</p>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-3">
        <input
          type="file"
          name="file"
          required
          disabled={uploading}
          className="flex-1 text-sm text-zinc-700"
        />
        <button
          type="submit"
          disabled={uploading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {uploading ? "アップロード中..." : "アップロード"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function DocumentsClient({
  initialDocuments,
}: {
  initialDocuments: DocumentRow[];
}) {
  const byCategory = new Map(initialDocuments.map((d) => [d.category, d]));

  return (
    <div className="space-y-4">
      {DOCUMENT_CATEGORIES.map((category) => (
        <UploadCard key={category} category={category} current={byCategory.get(category)} />
      ))}
    </div>
  );
}
