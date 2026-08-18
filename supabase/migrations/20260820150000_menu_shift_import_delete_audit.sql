-- 週間献立表・勤務表の削除機能追加に伴い、menu_imports/shift_importsの
-- 変更(挿入・削除)をchange_logsに記録できるよう監査トリガーを追加する。
--
-- これまでmenu_imports/menu_items/shift_imports等はExcel取込データ
-- (管理者による手動編集の対象外)という位置づけで監査対象外としていたが、
-- 今回admin操作による削除機能を追加するため、その操作履歴を追跡できる
-- 必要がある。menu_items/shift_entries/shift_date_events等の明細テーブルは
-- import_idのcascadeで連動削除されるだけなので、引き続き監査対象外のまま
-- とする(親のmenu_imports/shift_importsの記録から辿れるため)。

create trigger trg_log_menu_imports
after insert or delete on menu_imports
for each row execute function log_change('id');

create trigger trg_log_shift_imports
after insert or delete on shift_imports
for each row execute function log_change('id');
