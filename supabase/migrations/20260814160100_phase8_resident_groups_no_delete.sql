-- Phase 8: 区分(resident_groups)の物理削除をDBレベルで禁止する
--
-- 過去のmeal_exceptions/count_overrides等が区分を参照しているため、
-- 物理削除は整合性を壊しうる。無効化(is_active=false)のみで運用する方針とし、
-- UI上に削除ボタンを設けないだけでなく、RLSレベルでもDELETEポリシーを
-- 一切用意しないことで、admin操作であっても削除経路自体を塞ぐ。

drop policy if exists resident_groups_admin_write on resident_groups;

create policy resident_groups_admin_insert on resident_groups
  for insert to authenticated
  with check (is_admin());

create policy resident_groups_admin_update on resident_groups
  for update to authenticated
  using (is_admin())
  with check (is_admin());
