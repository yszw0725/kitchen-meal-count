import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/** admin/kitchenを問わず、ログイン済みかつ有効なアカウントであることのみを確認する。 */
export async function requireUser() {
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
    .select("role, display_name, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    return {
      error: NextResponse.json({ message: "アカウントが無効です。" }, { status: 403 }),
    };
  }

  return { user, profile, service };
}
