-- Phase 1 修正: SECURITY DEFINER関数へのanonロールからの実行を明示的に禁止
--
-- Supabaseはスキーマ作成時のデフォルト権限で anon/authenticated/service_role に
-- EXECUTE を自動付与するため、"revoke ... from public" だけでは anon の実行権限が
-- 残ってしまう。RLSをバイパスするSECURITY DEFINER関数がanonから呼べると
-- §8.1「匿名アクセスは一切不可」に反するため、個別に剥奪する。

revoke execute on function get_day_board(date) from anon;
revoke execute on function is_admin() from anon;
