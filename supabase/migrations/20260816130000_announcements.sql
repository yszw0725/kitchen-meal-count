-- 次回作業メモ項目6相当: 管理者からの連絡事項欄+通知
--
-- S2トップ画面に、管理者からの連絡事項をリアルタイムで表示するバナーを
-- 追加する。投稿はadminのみ、閲覧(履歴含む)はadmin/kitchenどちらも可。

create table announcements (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(content) > 0),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

alter table announcements enable row level security;

create policy announcements_select on announcements
  for select to authenticated using (true);

create policy announcements_insert on announcements
  for insert to authenticated
  with check (is_admin());

-- Realtime配信対象に追加 (S2トップのバナーが新規投稿を即座に検知するため)。
-- UPDATE/DELETEポリシーを持たずINSERTのみのテーブルのため、REPLICA IDENTITY
-- FULL は不要 (INSERTイベントのnew行には元々全カラムが含まれる)。
alter publication supabase_realtime add table announcements;
