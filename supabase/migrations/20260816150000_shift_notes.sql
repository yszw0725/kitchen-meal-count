-- 献立表・勤務表・連絡ノート設計書 §3.3・§4.1・§4.3 に対応。
--
-- 連絡ノート(掃除当番など、厨房職員が当事者間で決めて書き込める枠)。
-- 期間に紐づけず「常に最新の1件を表示・上書き編集する」方式のため、
-- id boolean primary key default true + check(id) のシングルトンパターンで
-- 行を常に1件だけに固定する。編集履歴はchange_logsトリガーで自動記録される。
--
-- 編集権限は当事者間で決める性質のものなので、admin/kitchenどちらも可とし
-- (§3.3)、当日限定などの制約も設けない。

create table shift_notes (
  id boolean primary key default true check (id),
  content text not null default '',
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

insert into shift_notes (id, content) values (true, '') on conflict (id) do nothing;

alter table shift_notes enable row level security;

create policy shift_notes_select on shift_notes
  for select to authenticated using (true);

create policy shift_notes_update on shift_notes
  for update to authenticated using (true) with check (true);

create trigger trg_log_shift_notes
after update on shift_notes
for each row execute function log_change('id');
