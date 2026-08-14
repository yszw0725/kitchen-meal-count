-- Phase 7: 月次集計 (食単価清算用, §12-7)
--
-- Excelテンプレート「月次集計」シートと同じロジック
-- (GH区分は平日昼=標準喫食、それ以外は臨時喫食のみ加算) で
-- 対象月の朝・昼・夕それぞれの合計食数を算出する。
--
-- effective_eats_status(date) を日毎に呼び出して再利用するため、
-- 標準パターン+例外の判定ロジックをここで二重に持たない。
-- kitchen_overrides (厨房の当日限定の緊急入力) は月次清算の対象外
-- とし、含めない (Excel確定済みの正式な記録のみを集計する)。

create or replace function get_monthly_summary(p_year int, p_month int)
returns table (
  date date,
  breakfast_total bigint,
  lunch_total bigint,
  dinner_total bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with month_range as (
    select
      make_date(p_year, p_month, 1) as start_date,
      (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date as end_date
  ),
  days as (
    select generate_series(start_date, end_date, interval '1 day')::date as date
    from month_range
  ),
  resident_totals as (
    select d.date, s.meal, count(*) filter (where s.eats) as cnt
    from days d
    cross join lateral effective_eats_status(d.date) s
    group by d.date, s.meal
  ),
  extras_totals as (
    select dme.date, dme.meal, (dme.staff_count + dme.visitor_count) as cnt
    from daily_meal_extras dme, month_range mr
    where dme.date between mr.start_date and mr.end_date
  ),
  combined as (
    select date, meal, cnt from resident_totals
    union all
    select date, meal, cnt from extras_totals
  ),
  totals as (
    select date, meal, sum(cnt) as total
    from combined
    group by date, meal
  )
  select
    d.date,
    coalesce(sum(t.total) filter (where t.meal = 'breakfast'), 0) as breakfast_total,
    coalesce(sum(t.total) filter (where t.meal = 'lunch'), 0) as lunch_total,
    coalesce(sum(t.total) filter (where t.meal = 'dinner'), 0) as dinner_total
  from days d
  left join totals t on t.date = d.date
  group by d.date
  order by d.date;
$$;

revoke execute on function get_monthly_summary(int, int) from public;
revoke execute on function get_monthly_summary(int, int) from anon;
grant execute on function get_monthly_summary(int, int) to authenticated;
