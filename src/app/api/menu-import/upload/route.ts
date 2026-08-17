import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/require-admin";
import { parseMenuImport } from "@/lib/menu-import/parse";
import { addDays, isValidDateString } from "@/lib/board-date";

// アップロード時点ではDBには何も書き込まない(menu_imports/menu_itemsの作成は
// 確認画面での確定時のみ)。原本ファイルはStorageに保存し、確定時に再ダウン
// ロード・再解析して使う(クライアントが送り返すプレビュー結果を信用しない)。
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { service } = auth;

  const formData = await request.formData();
  const file = formData.get("file");
  const weekStartDate = formData.get("weekStartDate");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "ファイルが指定されていません。" }, { status: 400 });
  }
  if (typeof weekStartDate !== "string" || !isValidDateString(weekStartDate)) {
    return NextResponse.json(
      { message: "対象週の開始日(月曜日)を正しく指定してください。" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${randomUUID()}.xls`;

  const { error: uploadError } = await service.storage
    .from("menu-imports")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/vnd.ms-excel",
    });

  if (uploadError) {
    return NextResponse.json(
      { message: `ファイルの保存に失敗しました: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const result = parseMenuImport(buffer, weekStartDate);

  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }

  return NextResponse.json({
    storagePath,
    originalFilename: file.name,
    startDate: weekStartDate,
    endDate: addDays(weekStartDate, 6),
    items: result.items,
  });
}
