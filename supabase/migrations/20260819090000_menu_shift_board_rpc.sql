-- /menu・/shifts画面の表示速度改善。
--
-- 従来、各ページのServer Componentが「最新のインポート履歴を取得→その
-- import_idを使って明細を取得」という2段階の逐次Supabaseラウンドトリップ
-- (菜単: menu_imports→menu_items、勤務表: shift_imports等→shift_staff/
-- shift_entries/shift_date_events)を行っていた。S2トップのget_day_board
-- (1回のRPCで完結)と異なり、依存関係のある複数回の往復が発生しており、
-- 特にVercel↔Supabase間のネットワーク遅延が大きい環境では、往復回数に
-- 比例して体感速度が悪化していた。
--
-- get_day_boardと同じ考え方で、必要なデータをすべて1回のRPC呼び出しで
-- 返すようにする。

create or replace function get_menu_board()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  -- FROM句を持たない(スカラーのサブクエリのみで組み立てる)ことで、
  -- menu_importsが0件の場合でも関数自体がNULLではなく必ず1件のjsonbを
  -- 返すようにする(get_shift_boardと同じ考え方で揃えている)。
  with latest as (
    select * from menu_imports order by uploaded_at desc limit 1
  )
  select jsonb_build_object(
    'startDate', (select start_date from latest),
    'endDate', (select end_date from latest),
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'date', it.date,
            'meal', it.meal,
            'sortOrder', it.sort_order,
            'dishName', it.dish_name
          )
          order by it.date, it.sort_order
        )
        from menu_items it
        where it.import_id = (select id from latest)
      ),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function get_menu_board() from public;
revoke execute on function get_menu_board() from anon;
grant execute on function get_menu_board() to authenticated;

create or replace function get_shift_board()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select * from shift_imports order by uploaded_at desc limit 1
  )
  select jsonb_build_object(
    'events', (
      select jsonb_build_object('content', content, 'updatedAt', updated_at)
      from shift_events where id = true
    ),
    'workNotes', (
      select jsonb_build_object('content', content, 'updatedAt', updated_at)
      from shift_work_notes where id = true
    ),
    'startDate', (select start_date from latest),
    'endDate', (select end_date from latest),
    'staff', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', s.id, 'name', s.name, 'sortOrder', s.sort_order)
          order by s.sort_order
        )
        from shift_staff s
        where s.is_active
      ),
      '[]'::jsonb
    ),
    'entries', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('date', e.date, 'staffId', e.staff_id, 'code', e.code)
        )
        from shift_entries e
        where e.import_id = (select id from latest)
      ),
      '[]'::jsonb
    ),
    'dateEvents', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('date', d.date, 'note', d.note)
          order by d.date
        )
        from shift_date_events d
        where d.import_id = (select id from latest)
      ),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function get_shift_board() from public;
revoke execute on function get_shift_board() from anon;
grant execute on function get_shift_board() to authenticated;
