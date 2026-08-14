// 厨房食数管理 Service Worker
//
// 方針(設計書§9): オフライン編集は許可しない。この Service Worker は
// 「最後に取得した表示データを閲覧できる状態に保つ」ことだけを目的とし、
// 書き込みリクエストのキャッシュ・キューイングは一切行わない。

const CACHE_NAME = "kitchen-meal-count-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // 書き込み系(POST/PUT/PATCH/DELETE)は素通しし、キャッシュにもキューにも入れない。
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // 他オリジン(Supabase等)への通信は対象外。常に最新のレスポンスのみを扱う。
  if (url.origin !== self.location.origin) {
    return;
  }

  // Next.jsのAPI Route(/api/*)は書き込み系を含みうるため対象外。
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // ネットワーク優先。取得できたら表示用キャッシュを更新し、
  // オフライン等で取得できない場合のみ直近キャッシュへフォールバックする。
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
