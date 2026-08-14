"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { BoardMeal } from "@/lib/board-types";
import { useOnlineStatus } from "@/lib/use-online-status";
import DayBoardView from "@/components/day-board-view";
import ConnectionIndicator from "@/components/connection-indicator";
import OfflineBanner from "@/components/offline-banner";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const HIGHLIGHT_DURATION_MS = 1000;
const WATCHED_TABLES = [
  "meal_exceptions",
  "daily_meal_extras",
  "kitchen_overrides",
  "residents",
] as const;

function diffHighlightKeys(prev: BoardMeal[], next: BoardMeal[]): Set<string> {
  const changed = new Set<string>();
  for (const m of next) {
    const prevMeal = prev.find((p) => p.meal === m.meal);
    if (!prevMeal || prevMeal.cooking_total !== m.cooking_total) {
      changed.add(`${m.meal}:total`);
    }
    for (const g of m.groups) {
      const prevGroup = prevMeal?.groups.find((pg) => pg.group_id === g.group_id);
      const same =
        prevGroup &&
        prevGroup.actual_count === g.actual_count &&
        prevGroup.absent_names.join() === g.absent_names.join() &&
        prevGroup.present_names.join() === g.present_names.join() &&
        prevGroup.extra_names.join() === g.extra_names.join();
      if (!same) changed.add(`${m.meal}:${g.group_id}`);
    }
  }
  return changed;
}

export default function DayBoardRealtime({
  date,
  initialBoard,
}: {
  date: string;
  initialBoard: BoardMeal[];
}) {
  const [board, setBoard] = useState(initialBoard);
  const [channelOnline, setChannelOnline] = useState(true);
  const browserOnline = useOnlineStatus();
  const online = channelOnline && browserOnline;
  const [lastUpdated, setLastUpdated] = useState(() => new Date());
  const [highlightKeys, setHighlightKeys] = useState<Set<string>>(new Set());

  // 表示中の日付が変わったら、サーバーから渡された最新データで表示し直す
  // (レンダー中にstateを調整するReact推奨パターン。エフェクトは使わない)
  const [renderedDate, setRenderedDate] = useState(date);
  if (date !== renderedDate) {
    setRenderedDate(date);
    setBoard(initialBoard);
    setHighlightKeys(new Set());
    setLastUpdated(new Date());
  }

  const boardRef = useRef(board);
  const dateRef = useRef(date);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_day_board", {
      p_date: dateRef.current,
    });
    if (error || !data) return;

    const nextBoard = data as BoardMeal[];
    const changed = diffHighlightKeys(boardRef.current, nextBoard);

    setBoard(nextBoard);
    setLastUpdated(new Date());
    if (changed.size > 0) {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      setHighlightKeys(changed);
      highlightTimer.current = setTimeout(
        () => setHighlightKeys(new Set()),
        HIGHLIGHT_DURATION_MS,
      );
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("day-board-changes");

    for (const table of WATCHED_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          // イベントのpayloadは直接信用せず、関連しそうであればサーバーへ再取得しにいく
          if (table === "residents") {
            refetch();
            return;
          }
          const row = (payload.new ?? payload.old) as { date?: string } | null;
          if (row?.date === dateRef.current) refetch();
        },
      );
    }

    channel.subscribe((status) => {
      const isSubscribed = status === "SUBSCRIBED";
      setChannelOnline(isSubscribed);
      if (isSubscribed) refetch(); // 再接続時に取りこぼしを回収
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") refetch();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    const interval = setInterval(refetch, POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    };
  }, [refetch]);

  // ブラウザのネットワーク接続が復旧したタイミングでも取りこぼしを回収する
  useEffect(() => {
    if (browserOnline) refetch();
  }, [browserOnline, refetch]);

  return (
    <div className="space-y-4">
      {!online && <OfflineBanner />}

      <DayBoardView date={date} board={board} highlightKeys={highlightKeys} />

      <div className="flex justify-center pt-4">
        {online ? (
          <Link
            href="/emergency-edit"
            className="rounded-lg bg-zinc-900 px-6 py-3 text-base font-medium text-white hover:bg-zinc-800"
          >
            ＋ 欠食・喫食を登録（緊急入力）
          </Link>
        ) : (
          <span className="cursor-not-allowed rounded-lg bg-zinc-300 px-6 py-3 text-base font-medium text-zinc-500">
            ＋ 欠食・喫食を登録（通信復旧後に操作できます）
          </span>
        )}
      </div>

      <ConnectionIndicator online={online} lastUpdated={lastUpdated} />
    </div>
  );
}
