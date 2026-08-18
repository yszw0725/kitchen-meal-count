# 段階C: kitchen_overrides・kitchen_visitor_overrides・import_batches テーブル削除

対象: `docs/アプリ内管理への移行設計書.md` 段階C(§6)。

**実行日: 未定。** コード側の撤去(`feature/stage-c-remove-excel-food-import`、PR #31)は本番反映済みだが、
テーブル自体のDROPは別途確認のうえで実施する。本ドキュメントはその際に使うSQLを事前に用意しておくもの。

前提として、コード側(APIルート・画面・`day-board-realtime.tsx`のRealtime購読対象)から
これら3テーブルへの参照は既に削除済み(`change-log-summary.ts`の`table_name`文字列比較のみ意図的に残置。
実テーブルへの問い合わせは無いため、削除しても壊れない)。

## 実行前確認SQL

```sql
select 'kitchen_overrides' as t, count(*) from kitchen_overrides
union all select 'kitchen_visitor_overrides', count(*) from kitchen_visitor_overrides
union all select 'import_batches', count(*) from import_batches;
```

## テーブル削除用SQL

`import_batches`には`meal_exceptions.source_batch_id`・`daily_meal_extras.source_batch_id`のFKが
向いているため、先に列を削除する(設計書§3.2の2案「廃止／null許容のまま残置」のうち「廃止」を採用)。
あわせて、この3テーブルに依存していた`apply_excel_import`関数(Excel取込確認画面から呼ばれていたSQL関数)も、
呼び出し元が無くなったため一緒に削除する。

```sql
begin;

-- source_batch_id(廃止方針。設計書§3.2)
alter table meal_exceptions drop column source_batch_id;
alter table daily_meal_extras drop column source_batch_id;

-- 呼び出し元が無くなった関数
drop function if exists apply_excel_import(uuid, jsonb, jsonb, jsonb, jsonb, jsonb);

drop table kitchen_overrides;
drop table kitchen_visitor_overrides;
drop table import_batches;

commit;
```

## Storageバケット(excel-imports)の削除手順

`storage.objects`はトリガーで直接SQL DELETEが保護されているため、Storage API
(Supabaseダッシュボード)経由で削除する。

1. ダッシュボード → Storage → `excel-imports` バケットを開く
2. バケット内のファイルを全選択して削除
3. バケット自体を削除

あわせて、バケット専用のRLSポリシーもバケット削除後に不要になるため削除する。

```sql
drop policy if exists "excel_imports_admin_select" on storage.objects;
```
