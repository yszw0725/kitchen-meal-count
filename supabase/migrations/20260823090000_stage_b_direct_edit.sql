-- アプリ内管理への移行 段階B(食数のアプリ内直接編集を開放)
-- 設計書「アプリ内管理への移行設計書.md」§3.2・§4.2・§6(段階B)に対応。
--
-- meal_exceptions(欠食・臨時喫食)・daily_meal_extras(職員食・来客)を、
-- これまでのExcel取込(service_role)専用の書込みから、admin/kitchenとも
-- 直接・日付制限なくINSERT/UPDATE/DELETEできるように変更する。
-- kitchen_overrides・kitchen_visitor_overridesという「Excelとは別枠の
-- 当日限定上書き」という概念自体が不要になるため、既存データを
-- meal_exceptionsへ移行したうえで、get_day_boardの計算ロジックを
-- 2段階(meal_exceptions優先、無ければ標準パターン)に簡素化する。
--
-- kitchen_overrides・kitchen_visitor_overrides・import_batchesの
-- テーブル自体は、この段階ではまだ削除しない(段階Cで対応)。単に
-- get_day_boardから参照しなくなるだけで、Excel取込確認画面の競合確認
-- ロジック(kitchen_overridesを参照)は影響を受けない。

-- ---------------------------------------------------------------------------
-- 1. meal_exceptions に created_by を追加(誰が登録したかを記録)
-- ---------------------------------------------------------------------------

alter table meal_exceptions
  add column created_by uuid references profiles (id);

-- ---------------------------------------------------------------------------
-- 2. RLS変更: admin/kitchenとも日付制限なくINSERT/UPDATE/DELETE可能に
-- ---------------------------------------------------------------------------

create policy meal_exceptions_insert on meal_exceptions
  for insert to authenticated with check (true);
create policy meal_exceptions_update on meal_exceptions
  for update to authenticated using (true) with check (true);
create policy meal_exceptions_delete on meal_exceptions
  for delete to authenticated using (true);

create policy daily_meal_extras_insert on daily_meal_extras
  for insert to authenticated with check (true);
create policy daily_meal_extras_update on daily_meal_extras
  for update to authenticated using (true) with check (true);
create policy daily_meal_extras_delete on daily_meal_extras
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 3. kitchen_overrides の既存データを meal_exceptions へ移行
--
-- resolution='overwritten'(Excelアップロード確認画面で「Excelの内容を
-- 優先する」を管理者が選択済み)の行は、既にmeal_exceptions側の値が
-- 正として扱われているため移行対象外とする。それ以外(null/'kept')は、
-- 従来の優先順位(kitchen_overrides > meal_exceptions)を保つ形で
-- meal_exceptionsへ書き込む(既存行があれば上書き)。
-- 本番のkitchen_overridesは0件を確認済みのため実質的な移行対象は無い
-- 見込みだが、0件でない環境でも安全に動くよう on conflict で冪等にする。
-- ---------------------------------------------------------------------------

insert into meal_exceptions (resident_id, date, meal, type, created_by)
select ko.resident_id, ko.date, ko.meal, ko.type, ko.created_by
from kitchen_overrides ko
where coalesce(ko.resolution, '') <> 'overwritten'
on conflict (resident_id, date, meal) do update
set type = excluded.type, created_by = excluded.created_by;

-- ---------------------------------------------------------------------------
-- 4. get_day_board の計算ロジックを2段階に簡素化(設計書§4.2)
--
-- 変更前: kitchen_overrides > meal_exceptions > 標準パターン (3段階)
-- 変更後: meal_exceptions > 標準パターン (2段階)
-- kitchen_visitor_overridesも同様に参照しなくなり、daily_meal_extrasの
-- visitor_countを直接参照する。
--
-- effective_eats_status(p_date)が既にmeal_exceptions > 標準パターンの
-- 2段階を計算済みのため、その結果(s.eats)をそのまま使う形に変更する
-- (従来はここにさらにkitchen_overridesを上書きするcase式を挟んでいた)。
-- ---------------------------------------------------------------------------

create or replace function get_day_board(p_date date)
returns table (
  meal meal_type,
  groups jsonb,
  resident_total bigint,
  staff_count int,
  visitor_count int,
  cooking_total bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with group_agg as (
    select
      s.meal,
      s.group_id,
      s.short_name,
      s.group_sort_order,
      count(*) as enrolled_count,
      count(*) filter (where s.eats) as raw_actual_count,
      coalesce(
        array_agg(s.display_name order by s.display_name) filter (where not s.eats),
        array[]::text[]
      ) as absent_names,
      coalesce(
        array_agg(s.display_name order by s.display_name) filter (where not s.default_eats and s.eats),
        array[]::text[]
      ) as extra_names,
      coalesce(
        array_agg(s.display_name order by s.display_name) filter (where s.eats),
        array[]::text[]
      ) as present_names
    from effective_eats_status(p_date) s
    group by s.meal, s.group_id, s.short_name, s.group_sort_order
  ),
  group_final as (
    select
      ga.meal,
      ga.group_id,
      ga.short_name,
      ga.group_sort_order,
      ga.enrolled_count,
      coalesce(co.override_count, ga.raw_actual_count) as actual_count,
      (co.id is not null) as is_overridden,
      ga.absent_names,
      ga.extra_names,
      ga.present_names
    from group_agg ga
    left join count_overrides co
      on co.date = p_date and co.meal = ga.meal and co.group_id = ga.group_id
  ),
  meal_group_json as (
    select
      meal,
      jsonb_agg(
        jsonb_build_object(
          'group_id', group_id,
          'short_name', short_name,
          'enrolled_count', enrolled_count,
          'actual_count', actual_count,
          'is_overridden', is_overridden,
          'absent_names', to_jsonb(absent_names),
          'extra_names', to_jsonb(extra_names),
          'present_names', to_jsonb(present_names)
        ) order by group_sort_order
      ) as groups,
      sum(actual_count) as resident_total
    from group_final
    group by meal
  )
  select
    mgj.meal,
    mgj.groups,
    mgj.resident_total,
    coalesce(dme.staff_count, 0) as staff_count,
    coalesce(dme.visitor_count, 0) as visitor_count,
    mgj.resident_total
      + coalesce(dme.staff_count, 0)
      + coalesce(dme.visitor_count, 0) as cooking_total
  from meal_group_json mgj
  left join daily_meal_extras dme on dme.date = p_date and dme.meal = mgj.meal
  order by array_position(enum_range(null::meal_type), mgj.meal);
$$;

revoke execute on function get_day_board(date) from public;
revoke execute on function get_day_board(date) from anon;
grant execute on function get_day_board(date) to authenticated;
