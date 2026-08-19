"use client";

import { useSyncExternalStore } from "react";
import { todayInTokyo } from "@/lib/board-date";

function subscribe(callback: () => void): () => void {
  // 日付が変わっている可能性があるタイミング(タブが前面に戻った時、
  // 定期的なタイマー)でReactに再評価させる。
  const interval = setInterval(callback, 60_000);
  document.addEventListener("visibilitychange", callback);
  return () => {
    clearInterval(interval);
    document.removeEventListener("visibilitychange", callback);
  };
}

function getSnapshot(): string {
  return todayInTokyo();
}

// サーバーでは「今日」の判定を保留する(null)。ここでtodayInTokyo()の実機値を
// 使うと、サーバーでの描画時刻とクライアントでのハイドレーション時刻が
// 日付境界(深夜0時前後)をまたいだ場合に結果が食い違い、hydrationエラーの
// 原因になる。
function getServerSnapshot(): string | null {
  return null;
}

/** 東京時間の「今日」の日付文字列を返す。マウント後にのみ確定する(SSR中はnull)。 */
export function useTodayInTokyo(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
