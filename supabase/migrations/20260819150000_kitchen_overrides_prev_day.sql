-- kitchen_overrides(欠食・臨時喫食の緊急直接入力)の編集可能日を、
-- 「当日のみ」から「前日と当日」に拡大する。
--
-- 設計書§8.0で確定していた「当日のみ」方針からの変更。前日分の連絡が
-- 翌日になってから厨房に伝わるケースがあり、当日のみだと前日分を厨房から
-- 直接修正できず不便なため。

alter table kitchen_overrides
  drop constraint kitchen_overrides_date_check;

alter table kitchen_overrides
  add constraint kitchen_overrides_date_check
  check (date >= jst_today() - 1 and date <= jst_today());

drop policy if exists kitchen_overrides_insert on kitchen_overrides;
drop policy if exists kitchen_overrides_update on kitchen_overrides;
drop policy if exists kitchen_overrides_delete on kitchen_overrides;

create policy kitchen_overrides_insert on kitchen_overrides
  for insert to authenticated
  with check (date >= jst_today() - 1 and date <= jst_today());

create policy kitchen_overrides_update on kitchen_overrides
  for update to authenticated
  using (date >= jst_today() - 1 and date <= jst_today())
  with check (date >= jst_today() - 1 and date <= jst_today());

create policy kitchen_overrides_delete on kitchen_overrides
  for delete to authenticated
  using (date >= jst_today() - 1 and date <= jst_today());
