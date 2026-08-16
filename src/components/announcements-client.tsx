"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatAnnouncementDateTime, type AnnouncementRow } from "@/lib/announcements";

export default function AnnouncementsClient({
  initialAnnouncements,
  isAdmin,
  userId,
}: {
  initialAnnouncements: AnnouncementRow[];
  isAdmin: boolean;
  userId: string;
}) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    setPosting(true);
    setError(null);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("announcements")
      .insert({ content: trimmed, created_by: userId })
      .select("id, content, created_at")
      .single();

    setPosting(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "投稿に失敗しました。");
      return;
    }

    setAnnouncements((prev) => [
      { id: data.id, content: data.content, created_at: data.created_at, poster_name: "あなた" },
      ...prev,
    ]);
    setContent("");
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <form
          onSubmit={handleSubmit}
          className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4"
        >
          <label htmlFor="announcement-content" className="block text-sm font-medium text-zinc-700">
            新しい連絡事項を投稿
          </label>
          <textarea
            id="announcement-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            required
            disabled={posting}
            className="w-full rounded-md border border-zinc-300 p-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={posting || !content.trim()}
              className="ml-auto rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {posting ? "投稿中..." : "投稿する"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {announcements.length === 0 && (
          <p className="p-4 text-center text-zinc-400">連絡事項はまだありません。</p>
        )}
        {announcements.map((a) => (
          <div key={a.id} className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">
              {formatAnnouncementDateTime(a.created_at)} {a.poster_name}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{a.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
