-- 献立表・勤務表・連絡ノート設計書 §3.2・§3.4・§4.3・§5.2 に対応。
--
-- 勤務表は、既存ファイル(.xlsx)をそのままアップロードし、システムが
-- 解析してDBに反映する方式(§2.2)。4週間を1サイクルとして扱う。
--
-- 勤務表専用の掃除当番メモ(shift_work_notes)は、タスク1で作成した
-- shift_notes(S2トップの連絡ノート)とは別テーブルとする。ユーザーへの
-- 確認の結果、勤務表画面固有のメモとして独立させる方針を確定した。

create table shift_imports (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  original_filename text not null,
  storage_path text not null,
  uploaded_by uuid not null references profiles (id),
  uploaded_at timestamptz not null default now()
);

-- 勤務表に載る職員(給食対象の利用者=residentsとは全く別物)。氏名で
-- 名寄せする(§3.2の「職員名はAN列」という前提。同姓同名の職員がいる
-- 場合は別途IDでの区別が必要になるが、現状の設計書には記載がないため
-- 名前を一意キーとしている)。再アップロード時、その時点で非表示行だった
-- (=シフトに入っていない)職員は削除せずis_active=falseにする。過去の
-- shift_entriesとの参照整合性を保つため。
create table shift_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null,
  is_active boolean not null default true
);

create table shift_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  staff_id uuid not null references shift_staff (id) on delete cascade,
  code text not null,
  import_id uuid not null references shift_imports (id) on delete cascade,
  unique (date, staff_id)
);

alter table shift_imports enable row level security;
alter table shift_staff enable row level security;
alter table shift_entries enable row level security;

-- 閲覧は認証済全員(admin/kitchenどちらも)可。書込みはRoute Handlerが
-- service_roleで行う(admin限定の取込処理)ため、authenticatedロールへの
-- 書込みポリシーは作成しない(menu_imports/menu_items等と同じ方針)。
create policy shift_imports_select on shift_imports
  for select to authenticated using (true);

create policy shift_staff_select on shift_staff
  for select to authenticated using (true);

create policy shift_entries_select on shift_entries
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Storage: 勤務表(.xlsx)原本の保管用バケット。menu-importsと同じ方針
-- (非公開、閲覧はadminのみ、書込みはservice_role経由)。
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('shift-imports', 'shift-imports', false)
on conflict (id) do nothing;

create policy "shift_imports_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'shift-imports' and is_admin());

-- ---------------------------------------------------------------------------
-- 行事・会議予定(§3.4)・勤務表専用の掃除当番メモ(§3.3の考え方を踏襲、
-- ただし勤務表画面専用として別テーブル)。どちらも「常に最新の1件を
-- 表示・上書き編集する」方式のため、shift_notesと同じ
-- id boolean primary key default true + check(id) のシングルトン
-- パターンを用いる。編集権限はどちらもadmin/kitchen両方(§3.4で確定)。
-- ---------------------------------------------------------------------------

create table shift_events (
  id boolean primary key default true check (id),
  content text not null default '',
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

insert into shift_events (id, content) values (true, '') on conflict (id) do nothing;

alter table shift_events enable row level security;

create policy shift_events_select on shift_events
  for select to authenticated using (true);

create policy shift_events_update on shift_events
  for update to authenticated using (true) with check (true);

create trigger trg_log_shift_events
after update on shift_events
for each row execute function log_change('id');

create table shift_work_notes (
  id boolean primary key default true check (id),
  content text not null default '',
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

insert into shift_work_notes (id, content) values (true, '') on conflict (id) do nothing;

alter table shift_work_notes enable row level security;

create policy shift_work_notes_select on shift_work_notes
  for select to authenticated using (true);

create policy shift_work_notes_update on shift_work_notes
  for update to authenticated using (true) with check (true);

create trigger trg_log_shift_work_notes
after update on shift_work_notes
for each row execute function log_change('id');
