-- Phase 3: Excelアップロード元ファイル保存用のStorageバケット
-- 設計書 §0.4 / §4「アップロードされた元ファイルはSupabase Storageに保存し、
-- 後から「いつの時点のExcelを取り込んだか」を追跡できるようにする」

insert into storage.buckets (id, name, public)
values ('excel-imports', 'excel-imports', false)
on conflict (id) do nothing;

-- 閲覧はadminのみ (書込みはRoute Handlerがservice_roleで行うためRLSをバイパスする。
-- authenticatedロールへの書込みポリシーは意図的に作成しない)
create policy "excel_imports_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'excel-imports' and is_admin());
