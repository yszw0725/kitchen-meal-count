-- Phase 1: 関数・監査トリガー
-- 設計書 §5.3(change_logs), §5.4(get_day_board), §7.2(計算ロジック) に対応

-- ---------------------------------------------------------------------------
-- is_admin(): profiles.role='admin' 判定 (security definer, RLS循環参照回避)
-- ---------------------------------------------------------------------------

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

revoke execute on function is_admin() from public;
grant execute on function is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- handle_new_user(): auth.users 作成時に profiles を自動生成 (1:1保証)
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email, 'unknown'),
    'kitchen'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- log_change(): change_logs への自動記録 (対象6テーブルにAFTERトリガで適用)
-- 引数にPK構成カラム名を渡し、record_pk文字列を組み立てる
-- ---------------------------------------------------------------------------

create or replace function log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_pk text := '';
  v_col text;
  i int;
begin
  v_row := to_jsonb(coalesce(new, old));

  for i in 0 .. tg_nargs - 1 loop
    v_col := tg_argv[i];
    v_pk := v_pk || case when i > 0 then ':' else '' end || coalesce(v_row ->> v_col, '');
  end loop;

  if tg_op = 'DELETE' then
    insert into change_logs (actor_id, table_name, record_pk, action, before, after)
    values (auth.uid(), tg_table_name, v_pk, tg_op, to_jsonb(old), null);
    return old;
  elsif tg_op = 'UPDATE' then
    insert into change_logs (actor_id, table_name, record_pk, action, before, after)
    values (auth.uid(), tg_table_name, v_pk, tg_op, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into change_logs (actor_id, table_name, record_pk, action, before, after)
    values (auth.uid(), tg_table_name, v_pk, tg_op, null, to_jsonb(new));
    return new;
  end if;
end;
$$;

-- 監査対象6テーブル (設計書 §5.3 change_logs 記載の通り)
create trigger trg_log_residents
after insert or update or delete on residents
for each row execute function log_change('id');

create trigger trg_log_resident_default_meals
after insert or update or delete on resident_default_meals
for each row execute function log_change('resident_id', 'weekday', 'meal');

create trigger trg_log_meal_exceptions
after insert or update or delete on meal_exceptions
for each row execute function log_change('id');

create trigger trg_log_kitchen_overrides
after insert or update or delete on kitchen_overrides
for each row execute function log_change('id');

create trigger trg_log_daily_meal_extras
after insert or update or delete on daily_meal_extras
for each row execute function log_change('date', 'meal');

create trigger trg_log_count_overrides
after insert or update or delete on count_overrides
for each row execute function log_change('id');

-- ---------------------------------------------------------------------------
-- get_day_board(date): 区分別実食数 + 職員 + 来客 + 調理必要数 (設計書 §5.4, §7.2)
--
-- 優先順位: kitchen_overrides > meal_exceptions > resident_default_meals
-- count_overrides があれば当該区分の実食数を最終的に上書き
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
  with status as (
    select
      r.id as resident_id,
      r.name,
      r.group_id,
      g.short_name,
      g.sort_order as group_sort_order,
      mm.meal,
      coalesce(dm.eats, false) as default_eats,
      case
        when ko.type is not null then (ko.type = 'present')
        when me.type is not null then (me.type = 'present')
        else coalesce(dm.eats, false)
      end as eats
    from residents r
    join resident_groups g on g.id = r.group_id
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
        array_agg(name order by name) filter (where default_eats and not eats),
        array[]::text[]
      ) as absent_names,
      coalesce(
        array_agg(name order by name) filter (where not default_eats and eats),
        array[]::text[]
      ) as extra_names
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
      ga.extra_names
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
          'extra_names', to_jsonb(extra_names)
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
grant execute on function get_day_board(date) to authenticated;
