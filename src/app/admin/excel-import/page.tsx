import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import ExcelImportClient from "@/components/excel-import-client";

export default async function ExcelImportPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login");
  }
  if (profile?.role !== "admin") {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Excelアップロード</h1>
        <p className="mt-1 text-sm text-zinc-500">
          食数記録・職員食来客記録・利用者名簿の3シートを取り込みます。取り込み内容は確認画面で確定するまで反映されません。
        </p>
      </div>
      <ExcelImportClient />
    </main>
  );
}
