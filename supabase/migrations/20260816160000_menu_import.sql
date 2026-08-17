-- 献立表・勤務表・連絡ノート設計書 §3.1・§4.2・§5.1 に対応。
--
-- 週間献立表は、既存ファイル(.xls)をそのままアップロードし、システムが
-- 解析してDBに反映する方式(§2.2)。年の情報がファイルに無いため、
-- アップロード時に管理者が対象週の開始日(月曜日)を指定する。
-- 「同じ週を再アップロードした場合は洗い替え」(§3.1)のため、確認確定時に
-- 対象期間のmenu_itemsを削除してから再投入する(アプリ側で実施)。

create table menu_imports (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  original_filename text not null,
  storage_path text not null,
  uploaded_by uuid not null references profiles (id),
  uploaded_at timestamptz not null default now()
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  meal meal_type not null,
  sort_order int not null,
  dish_name text not null,
  kcal int,
  import_id uuid not null references menu_imports (id) on delete cascade,
  unique (date, meal, sort_order)
);

alter table menu_imports enable row level security;
alter table menu_items enable row level security;

-- 閲覧は認証済全員(admin/kitchenどちらも)可。書込みはRoute Handlerが
-- service_roleで行う(admin限定の取込処理)ため、authenticatedロールへの
-- 書込みポリシーは作成しない(excel-imports/kitchen_visitor_overrides等と
-- 同じ方針)。
create policy menu_imports_select on menu_imports
  for select to authenticated using (true);

create policy menu_items_select on menu_items
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Storage: 献立表(.xls)原本の保管用バケット。excel-importsと同じ方針
-- (非公開、閲覧はadminのみ、書込みはservice_role経由)。
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('menu-imports', 'menu-imports', false)
on conflict (id) do nothing;

create policy "menu_imports_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'menu-imports' and is_admin());
