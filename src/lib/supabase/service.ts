import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * service_role キーを使うサーバー専用クライアント。RLSを全てバイパスするため、
 * Route Handler内でのadmin権限チェック後にのみ使用すること。
 * ブラウザ向けコードから import しないこと (SUPABASE_SERVICE_ROLE_KEY はサーバー限定)。
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
