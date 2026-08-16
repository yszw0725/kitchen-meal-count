-- 次回作業メモ項目5相当: 週間献立表・勤務表・発注書の閲覧リンク
--
-- S2トップ画面から、管理者があらかじめアップロードした3種類のファイル
-- (週間献立表／勤務表／発注書) を厨房が確認できるようにする。差し替え
-- 履歴は不要で、各categoryにつき「最新の1件」のみ保持すればよい。

create table documents (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('weekly_menu', 'work_schedule', 'purchase_order')),
  storage_path text not null,
  original_filename text not null,
  uploaded_by uuid not null references profiles (id),
  uploaded_at timestamptz not null default now(),
  unique (category)
);

alter table documents enable row level security;

-- 閲覧は認証済全員(admin/kitchenどちらも)可。
-- 書込み(アップロード)はRoute Handlerがservice_roleで行うためRLSをバイパスする。
-- excel-imports/storage bucketと同じ考え方で、authenticatedロールへの
-- 書込みポリシーは意図的に作成しない (admin限定はRoute Handler側で担保)。
create policy documents_select on documents
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Storage: documents バケット (非公開。閲覧はauthenticated全員、書込みはRoute
-- Handlerがservice_roleで行うためauthenticatedロールへの書込みポリシーは
-- 作成しない。excel-importsバケットと同じ方針)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_authenticated_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents');
