import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { isValidDateString, todayInTokyo } from "@/lib/board-date";
import VisitorCountClient from "@/components/visitor-count-client";

// 区分・利用者データと同様、来客数もNext.jsサーバーを経由せず
// クライアントからSupabaseへ直接問い合わせる(S5と同じ方式)。認証確認だけを
// サーバーで先に済ませる。
export default async function VisitorCountPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { user } = await getCurrentUserAndProfile();
  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  // "today"はサーバー側でこの1回だけ計算し、クライアントには確定値として渡す。
  // クライアント側でも独自にtodayInTokyo()を評価すると、サーバーでの描画時刻と
  // クライアントでのハイドレーション時刻がまたいだ日付境界(深夜0時前後)で
  // 結果が食い違い、hydrationエラーの原因になる。
  const initialDate = isValidDateString(params.date) ? params.date : todayInTokyo();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <VisitorCountClient initialDate={initialDate} />
    </main>
  );
}
