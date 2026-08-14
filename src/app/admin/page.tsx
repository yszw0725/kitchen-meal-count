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
      <Link
        href="/admin/excel-import"
        className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-white transition-colors hover:bg-zinc-800"
      >
        Excelアップロード
      </Link>
    </main>
  );
}
