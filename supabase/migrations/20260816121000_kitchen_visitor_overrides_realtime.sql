-- kitchen_visitor_overrides新設時に、既存4テーブル(meal_exceptions/
-- daily_meal_extras/kitchen_overrides/residents)と同様のRealtime配信設定
-- (REPLICA IDENTITY FULL + supabase_realtime publicationへの追加)を
-- 行い忘れていた。このままではS2トップを開いたまま来客数上書きが行われても
-- postgres_changesイベントが飛ばず、次回ページ遷移まで反映されない。

alter table kitchen_visitor_overrides replica identity full;
alter publication supabase_realtime add table kitchen_visitor_overrides;
