import Link from "next/link";

// /admin配下の全サブページ共通のナビゲーション。各ページに個別実装せず、
// ここに1箇所追加するだけで全サブページに反映される(ユーザー報告:
// 管理者画面からS2トップに戻る手段がブラウザの戻るボタンしかなかった)。
// Fragmentで返すことで、bodyがflex flex-colのまま各ページ自身の
// <main className="flex-1 ..."> の高さ計算に影響を与えないようにしている。
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="shrink-0 border-b border-zinc-200 bg-white px-6 py-2">
        <Link href="/" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← 食数表に戻る
        </Link>
      </div>
      {children}
    </>
  );
}
