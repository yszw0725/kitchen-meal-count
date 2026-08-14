import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import SignOutButton from "@/components/sign-out-button";

export default async function HomePage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!user) {
    redirect("/login");
  }

  const role = profile?.role ?? "kitchen";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">厨房食数管理</h1>
        <SignOutButton />
      </div>

      <div className="rounded-lg border border-zinc-200 p-4">
        <p className="text-sm text-zinc-500">ログイン中</p>
        <p className="text-lg font-medium text-zinc-900">
          {profile?.display_name ?? user.email}
        </p>
        <p className="text-sm text-zinc-500">
          権限: {role === "admin" ? "管理者" : "厨房"}
        </p>
      </div>

      {role === "admin" && (
        <Link
          href="/admin"
          className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-white transition-colors hover:bg-zinc-800"
        >
          管理者画面へ
        </Link>
      )}
    </main>
  );
}
