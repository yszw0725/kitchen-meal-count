import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import EmergencyEditClient from "@/components/emergency-edit-client";

// 区分・利用者・前日/当日の緊急上書きは、ここ(サーバーコンポーネント)ではなく
// EmergencyEditClient側でSupabaseクライアントに直接問い合わせる。認証確認だけを
// サーバーで先に済ませ、Next.jsサーバーの往復にデータ取得を乗せない (S3の日付切替と同じ方式)。
export default async function EmergencyEditPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4">
      <EmergencyEditClient />
    </main>
  );
}
