-- 標準喫食パターン(resident_default_meals)に適用開始日を導入する
--
-- 背景: 従来は「利用者×曜日×食事区分」ごとにeatsを1つだけ持ち、変更した瞬間から
-- 過去・未来を問わず即座に適用されていた。GH利用者の喫食パターン変更のように
-- 「◯月◯日から」の切替を、切替日より前に予約登録しておきたいという要望に対応するため、
-- 同一(resident_id, weekday, meal)について複数の世代(effective_from違い)を保持できるようにし、
-- 実喫食判定時は「対象日以前で最も新しいeffective_from」を採用する。
--
-- 既存行はsentinel日付(2000-01-01)にバックフィルし、以後もカラムのdefaultとして残す。
-- これにより apply_excel_import (phase8) が新規利用者の標準パターンをシードする際の
-- insert into resident_default_meals (resident_id, weekday, meal, eats) select ... は
-- 無改修のまま動く(常に「最初から有効」なベースラインとしてsentinel値が入る)。

alter table resident_default_meals
  add column effective_from date not null default date '2000-01-01';

alter table resident_default_meals
  drop constraint resident_default_meals_pkey;

alter table resident_default_meals
  add primary key (resident_id, weekday, meal, effective_from);

-- ---------------------------------------------------------------------------
-- effective_eats_status: resident_default_meals との結合を
-- 「対象日以前で最新のeffective_from」を選ぶlateral結合に変更する。
-- get_day_board / get_monthly_summary はどちらもこの関数経由で結果を受け取るのみのため
-- 無改修で対応できる。
-- ---------------------------------------------------------------------------

create or replace function effective_eats_status(p_date date)
returns table (
  resident_id uuid,
  display_name text,
  group_id uuid,
  short_name text,
  group_sort_order int,
  meal meal_type,
  default_eats boolean,
  eats boolean
)
language sql
stable
as $$
  select
    r.id as resident_id,
    r.name || dn.suffix as display_name,
    r.group_id,
    g.short_name,
    g.sort_order as group_sort_order,
    mm.meal,
    coalesce(dm.eats, false) as default_eats,
    case
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
  left join lateral (
    select dm.eats
    from resident_default_meals dm
    where dm.resident_id = r.id
      and dm.weekday = extract(dow from p_date)::smallint
      and dm.meal = mm.meal
      and dm.effective_from <= p_date
    order by dm.effective_from desc
    limit 1
  ) dm on true
  left join meal_exceptions me
    on me.resident_id = r.id and me.date = p_date and me.meal = mm.meal
  where r.entered_on <= p_date
    and (r.left_on is null or r.left_on >= p_date);
$$;

revoke execute on function effective_eats_status(date) from public;
revoke execute on function effective_eats_status(date) from anon;
grant execute on function effective_eats_status(date) to authenticated;
