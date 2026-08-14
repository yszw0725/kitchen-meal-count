"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 登録に失敗してもアプリの動作自体には影響しないため握りつぶす
      });
    }
  }, []);

  return null;
}
