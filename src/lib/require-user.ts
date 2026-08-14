import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * admin/kitchenを問わず、ログイン済みかつ有効なアカウントであることのみを確認する。
 *
 * ここで返す `supabase` はユーザーのセッションに紐づく、RLSが適用される
 * 通常クライアント。service_roleはExcel取込(apply_excel_import)など
 * 本来service_roleが担うべき処理にのみ使い、ユーザー操作の経路では使わない。
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ message: "認証が必要です。" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    return {
      error: NextResponse.json({ message: "アカウントが無効です。" }, { status: 403 }),
    };
  }

  return { user, profile, supabase };
}
