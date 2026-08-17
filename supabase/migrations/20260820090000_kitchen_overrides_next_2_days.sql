-- kitchen_overrides(欠食・臨時喫食の緊急直接入力)の編集可能日を、
-- 「前日・当日」から「当日〜翌々日」に変更する。
--
-- 前回(前日方向に範囲を広げる変更)は方向を誤っており、実際に必要
-- だったのは未来方向(翌日・翌々日)だった。今回の変更で前日は含めず、
-- 当日・翌日・翌々日の3日間を編集可能範囲とする。

alter table kitchen_overrides
  drop constraint kitchen_overrides_date_check;

alter table kitchen_overrides
  add constraint kitchen_overrides_date_check
  check (date >= jst_today() and date <= jst_today() + 2);

drop policy if exists kitchen_overrides_insert on kitchen_overrides;
drop policy if exists kitchen_overrides_update on kitchen_overrides;
drop policy if exists kitchen_overrides_delete on kitchen_overrides;

create policy kitchen_overrides_insert on kitchen_overrides
  for insert to authenticated
  with check (date >= jst_today() and date <= jst_today() + 2);

create policy kitchen_overrides_update on kitchen_overrides
  for update to authenticated
  using (date >= jst_today() and date <= jst_today() + 2)
  with check (date >= jst_today() and date <= jst_today() + 2);

create policy kitchen_overrides_delete on kitchen_overrides
  for delete to authenticated
  using (date >= jst_today() and date <= jst_today() + 2);
