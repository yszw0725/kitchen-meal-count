-- kitchen_overrides の UPDATE/DELETE を「所有者限定」から
-- 「認証済みユーザー(admin/kitchen) かつ 対象行の date が current_date であること」
-- に差し替える。
--
-- 背景: kitchen_overrides は共用アカウント運用が前提 (§11で確定) であり、
-- 「誰が登録したか」ではなく「当日分かどうか」だけがDB層で担保すべき制約。
-- created_by = auth.uid() という所有者限定は、共用アカウントの別セッションや
-- admin/kitchen間での取り消し操作をブロックしてしまい、要件と噛み合わない。
--
-- これに伴い、ユーザー操作経路(/api/kitchen-overrides/toggle)はservice_role
-- バイパスをやめ、通常のRLS適用クライアントで操作する。service_roleは
-- Excel取込(apply_excel_import)など本来service_roleが担うべき処理にのみ残す。
--
-- なお kitchen_overrides.date は列のcheck制約で常にcurrent_dateに固定されている
-- ため、is_admin()による「任意日许可」は実質的に意味を持たない(admin/kitchen
-- どちらであっても行のdateはcurrent_date以外になり得ない)。そのため
-- INSERTポリシーも同じ条件に統一し、3ポリシーとも一貫させる。

drop policy if exists kitchen_overrides_insert on kitchen_overrides;
drop policy if exists kitchen_overrides_update on kitchen_overrides;
drop policy if exists kitchen_overrides_delete on kitchen_overrides;

create policy kitchen_overrides_insert on kitchen_overrides
  for insert to authenticated
  with check (date = current_date);

create policy kitchen_overrides_update on kitchen_overrides
  for update to authenticated
  using (date = current_date)
  with check (date = current_date);

create policy kitchen_overrides_delete on kitchen_overrides
  for delete to authenticated
  using (date = current_date);
