-- Phase 6: Realtime配信の有効化 (設計書 §9)
--
-- postgres_changes を購読できるよう、対象4テーブルを supabase_realtime
-- publicationに追加する。DELETE/UPDATE時にクライアント側で「表示中日付に
-- 関係する変更か」を判定できるよう、REPLICA IDENTITY FULL にして
-- old行の全カラム(dateを含む)がpayloadに含まれるようにする
-- (既定のREPLICA IDENTITY DEFAULTだとold行は主キー列のみになり、
--  id主キーのmeal_exceptions/kitchen_overridesではdateが欠落してしまう)。

alter table meal_exceptions replica identity full;
alter table daily_meal_extras replica identity full;
alter table kitchen_overrides replica identity full;
alter table residents replica identity full;

alter publication supabase_realtime add table meal_exceptions;
alter publication supabase_realtime add table daily_meal_extras;
alter publication supabase_realtime add table kitchen_overrides;
alter publication supabase_realtime add table residents;
