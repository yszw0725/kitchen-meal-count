-- Phase 1: RLS方針
-- 設計書 §5.5, §8.0 に対応
--
-- 【重要】meal_exceptions / daily_meal_extras / residents は
-- Excel取込サーバー処理 (service_role) 以外からの書込みを一切禁止する (§8.0)。
-- service_role は常にRLSをバイパスするため、これら3テーブルには
-- INSERT/UPDATE/DELETEポリシーを意図的に作成しない
-- (= authenticatedロールからの書込みはRLSにより自動的に拒否される)。
-- resident_default_meals はExcel由来ではない (標準パターンの管理項目) ため、
-- 従来通りadminによる直接書込みを許可する。

alter table profiles enable row level security;
alter table resident_groups enable row level security;
alter table residents enable row level security;
alter table resident_default_meals enable row level security;
alter table meal_exceptions enable row level security;
alter table kitchen_overrides enable row level security;
alter table daily_meal_extras enable row level security;
alter table import_batches enable row level security;
alter table count_overrides enable row level security;
alter table change_logs enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: 本人 + admin
-- ---------------------------------------------------------------------------

create policy profiles_select on profiles
  for select to authenticated
  using (id = auth.uid() or is_admin());

create policy profiles_insert on profiles
  for insert to authenticated
  with check (is_admin());

create policy profiles_update on profiles
  for update to authenticated
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

create policy profiles_delete on profiles
  for delete to authenticated
  using (is_admin());

-- ---------------------------------------------------------------------------
-- resident_groups / resident_default_meals: 認証済全員SELECT、書込みはadminのみ
-- ---------------------------------------------------------------------------

create policy resident_groups_select on resident_groups
  for select to authenticated using (true);

create policy resident_groups_admin_write on resident_groups
  for all to authenticated
  using (is_admin())
  with check (is_admin());

create policy resident_default_meals_select on resident_default_meals
  for select to authenticated using (true);

create policy resident_default_meals_admin_write on resident_default_meals
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- residents / meal_exceptions / daily_meal_extras:
-- 認証済全員SELECTのみ。書込みポリシーは作成しない (service_role専用)
-- ---------------------------------------------------------------------------

create policy residents_select on residents
  for select to authenticated using (true);

create policy meal_exceptions_select on meal_exceptions
  for select to authenticated using (true);

create policy daily_meal_extras_select on daily_meal_extras
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- kitchen_overrides: 認証済全員SELECT。
-- INSERTはadmin(任意日)またはkitchen(当日のみ)。UPDATE(解決)はadminのみ。
-- DELETEはadmin、またはkitchen本人が当日分を取り消す場合のみ。
-- ---------------------------------------------------------------------------

create policy kitchen_overrides_select on kitchen_overrides
  for select to authenticated using (true);

create policy kitchen_overrides_insert on kitchen_overrides
  for insert to authenticated
  with check (is_admin() or date = current_date);

create policy kitchen_overrides_update on kitchen_overrides
  for update to authenticated
  using (is_admin())
  with check (is_admin());

create policy kitchen_overrides_delete on kitchen_overrides
  for delete to authenticated
  using (is_admin() or (date = current_date and created_by = auth.uid()));

-- ---------------------------------------------------------------------------
-- import_batches: adminのみ全操作 (Excelアップロード関連。§8.0でkitchenは不可)
-- ---------------------------------------------------------------------------

create policy import_batches_admin_only on import_batches
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- count_overrides: 認証済全員SELECT、書込みはadminのみ (理由必須はNOT NULL制約で担保)
-- ---------------------------------------------------------------------------

create policy count_overrides_select on count_overrides
  for select to authenticated using (true);

create policy count_overrides_admin_write on count_overrides
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- change_logs: 認証済全員が閲覧のみ。書込みはlog_change()トリガ経由のみ
-- (security definerで table owner 権限で実行されるためRLSをバイパスする)
-- ---------------------------------------------------------------------------

create policy change_logs_select on change_logs
  for select to authenticated using (true);
