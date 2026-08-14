-- Phase 0-7 横断セキュリティ監査での指摘対応
--
-- handle_new_user() / log_change() はトリガー専用関数(RETURNS TRIGGER)で、
-- トリガー発火に関数レベルのEXECUTE権限は不要 (対象テーブルへのINSERT/UPDATE/
-- DELETE権限があれば、トリガーはPostgresのトリガー機構により暗黙に実行される)。
-- CREATE FUNCTION のデフォルト挙動でPUBLICにEXECUTEが自動付与されており、
-- anon/authenticatedから直接RPC経由で呼び出せる状態になっていた。
--
-- RETURNS TRIGGER関数はトリガー文脈外で呼び出すとPostgres自体がエラーにする
-- ため実害はないが(NEW/OLDレコードが存在しないため)、最小権限の原則に沿って
-- 直接呼び出しの経路を明示的にふさぐ。

revoke execute on function handle_new_user() from public;
revoke execute on function handle_new_user() from anon;
revoke execute on function handle_new_user() from authenticated;

revoke execute on function log_change() from public;
revoke execute on function log_change() from anon;
revoke execute on function log_change() from authenticated;
