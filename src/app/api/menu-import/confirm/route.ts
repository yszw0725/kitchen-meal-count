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

  // 同じ週(を含む重複期間)を再アップロードした場合の洗い替え(設計書§3.1):
  // アップロード済みの週はすべて閲覧できる方式のため、重複したまま残すと
  // 一覧に空のimportが残ったり、削除順序によって古い(空になった)importが
  // 再度表示されてしまう。重複する既存importは削除してから新しいimportを
  // 作成する(menu_items等の明細はON DELETE CASCADEで連動削除される)。
  const { data: overlapping } = await service
    .from("menu_imports")
    .select("id, storage_path")
    .lte("start_date", endDate)
    .gte("end_date", startDate);

  if (overlapping && overlapping.length > 0) {
    const paths = overlapping.map((row) => row.storage_path);
    await service.storage.from("menu-imports").remove(paths);
    const { error: overlapDeleteError } = await service
      .from("menu_imports")
      .delete()
      .in(
        "id",
        overlapping.map((row) => row.id),
      );
    if (overlapDeleteError) {
      return NextResponse.json(
        { message: `既存データの削除に失敗しました: ${overlapDeleteError.message}` },
        { status: 500 },
      );
    }
  }

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
