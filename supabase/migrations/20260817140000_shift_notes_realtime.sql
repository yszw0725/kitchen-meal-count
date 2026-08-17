-- shift_notes(S2トップの連絡ノート)は notes-area に常時表示され、厨房
-- タブレットは開きっぱなしで運用されるため、他端末からの更新をリアルタイムに
-- 反映する必要がある(ユーザー指摘)。
--
-- REPLICA IDENTITY FULLへの変更は不要: UPDATEイベントのnew(更新後の値)は
-- 複製アイデンティティの設定に関わらず常に全カラムを含む。meal_exceptions等
-- でFULLが必要なのは、削除された行のoldからdate列を読み取って「表示中の
-- 日付に関係する変更か」を判定するためだが、shift_notesはシングルトン
-- (常に1件だけ、常に関係がある)のためその判定自体が不要。
--
-- menu_items/shift_entries/shift_events/shift_work_notesは、都度アクセスする
-- 画面(献立表・勤務表の専用ページ)のため、今回はRealtime対象外のまま
-- (ユーザー確認済み)。

alter publication supabase_realtime add table shift_notes;
