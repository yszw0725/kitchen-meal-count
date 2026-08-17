-- get_day_board の absent_names(入所グループの欠食者一覧)算出ロジックの
-- 不具合修正。
--
-- 従来: filter (where default_eats and not eats)
-- → 「個人の標準パターン(default_eats)がtrue(=通常は食べる)なのに今日は
--   食べない」場合のみを欠食者として抽出していた。そのため、個人の標準
--   パターン自体がfalseに設定されている利用者(実習等で毎週決まった曜日に
--   欠食するのが、その人にとってはもはや例外ではなく通常のパターンその
--   ものであるケース)は、default_eats=falseの時点でこの条件に合致せず、
--   欠食者一覧に一切表示されなかった(調理必要数には正しく反映されていた)。
--
-- 修正: filter (where not eats) に変更。GH側で既に採用している
-- present_names(filter where eats、default_eatsとの比較なし)と同じ考え方に
-- 揃え、「その食事を食べない人全員」を無条件に欠食者として抽出する。
-- 個人の標準パターンによる恒常的な欠食も、一時的な例外による欠食も、
-- どちらも表示されるようになる。
--
-- なお、present_names(filter where eats)・extra_names
-- (filter where not default_eats and eats、「通常は食べないのに今日は
-- 食べる」臨時喫食のハイライト用)は変更しない。absent_names/present_names
-- は「食べない/食べる」で完全に対になり、GH側の表示(present_names採用)には
-- 影響しない(absent_namesはフロント側でGH以外の区分にのみ使われるため)。

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
  with status as (
    select
      s.resident_id,
      s.display_name,
      s.group_id,
      s.short_name,
      s.group_sort_order,
      s.meal,
      s.default_eats,
      case
        when ko.type is not null and coalesce(ko.resolution, '') <> 'overwritten'
          then (ko.type = 'present')
        else s.eats
      end as eats
    from effective_eats_status(p_date) s
    left join kitchen_overrides ko
      on ko.resident_id = s.resident_id and ko.date = p_date and ko.meal = s.meal
  ),
  group_agg as (
    select
      meal,
      group_id,
      short_name,
      group_sort_order,
      count(*) as enrolled_count,
      count(*) filter (where eats) as raw_actual_count,
      coalesce(
        array_agg(display_name order by display_name) filter (where not eats),
        array[]::text[]
      ) as absent_names,
      coalesce(
        array_agg(display_name order by display_name) filter (where not default_eats and eats),
        array[]::text[]
      ) as extra_names,
      coalesce(
        array_agg(display_name order by display_name) filter (where eats),
        array[]::text[]
      ) as present_names
    from status
    group by meal, group_id, short_name, group_sort_order
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
    coalesce(kvo.visitor_count, dme.visitor_count, 0) as visitor_count,
    mgj.resident_total
      + coalesce(dme.staff_count, 0)
      + coalesce(kvo.visitor_count, dme.visitor_count, 0) as cooking_total
  from meal_group_json mgj
  left join daily_meal_extras dme on dme.date = p_date and dme.meal = mgj.meal
  left join kitchen_visitor_overrides kvo on kvo.date = p_date and kvo.meal = mgj.meal
  order by array_position(enum_range(null::meal_type), mgj.meal);
$$;

revoke execute on function get_day_board(date) from public;
revoke execute on function get_day_board(date) from anon;
grant execute on function get_day_board(date) to authenticated;
