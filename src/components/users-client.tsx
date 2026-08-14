"use client";

import { useState } from "react";
import { useOnlineStatus } from "@/lib/use-online-status";
import OfflineBanner from "@/components/offline-banner";

type User = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "kitchen";
  isActive: boolean;
};

export default function UsersClient({ users }: { users: User[] }) {
  const [issued, setIssued] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const online = useOnlineStatus();

  async function handleReset(userId: string) {
    if (!online) {
      setError("オフラインのため操作できません。");
      return;
    }
    setPendingId(userId);
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: "POST",
    });
    const body = await res.json();
    setPendingId(null);

    if (!res.ok) {
      setError(body.message ?? "パスワードの再発行に失敗しました。");
      return;
    }
    setIssued((prev) => ({ ...prev, [userId]: body.password }));
  }

  return (
    <div className="space-y-4">
      {!online && <OfflineBanner message="オフラインのためパスワード再発行はできません。" />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {users.map((u) => (
        <div key={u.id} className="rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-zinc-900">
                {u.displayName}
                <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                  {u.role === "admin" ? "管理者" : "厨房"}
                </span>
                {!u.isActive && (
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                    無効
                  </span>
                )}
              </p>
              <p className="text-sm text-zinc-500">{u.email}</p>
            </div>
            <button
              onClick={() => handleReset(u.id)}
              disabled={pendingId === u.id || !online}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {pendingId === u.id ? "発行中..." : "パスワードを再発行"}
            </button>
          </div>

          {issued[u.id] && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900">
                新しいパスワード（この場でのみ表示されます。控えてから閉じてください）
              </p>
              <p className="mt-1 font-mono text-base text-amber-950">{issued[u.id]}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
