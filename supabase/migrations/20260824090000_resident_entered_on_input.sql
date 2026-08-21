-- 利用者管理画面から「入所日」を指定できるようにする
--
-- 背景: create_resident_with_default_pattern (段階A, 2026-08-22) は
-- residents.entered_on をテーブルdefaultの current_date (UTC) 任せに
-- しており、新規登録した日がそのまま入所日として記録されていた。
-- 2026-08-14の一括移行登録でも全56名がこの経路を通り、実際の入所日
-- ではなく移行作業日(2026-08-14)がentered_onになってしまった。
-- get_day_board / effective_eats_status の在籍判定
-- (entered_on <= 対象日) がこれを参照するため、2026-08-14より前の
-- 日付では該当利用者が丸ごと在籍対象外となり、区分カードが空欄・
-- 月次集計が0食になる不具合につながっていた。
--
-- p_entered_on を追加し、管理画面側で指定された入所日をそのまま
-- 使う。未指定時のdefaultは current_date ではなく jst_today() とする
-- (kitchen_overridesで踏んだのと同じUTC/JST境界バグを再発させない
-- ため、20260816090000_fix_kitchen_overrides_jst_date.sql と同じ方針)。
--
-- 引数を追加するため、旧シグネチャは明示的にdropしてから再作成する
-- (create or replace は引数リストが変わると別関数として追加されて
-- しまい、古いシグネチャが残留するため)。

drop function if exists create_resident_with_default_pattern(text, uuid, text[]);

create function create_resident_with_default_pattern(
  p_name text,
  p_group_id uuid,
  p_meal_form text[],
  p_entered_on date default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_resident_id uuid;
  v_is_gh boolean;
begin
  insert into residents (group_id, name, meal_form, entered_on)
  values (p_group_id, p_name, p_meal_form, coalesce(p_entered_on, jst_today()))
  returning id into v_resident_id;

  select short_name ilike '%GH%' into v_is_gh
  from resident_groups
  where id = p_group_id;

  insert into resident_default_meals (resident_id, weekday, meal, eats)
  select
    v_resident_id,
    w.weekday,
    mm.meal,
    case
      when v_is_gh then (mm.meal = 'lunch' and w.weekday between 1 and 5)
      else true
    end
  from generate_series(0, 6) as w (weekday)
  cross join (select unnest(enum_range(null::meal_type)) as meal) mm;

  return v_resident_id;
end;
$$;

revoke execute on function create_resident_with_default_pattern(text, uuid, text[], date) from public;
revoke execute on function create_resident_with_default_pattern(text, uuid, text[], date) from anon;
grant execute on function create_resident_with_default_pattern(text, uuid, text[], date) to authenticated;
