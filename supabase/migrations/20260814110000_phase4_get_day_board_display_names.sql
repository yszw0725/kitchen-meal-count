-- Phase 4: get_day_board にS2表示用の情報を追加
--
-- 設計書 §6.1:
--   - 氏名表示は「氏名(略称)」形式。略称はresidents.meal_formから
--     キ/ダ/粗/超を導出し複数該当時は連結 (大盛は対象外なので表示しない)
--   - 入所利用者は「欠食者名」を表示 (絶対名簿から見た欠食=absent_names)
--   - GH利用者は「喫食者名」を表示 (その食を実際に食べる全員=present_names)
--     のためabsent/extraだけでなく実食者のフルリストが別途必要

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
      r.id as resident_id,
      r.name || dn.suffix as display_name,
      r.group_id,
      g.short_name,
      g.sort_order as group_sort_order,
      mm.meal,
      coalesce(dm.eats, false) as default_eats,
      case
        when ko.type is not null and coalesce(ko.resolution, '') <> 'overwritten'
          then (ko.type = 'present')
        when me.type is not null then (me.type = 'present')
        else coalesce(dm.eats, false)
      end as eats
    from residents r
    join resident_groups g on g.id = r.group_id
    cross join lateral (
      select case
        when r.meal_form is null or array_length(r.meal_form, 1) is null then ''
        else '(' || (
          select string_agg(
            case mf
              when 'kizami' then 'キ'
              when 'diet' then 'ダ'
              when 'araimiji' then '粗'
              when 'chomiji' then '超'
            end,
            ''
            order by array_position(array['kizami', 'diet', 'araimiji', 'chomiji']::text[], mf)
          )
          from unnest(r.meal_form) as mf
        ) || ')'
      end as suffix
    ) dn
    cross join (select unnest(enum_range(null::meal_type)) as meal) mm
    left join resident_default_meals dm
      on dm.resident_id = r.id
     and dm.weekday = extract(dow from p_date)::smallint
     and dm.meal = mm.meal
    left join meal_exceptions me
      on me.resident_id = r.id and me.date = p_date and me.meal = mm.meal
    left join kitchen_overrides ko
      on ko.resident_id = r.id and ko.date = p_date and ko.meal = mm.meal
    where r.entered_on <= p_date
      and (r.left_on is null or r.left_on >= p_date)
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
        array_agg(display_name order by display_name) filter (where default_eats and not eats),
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
    mgj.resident_total + coalesce(dme.staff_count, 0) + coalesce(dme.visitor_count, 0) as cooking_total
  from meal_group_json mgj
  left join daily_meal_extras dme on dme.date = p_date and dme.meal = mgj.meal
  order by array_position(enum_range(null::meal_type), mgj.meal);
$$;

revoke execute on function get_day_board(date) from public;
revoke execute on function get_day_board(date) from anon;
grant execute on function get_day_board(date) to authenticated;
