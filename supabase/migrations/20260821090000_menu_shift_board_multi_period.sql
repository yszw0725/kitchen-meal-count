-- 週間献立表・勤務表を「常に最新1件のみ表示」から「アップロード済みの
-- ものはすべて、削除しない限り閲覧できる」方式に変更する。
--
-- get_menu_board/get_shift_boardを引数なし(常に最新1件)から、対象日
-- (p_date)を受け取り、その日付を含む期間のimportを返す形に変更する。
-- 複数のimportが同じ日付をカバーしている場合は、最も新しくアップロード
-- されたものを優先する(uploaded_at desc limit 1)。
--
-- あわせて、/menu・/shifts画面の「前の週(期間)／次の週(期間)」ナビゲー
-- ションがデータの無い週(期間)を自動的に読み飛ばせるよう、隣接する
-- import期間の開始日(prevStartDate/nextStartDate)も返す。基準点は
-- 「表示中のimportが見つかった場合はその開始日・終了日」「見つからない
-- 場合はp_date自身」とすることで、対象日にデータが無い状態からでも
-- 直近の期間へジャンプできるようにしている。

drop function if exists get_menu_board();
drop function if exists get_shift_board();

create function get_menu_board(p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with current_import as (
    select * from menu_imports
    where start_date <= p_date and end_date >= p_date
    order by uploaded_at desc
    limit 1
  ),
  pivot as (
    select
      coalesce((select start_date from current_import), p_date) as pivot_start,
      coalesce((select end_date from current_import), p_date) as pivot_end
  )
  select jsonb_build_object(
    'startDate', (select start_date from current_import),
    'endDate', (select end_date from current_import),
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
        where it.import_id = (select id from current_import)
      ),
      '[]'::jsonb
    ),
    'prevStartDate', (
      select max(mi.start_date) from menu_imports mi, pivot p
      where mi.start_date < p.pivot_start
    ),
    'nextStartDate', (
      select min(mi.start_date) from menu_imports mi, pivot p
      where mi.start_date > p.pivot_end
    )
  );
$$;

revoke execute on function get_menu_board(date) from public;
revoke execute on function get_menu_board(date) from anon;
grant execute on function get_menu_board(date) to authenticated;

create function get_shift_board(p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with current_import as (
    select * from shift_imports
    where start_date <= p_date and end_date >= p_date
    order by uploaded_at desc
    limit 1
  ),
  pivot as (
    select
      coalesce((select start_date from current_import), p_date) as pivot_start,
      coalesce((select end_date from current_import), p_date) as pivot_end
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
    'startDate', (select start_date from current_import),
    'endDate', (select end_date from current_import),
    -- shift_staffのis_activeは「最後にアップロードされたimportの職員か
    -- どうか」を表すグローバルなフラグであり、特定の期間に紐づくもの
    -- ではない。過去の期間もすべて閲覧できる方式になったことで、is_active
    -- だけで絞り込むと「新しい期間をアップロードした後に古い期間を見ると、
    -- 新しい期間の職員一覧が表示される」不具合になる。表示中のimportの
    -- shift_entriesに実際に登場する職員に絞り込むことで、その期間時点の
    -- 職員一覧を表示する。
    'staff', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', s.id, 'name', s.name, 'sortOrder', s.sort_order)
          order by s.sort_order
        )
        from shift_staff s
        where s.id in (
          select distinct e.staff_id from shift_entries e
          where e.import_id = (select id from current_import)
        )
      ),
      '[]'::jsonb
    ),
    'entries', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('date', e.date, 'staffId', e.staff_id, 'code', e.code)
        )
        from shift_entries e
        where e.import_id = (select id from current_import)
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
        where d.import_id = (select id from current_import)
      ),
      '[]'::jsonb
    ),
    'prevStartDate', (
      select max(si.start_date) from shift_imports si, pivot p
      where si.start_date < p.pivot_start
    ),
    'nextStartDate', (
      select min(si.start_date) from shift_imports si, pivot p
      where si.start_date > p.pivot_end
    )
  );
$$;

revoke execute on function get_shift_board(date) from public;
revoke execute on function get_shift_board(date) from anon;
grant execute on function get_shift_board(date) to authenticated;
