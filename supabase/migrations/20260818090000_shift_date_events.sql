-- 勤務表ファイル自体に含まれる、特定の日付に紐づく会議・行事の記載
-- (例: 日付見出し行のさらに1行上にある「主任会」)を取り込んで保存する。
--
-- 既存のshift_events(管理者・厨房が自由に書き込める行事・会議予定欄、
-- ファイルに書かれていない予定を追加でメモする用途)とは別物。
-- こちらはmenu_items/shift_entries等と同じ「Excelが正」の取込データ
-- なので、書込みはRoute Handlerがservice_roleで行う(authenticatedへの
-- 書込みポリシーは作成しない)。

create table shift_date_events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  note text not null,
  import_id uuid not null references shift_imports (id) on delete cascade,
  unique (date)
);

alter table shift_date_events enable row level security;

create policy shift_date_events_select on shift_date_events
  for select to authenticated using (true);
