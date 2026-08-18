import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import MenuImportClient from "@/components/menu-import-client";
import MenuImportStatus from "@/components/menu-import-status";

export default async function MenuImportPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login");
  }
  if (profile?.role !== "admin") {
    notFound();
  }

  const supabase = await createClient();
  const { data: latestImport } = await supabase
    .from("menu_imports")
    .select("id, start_date, end_date, original_filename, uploaded_at")
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">週間献立表アップロード</h1>
        <p className="mt-1 text-sm text-zinc-500">
          既存の週間献立表(.xls)をそのままアップロードします。年の情報がファイルに無いため、対象週の開始日(月曜日)を指定してください。内容は確認画面で確定するまで反映されません。
        </p>
      </div>
      <MenuImportStatus
        current={
          latestImport
            ? {
                id: latestImport.id,
                startDate: latestImport.start_date,
                endDate: latestImport.end_date,
                originalFilename: latestImport.original_filename,
                uploadedAt: latestImport.uploaded_at,
              }
            : null
        }
      />
      <MenuImportClient />
    </main>
  );
}
