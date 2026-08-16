-- kitchen_overrides.date は「date = current_date」で当日固定していたが、
-- current_date はPostgresセッション(このプロジェクトではUTC)の日付であり、
-- アプリ側が「当日」とみなす日本時間の日付(todayInTokyo())とは
-- 日本時間0:00〜8:59の間ズレる。この間はCHECK制約・RLSの両方が
-- UTC基準で「当日」を判定してしまい、S5(欠食・臨時喫食登録)からの
-- 正当な当日分INSERT/UPDATE/DELETEが失敗していた。
--
-- 日本時間相当の日付で判定するよう、CHECK制約とRLSポリシーを
-- jst_today() に差し替える。

create or replace function jst_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Tokyo')::date;
$$;

alter table kitchen_overrides
  drop constraint kitchen_overrides_date_check;

alter table kitchen_overrides
  add constraint kitchen_overrides_date_check check (date = jst_today());

drop policy if exists kitchen_overrides_insert on kitchen_overrides;
drop policy if exists kitchen_overrides_update on kitchen_overrides;
drop policy if exists kitchen_overrides_delete on kitchen_overrides;

create policy kitchen_overrides_insert on kitchen_overrides
  for insert to authenticated
  with check (date = jst_today());

create policy kitchen_overrides_update on kitchen_overrides
  for update to authenticated
  using (date = jst_today())
  with check (date = jst_today());

create policy kitchen_overrides_delete on kitchen_overrides
  for delete to authenticated
  using (date = jst_today());
