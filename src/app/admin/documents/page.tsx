import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRow } from "@/lib/documents";
import DocumentsClient from "@/components/documents-client";

export default async function AdminDocumentsPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") notFound();

  const supabase = await createClient();
  const { data: documents } = await supabase
    .from("documents")
    .select("category, storage_path, original_filename, uploaded_at");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">資料アップロード</h1>
        <p className="mt-1 text-sm text-zinc-500">
          週間献立表・勤務表・発注書をアップロードします。各区分1件のみ保持され、新しいファイルをアップロードすると既存のファイルは置き換わります(差し替え履歴は残りません)。
        </p>
      </div>
      <DocumentsClient initialDocuments={(documents ?? []) as DocumentRow[]} />
    </main>
  );
}
