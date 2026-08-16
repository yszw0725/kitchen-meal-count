"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatAnnouncementDateTime, type AnnouncementRow } from "@/lib/announcements";

const DISMISS_KEY = "kitchen-meal-count:dismissed-announcement-id";

// localStorageはサーバーでは読めないため、useSyncExternalStoreで同期する
// (SSR時はgetServerSnapshotのnullを返し、hydration mismatchを避ける)。
// 同一タブ内でのdismiss()呼び出しも即座に画面へ反映されるよう、
// storageイベント(他タブの変更のみ発火)とは別に自前のリスナーへ通知する。
let dismissListeners: Array<() => void> = [];

function getDismissedIdSnapshot(): string | null {
  return localStorage.getItem(DISMISS_KEY);
}

function getServerDismissedIdSnapshot(): string | null {
  return null;
}

function subscribeDismissedId(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  dismissListeners.push(onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    dismissListeners = dismissListeners.filter((l) => l !== onChange);
  };
}

function dismissAnnouncement(id: string) {
  localStorage.setItem(DISMISS_KEY, id);
  dismissListeners.forEach((l) => l());
}

export default function AnnouncementBanner({
  initialLatest,
}: {
  initialLatest: AnnouncementRow | null;
}) {
  const [latest, setLatest] = useState(initialLatest);
  const dismissedId = useSyncExternalStore(
    subscribeDismissedId,
    getDismissedIdSnapshot,
    getServerDismissedIdSnapshot,
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("announcements-changes");

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "announcements" },
      async (payload) => {
        const row = payload.new as {
          id: string;
          content: string;
          created_at: string;
          created_by: string;
        };
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", row.created_by)
          .single();
        setLatest({
          id: row.id,
          content: row.content,
          created_at: row.created_at,
          poster_name: profile?.display_name ?? "管理者",
        });
      },
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!latest) return null;

  const isDismissed = dismissedId === latest.id;

  if (isDismissed) {
    return (
      <div className="shrink-0">
        <Link href="/announcements" className="text-sm text-zinc-500 underline hover:text-zinc-700">
          連絡事項を見る
        </Link>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 compact:py-1.5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-amber-700">
          連絡事項（{formatAnnouncementDateTime(latest.created_at)} {latest.poster_name}）
        </p>
        <p className="whitespace-pre-wrap text-sm text-amber-900 compact:line-clamp-1">
          {latest.content}
        </p>
      </div>
      <button
        onClick={() => dismissAnnouncement(latest.id)}
        className="shrink-0 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
      >
        確認しました
      </button>
    </div>
  );
}
