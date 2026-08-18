import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import ShiftImportClient from "@/components/shift-import-client";
import ShiftImportStatus from "@/components/shift-import-status";

export default async function ShiftImportPage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login");
  }
  if (profile?.role !== "admin") {
    notFound();
  }

  const supabase = await createClient();
  const { data: imports } = await supabase
    .from("shift_imports")
    .select("id, start_date, end_date, original_filename, uploaded_at")
    .order("start_date", { ascending: true });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">勤務表アップロード</h1>
        <p className="mt-1 text-sm text-zinc-500">
          既存の勤務表(.xlsx)をそのままアップロードします。対象期間の開始日(4週間サイクルの第1週の月曜日)を指定してください。内容は確認画面で確定するまで反映されません。アップロード済みの期間は、削除するまですべて閲覧できます。
        </p>
      </div>
      <ShiftImportStatus
        items={(imports ?? []).map((row) => ({
          id: row.id,
          startDate: row.start_date,
          endDate: row.end_date,
          originalFilename: row.original_filename,
          uploadedAt: row.uploaded_at,
        }))}
      />
      <ShiftImportClient />
    </main>
  );
}
