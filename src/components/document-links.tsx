"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABEL, type DocumentRow } from "@/lib/documents";

const SIGNED_URL_EXPIRES_IN = 60;

export default function DocumentLinks({ documents }: { documents: DocumentRow[] }) {
  const [opening, setOpening] = useState<string | null>(null);
  const byCategory = new Map(documents.map((d) => [d.category, d]));

  async function openDocument(storagePath: string, category: string) {
    setOpening(category);
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_IN);
    setOpening(null);
    if (error || !data) return;
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      {DOCUMENT_CATEGORIES.map((category) => {
        const doc = byCategory.get(category);
        const label = DOCUMENT_CATEGORY_LABEL[category];
        if (!doc) {
          return (
            <span
              key={category}
              className="cursor-not-allowed rounded-md border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-zinc-400"
              title="未アップロード"
            >
              {label}（未アップロード）
            </span>
          );
        }
        return (
          <button
            key={category}
            onClick={() => openDocument(doc.storage_path, category)}
            disabled={opening === category}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
