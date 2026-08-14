-- Phase 1: 検証用シードデータ
--
-- 設計書 §1.2(区分・在籍数) / §5.3(標準喫食パターン) / §7.2(検証値) を再現する。
-- 検証日 2026-08-17 (月曜) の想定値:
--   朝食 25(男性入所)+20(女性入所)+0(男性GH)+0(女性GH)+0(職員)+0(来客) = 45
--   昼食 25+20+5+5+0+0 = 55
--   夕食 26+20+0+0+0+0 = 46
--
-- 【注意】このデータは開発検証専用のダミーデータであり、実在の利用者情報ではない。
-- Phase 9 (移行・並行運用) で実データをExcel取込した際に整理すること。

insert into resident_groups (name, short_name, sort_order) values
  ('男性入所', '男性入所', 1),
  ('女性入所', '女性入所', 2),
  ('男性GH', '男性GH', 3),
  ('女性GH', '女性GH', 4);

do $$
declare
  g_male_in uuid;
  g_female_in uuid;
  g_male_gh uuid;
  g_female_gh uuid;
  v_id uuid;
  i int;
  absent_male_in_id uuid;
  absent_male_gh_id uuid;
  absent_female_gh_ids uuid[] := array[]::uuid[];
begin
  select id into g_male_in from resident_groups where name = '男性入所';
  select id into g_female_in from resident_groups where name = '女性入所';
  select id into g_male_gh from resident_groups where name = '男性GH';
  select id into g_female_gh from resident_groups where name = '女性GH';

  -- 男性入所 26名 (標準パターン: 全食eats=true)
  for i in 1..26 loop
    insert into residents (group_id, name, sort_order)
    values (g_male_in, '男性入所' || lpad(i::text, 2, '0'), i)
    returning id into v_id;

    insert into resident_default_meals (resident_id, weekday, meal, eats)
    select v_id, w.weekday, mm.meal, true
    from generate_series(0, 6) as w (weekday)
    cross join (select unnest(enum_range(null::meal_type)) as meal) mm;

    if i = 1 then
      absent_male_in_id := v_id;
    end if;
  end loop;

  -- 女性入所 20名 (標準パターン: 全食eats=true)
  for i in 1..20 loop
    insert into residents (group_id, name, sort_order)
    values (g_female_in, '女性入所' || lpad(i::text, 2, '0'), i)
    returning id into v_id;

    insert into resident_default_meals (resident_id, weekday, meal, eats)
    select v_id, w.weekday, mm.meal, true
    from generate_series(0, 6) as w (weekday)
    cross join (select unnest(enum_range(null::meal_type)) as meal) mm;
  end loop;

  -- 男性GH 6名 (標準パターン: 平日昼のみeats=true。指示#3)
  for i in 1..6 loop
    insert into residents (group_id, name, sort_order)
    values (g_male_gh, '男性GH' || lpad(i::text, 2, '0'), i)
    returning id into v_id;

    insert into resident_default_meals (resident_id, weekday, meal, eats)
    select v_id, w.weekday, mm.meal, (mm.meal = 'lunch' and w.weekday between 1 and 5)
    from generate_series(0, 6) as w (weekday)
    cross join (select unnest(enum_range(null::meal_type)) as meal) mm;

    if i = 1 then
      absent_male_gh_id := v_id;
    end if;
  end loop;

  -- 女性GH 7名 (標準パターン: 平日昼のみeats=true。指示#3)
  for i in 1..7 loop
    insert into residents (group_id, name, sort_order)
    values (g_female_gh, '女性GH' || lpad(i::text, 2, '0'), i)
    returning id into v_id;

    insert into resident_default_meals (resident_id, weekday, meal, eats)
    select v_id, w.weekday, mm.meal, (mm.meal = 'lunch' and w.weekday between 1 and 5)
    from generate_series(0, 6) as w (weekday)
    cross join (select unnest(enum_range(null::meal_type)) as meal) mm;

    if i in (1, 2) then
      absent_female_gh_ids := absent_female_gh_ids || v_id;
    end if;
  end loop;

  -- 検証用の日次例外 (2026-08-17は月曜)
  -- 男性入所01: 朝・昼欠食 (夕は標準どおり喫食) → 25/25/26
  insert into meal_exceptions (resident_id, date, meal, type, note) values
    (absent_male_in_id, date '2026-08-17', 'breakfast', 'absent', '検証データ: 終日欠食(朝)'),
    (absent_male_in_id, date '2026-08-17', 'lunch', 'absent', '検証データ: 終日欠食(昼)');

  -- 男性GH01: 昼欠食 (標準6名喫食 → 5名) → 昼5
  insert into meal_exceptions (resident_id, date, meal, type, note) values
    (absent_male_gh_id, date '2026-08-17', 'lunch', 'absent', '検証データ: GH欠食');

  -- 女性GH01,02: 昼欠食 (標準7名喫食 → 5名) → 昼5
  insert into meal_exceptions (resident_id, date, meal, type, note)
  select gh_id, date '2026-08-17', 'lunch', 'absent', '検証データ: GH欠食'
  from unnest(absent_female_gh_ids) as gh_id;

  -- daily_meal_extras は行を作成しない (職員・来客=0はCOALESCEで既定される §5.3準拠)
end $$;
