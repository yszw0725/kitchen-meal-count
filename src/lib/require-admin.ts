import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ message: "認証が必要です。" }, { status: 401 }) };
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin" || !profile.is_active) {
    return {
      error: NextResponse.json({ message: "管理者権限が必要です。" }, { status: 403 }),
    };
  }

  return { user, service };
}
