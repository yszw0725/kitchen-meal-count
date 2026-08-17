import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { parseMenuImport } from "@/lib/menu-import/parse";
import { addDays, isValidDateString } from "@/lib/board-date";

type ConfirmBody = {
  storagePath?: string;
  originalFilename?: string;
  startDate?: string;
};

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { user, service } = auth;

  const body: ConfirmBody = await request.json().catch(() => ({}));
  const { storagePath, originalFilename, startDate } = body;

  if (!storagePath || !originalFilename || !startDate || !isValidDateString(startDate)) {
    return NextResponse.json({ message: "確定に必要な情報が不足しています。" }, { status: 400 });
  }

  // クライアントが送り返すプレビュー結果は信用せず、保存済みの原本ファイルを
  // 再ダウンロード・再解析してから確定する(既存のExcel取込と同じ方針)。
  const { data: fileBlob, error: downloadError } = await service.storage
    .from("menu-imports")
    .download(storagePath);

  if (downloadError || !fileBlob) {
    return NextResponse.json(
      { message: `保存済みファイルの取得に失敗しました: ${downloadError?.message}` },
      { status: 500 },
    );
  }
  const buffer = Buffer.from(await fileBlob.arrayBuffer());

  const result = parseMenuImport(buffer, startDate);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }

  const endDate = addDays(startDate, 6);

  const { data: importRow, error: importError } = await service
    .from("menu_imports")
    .insert({
      start_date: startDate,
      end_date: endDate,
      original_filename: originalFilename,
      storage_path: storagePath,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (importError || !importRow) {
    return NextResponse.json(
      { message: `取込履歴の登録に失敗しました: ${importError?.message}` },
      { status: 500 },
    );
  }

  // 同じ週を再アップロードした場合の洗い替え(設計書§3.1): 対象期間の
  // menu_itemsを先に削除してから新しい内容を投入する。
  const { error: deleteError } = await service
    .from("menu_items")
    .delete()
    .gte("date", startDate)
    .lte("date", endDate);

  if (deleteError) {
    return NextResponse.json(
      { message: `既存データの削除に失敗しました: ${deleteError.message}` },
      { status: 500 },
    );
  }

  const { error: insertError } = await service.from("menu_items").insert(
    result.items.map((item) => ({
      date: item.date,
      meal: item.meal,
      sort_order: item.sortOrder,
      dish_name: item.dishName,
      import_id: importRow.id,
    })),
  );

  if (insertError) {
    return NextResponse.json(
      { message: `献立の登録に失敗しました: ${insertError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, itemCount: result.items.length });
}
