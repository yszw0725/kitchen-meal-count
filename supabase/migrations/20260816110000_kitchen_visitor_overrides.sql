-- 次回作業メモ項目4: 来客数の当日限定緊急上書き
--
-- 現行設計では職員食・来客数(daily_meal_extras)はExcel経由でのみ入力する
-- 想定だったが、来客も来客数も突発的に発生するため、厨房がその場で
-- 来客数を追加できるようにする。欠食のkitchen_overridesと同じ
-- 「当日限定の上書き」の仕組みを、来客数向けに新設する。
--
-- 日付判定は、UTCとJSTのズレでS5が失敗した過去の教訓([[kitchen_overrides_jst_date_bug]]
-- 相当)を踏まえ、必ずjst_today()を使う(current_dateのUTC基準は使わない)。
-- 新規テーブルであり移行対象の既存行が存在しないため、CHECK制約は
-- 通常付与(NOT VALID不要)で問題ない。

create table kitchen_visitor_overrides (
  id uuid primary key default gen_random_uuid(),
  date date not null check (date = jst_today()),
  meal meal_type not null,
  visitor_count int not null default 0 check (visitor_count >= 0),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  unique (date, meal)
);

alter table kitchen_visitor_overrides enable row level security;

-- 認証済全員(admin/kitchenどちらも) SELECT可。
-- INSERT/UPDATE/DELETEは、対象行のdateがjst_today()の場合のみ許可
-- (kitchen_overridesの既存ポリシーと同じ考え方)。

create policy kitchen_visitor_overrides_select on kitchen_visitor_overrides
  for select to authenticated using (true);

create policy kitchen_visitor_overrides_insert on kitchen_visitor_overrides
  for insert to authenticated
  with check (date = jst_today());

create policy kitchen_visitor_overrides_update on kitchen_visitor_overrides
  for update to authenticated
  using (date = jst_today())
  with check (date = jst_today());

create policy kitchen_visitor_overrides_delete on kitchen_visitor_overrides
  for delete to authenticated
  using (date = jst_today());

-- change_logs監査対象に追加 (kitchen_overrides/daily_meal_extrasと同様)
create trigger trg_log_kitchen_visitor_overrides
after insert or update or delete on kitchen_visitor_overrides
for each row execute function log_change('id');

-- ---------------------------------------------------------------------------
-- get_day_board: 来客数の計算に、当日かつkitchen_visitor_overridesに該当行が
-- あればそちらを優先し、なければdaily_meal_extrasの値を使う優先順位を追加する。
-- (kitchen_visitor_overridesはCHECK制約によりdate=jst_today()の行しか
-- 存在し得ないため、date = p_date の単純joinで「当日かつ該当行があれば」の
-- 条件を自然に満たす。)
--
-- なお get_monthly_summary (月次清算) は、kitchen_overrides(欠食の緊急入力)を
-- 意図的に対象外としている既存方針([[kitchen_overrides_jst_date_bug]]と同様の
-- 議論)に合わせ、kitchen_visitor_overridesもここでは対象外のまま変更しない。
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
