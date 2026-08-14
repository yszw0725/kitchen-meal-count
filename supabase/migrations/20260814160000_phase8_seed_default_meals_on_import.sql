-- Phase 8: Excel取込で新規追加された利用者に標準喫食パターンを自動シードする
--
-- 設計書 §7.1・§5.3: 新規利用者登録時、入所系区分(GHを含まない)は全21マスtrue、
-- GH系区分(区分名に"GH"を含む)は平日昼のみtrueを既定パターンとしてシードする。
-- これまでapply_excel_importはresidentsへの追加のみでresident_default_mealsを
-- 一切作成しておらず、新規利用者は標準パターン欠落によりget_day_board上で
-- 常に「食べない」扱いになってしまっていた。
--
-- 「標準パターン未設定(resident_default_mealsの行が1件もない)利用者」を対象に
-- シードすることで、新規追加分だけを冪等に補完する(既存利用者は21件のパターンを
-- 既に持つため対象外)。

create or replace function apply_excel_import(
  p_batch_id uuid,
  p_residents jsonb,
  p_meal_exception_dates jsonb,
  p_meal_exceptions jsonb,
  p_daily_extras jsonb,
  p_kitchen_resolutions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_residents int := 0;
  v_updated_residents int := 0;
  v_seeded_default_meals int := 0;
  v_meal_exceptions int := 0;
  v_daily_extras int := 0;
  v_kitchen_resolved int := 0;
begin
  -- 1a. 既存利用者の更新 (氏名で照合)
  with input as (
    select
      r ->> 'name' as name,
      r ->> 'groupName' as group_name,
      coalesce(
        (select array_agg(x) from jsonb_array_elements_text(r -> 'mealForm') x),
        array[]::text[]
      ) as meal_form,
      (r ->> 'enrolled')::boolean as enrolled,
      r ->> 'note' as note
    from jsonb_array_elements(p_residents) as r
  )
  update residents res
  set
    group_id = g.id,
    meal_form = i.meal_form,
    note = i.note,
    left_on = case when i.enrolled then null else coalesce(res.left_on, current_date) end,
    entered_on = case
      when i.enrolled and res.left_on is not null then current_date
      else res.entered_on
    end
  from input i
  join resident_groups g on g.name = i.group_name
  where res.name = i.name;
  get diagnostics v_updated_residents = row_count;

  -- 1b. 新規利用者の追加 (氏名が既存residentsに存在しない行)
  with input as (
    select
      r ->> 'name' as name,
      r ->> 'groupName' as group_name,
      coalesce(
        (select array_agg(x) from jsonb_array_elements_text(r -> 'mealForm') x),
        array[]::text[]
      ) as meal_form,
      (r ->> 'enrolled')::boolean as enrolled,
      r ->> 'note' as note
    from jsonb_array_elements(p_residents) as r
  )
  insert into residents (group_id, name, meal_form, note, entered_on, left_on)
  select
    g.id,
    i.name,
    i.meal_form,
    i.note,
    current_date,
    case when i.enrolled then null else current_date end
  from input i
  join resident_groups g on g.name = i.group_name
  where not exists (select 1 from residents res where res.name = i.name);
  get diagnostics v_new_residents = row_count;

  -- 1c. 標準喫食パターンが未設定の利用者に既定パターンをシード (新規追加分が対象)
  -- 入所系(GHを含まない区分) = 全21マスtrue / GH系 = 平日(月-金)昼のみtrue (§7.1)
  insert into resident_default_meals (resident_id, weekday, meal, eats)
  select
    r.id,
    w.weekday,
    mm.meal,
    case
      when g.short_name ilike '%GH%' then (mm.meal = 'lunch' and w.weekday between 1 and 5)
      else true
    end
  from residents r
  join resident_groups g on g.id = r.group_id
  cross join generate_series(0, 6) as w (weekday)
  cross join (select unnest(enum_range(null::meal_type)) as meal) mm
  where not exists (
    select 1 from resident_default_meals dm where dm.resident_id = r.id
  );
  get diagnostics v_seeded_default_meals = row_count;

  -- 2. meal_exceptions 洗い替え (このアップロードに含まれる日付範囲のみ削除して再投入)
  delete from meal_exceptions
  where date in (
    select (d)::date from jsonb_array_elements_text(p_meal_exception_dates) as d
  );

  insert into meal_exceptions (resident_id, date, meal, type, note, source_batch_id)
  select
    res.id,
    (me ->> 'date')::date,
    (me ->> 'meal')::meal_type,
    (me ->> 'type')::exception_type,
    me ->> 'note',
    p_batch_id
  from jsonb_array_elements(p_meal_exceptions) as me
  join residents res on res.name = (me ->> 'residentName');
  get diagnostics v_meal_exceptions = row_count;

  -- 3. daily_meal_extras upsert (日付×食事の重複は呼び出し側で最終行優先に整理済み)
  insert into daily_meal_extras (date, meal, staff_count, visitor_count, source_batch_id, updated_at)
  select
    (de ->> 'date')::date,
    (de ->> 'meal')::meal_type,
    (de ->> 'staffCount')::int,
    (de ->> 'visitorCount')::int,
    p_batch_id,
    now()
  from jsonb_array_elements(p_daily_extras) as de
  on conflict (date, meal) do update set
    staff_count = excluded.staff_count,
    visitor_count = excluded.visitor_count,
    source_batch_id = excluded.source_batch_id,
    updated_at = now();
  get diagnostics v_daily_extras = row_count;

  -- 4. kitchen_overrides の競合解決 (管理者が確認画面で選択した内容を反映)
  update kitchen_overrides ko
  set resolved_at = now(), resolution = (r ->> 'resolution')
  from jsonb_array_elements(p_kitchen_resolutions) as r
  where ko.id = (r ->> 'id')::uuid;
  get diagnostics v_kitchen_resolved = row_count;

  -- 5. バッチを確定済みに
  update import_batches set status = 'confirmed' where id = p_batch_id;

  return jsonb_build_object(
    'newResidents', v_new_residents,
    'updatedResidents', v_updated_residents,
    'seededDefaultMeals', v_seeded_default_meals,
    'mealExceptions', v_meal_exceptions,
    'dailyExtras', v_daily_extras,
    'kitchenOverridesResolved', v_kitchen_resolved
  );
end;
$$;

revoke execute on function apply_excel_import(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
revoke execute on function apply_excel_import(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from anon;
revoke execute on function apply_excel_import(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from authenticated;
grant execute on function apply_excel_import(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
