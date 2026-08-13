# 厨房食数管理プラットフォーム

福祉施設向け厨房食数管理のWeb化プロジェクト。設計の詳細は `docs/厨房食数管理プラットフォーム_設計書_v2.3_確定版.md` を参照。

## 技術スタック

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase（PostgreSQL / Auth / Realtime / Storage）
- Vercel（ホスティング）

## セットアップ

```bash
npm install
cp .env.example .env.local  # Supabaseのプロジェクト情報を設定
npm run dev
```

`.env.local` に設定する値:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabaseプロジェクト設定から取得（クライアント公開可）
- `SUPABASE_SERVICE_ROLE_KEY`: サーバー専用。**絶対にクライアントに公開しない**（Excel取込API等でのみ使用）

## スクリプト

- `npm run dev` — 開発サーバー起動
- `npm run build` — 本番ビルド
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript型チェック（`tsc --noEmit`）

## ディレクトリ構成（Phase 0時点）

```
src/
  app/                 App Router
  lib/supabase/
    client.ts          ブラウザ用Supabaseクライアント
    server.ts           Server Component/Route Handler用クライアント
    middleware.ts        セッションリフレッシュ処理
  proxy.ts              Next.js Proxy（旧middleware）。認証セッションのリフレッシュ
docs/                   設計書・入力テンプレート
```

## 開発フェーズ

`docs/厨房食数管理プラットフォーム_設計書_v2.3_確定版.md` §10 を参照。現在: Phase 0（基盤構築）。
