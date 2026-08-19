"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

// サーバーにはnavigatorが存在しないため、常にオンライン扱いで描画する。
// ここでnavigator.onLineの実機値を直接使うと、端末・ブラウザによっては
// ハイドレーション時点で既にfalseを返すことがあり、サーバー/クライアントの
// 初回描画が食い違って本番ビルドでhydrationエラー(React #418)となり、
// 以降のイベントハンドラが一切バインドされなくなる不具合を引き起こす。
function getServerSnapshot(): boolean {
  return true;
}

/** ブラウザのオンライン/オフライン状態を監視する。書き込み系画面の操作可否判定に使う。 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
