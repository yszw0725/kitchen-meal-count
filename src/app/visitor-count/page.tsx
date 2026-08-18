import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import VisitorCountClient from "@/components/visitor-count-client";

// 区分・利用者データと同様、来客数もNext.jsサーバーを経由せず
// クライアントからSupabaseへ直接問い合わせる(S5と同じ方式)。認証確認だけを
// サーバーで先に済ませる。
export default async function VisitorCountPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <VisitorCountClient />
    </main>
  );
}
