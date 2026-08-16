import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/current-user";

export default async function AdminPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login");
  }

  if (profile?.role !== "admin") {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-8">
      <h1 className="text-2xl font-bold text-zinc-900">管理者画面</h1>
      <p className="text-zinc-600">
        この画面はadminロールのユーザーのみアクセスできます。
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/excel-import"
          className="rounded-md bg-zinc-900 px-4 py-2 text-white transition-colors hover:bg-zinc-800"
        >
          Excelアップロード
        </Link>
        <Link
          href="/admin/count-overrides"
          className="rounded-md border border-zinc-300 px-4 py-2 text-zinc-800 transition-colors hover:bg-zinc-50"
        >
          実食数の手動修正
        </Link>
        <Link
          href="/admin/monthly-summary"
          className="rounded-md border border-zinc-300 px-4 py-2 text-zinc-800 transition-colors hover:bg-zinc-50"
        >
          月次集計
        </Link>
        <Link
          href="/admin/groups"
          className="rounded-md border border-zinc-300 px-4 py-2 text-zinc-800 transition-colors hover:bg-zinc-50"
        >
          区分管理
        </Link>
        <Link
          href="/admin/default-meals"
          className="rounded-md border border-zinc-300 px-4 py-2 text-zinc-800 transition-colors hover:bg-zinc-50"
        >
          標準喫食パターン編集
        </Link>
        <Link
          href="/admin/users"
          className="rounded-md border border-zinc-300 px-4 py-2 text-zinc-800 transition-colors hover:bg-zinc-50"
        >
          ユーザー管理
        </Link>
        <Link
          href="/admin/documents"
          className="rounded-md border border-zinc-300 px-4 py-2 text-zinc-800 transition-colors hover:bg-zinc-50"
        >
          資料アップロード
        </Link>
        <Link
          href="/history"
          className="rounded-md border border-zinc-300 px-4 py-2 text-zinc-800 transition-colors hover:bg-zinc-50"
        >
          変更履歴
        </Link>
      </div>
    </main>
  );
}
