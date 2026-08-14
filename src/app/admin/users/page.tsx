import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/current-user";
import { createServiceClient } from "@/lib/supabase/service";
import UsersClient from "@/components/users-client";

export default async function UsersPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login");
  if (profile?.role !== "admin") notFound();

  const service = createServiceClient();
  const [{ data: authUsers }, { data: profiles }] = await Promise.all([
    service.auth.admin.listUsers(),
    service.from("profiles").select("id, display_name, role, is_active"),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const users = authUsers.users
    .map((u) => {
      const p = profileById.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        displayName: p?.display_name ?? u.email ?? "(不明)",
        role: p?.role ?? "kitchen",
        isActive: p?.is_active ?? true,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">ユーザー管理</h1>
        <p className="mt-1 text-sm text-zinc-500">
          共用アカウント運用のため、権限はadmin/kitchenの2種類のみです。パスワード再発行のみ行えます。
        </p>
      </div>
      <UsersClient users={users} />
    </main>
  );
}
