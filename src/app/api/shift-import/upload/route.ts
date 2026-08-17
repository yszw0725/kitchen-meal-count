import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/require-admin";
import { parseShiftImport } from "@/lib/shift-import/parse";
import { addDays, isValidDateString } from "@/lib/board-date";

// アップロード時点ではDBには何も書き込まない(shift_imports/shift_staff/
// shift_entriesの作成は確認画面での確定時のみ)。原本ファイルはStorageに
// 保存し、確定時に再ダウンロード・再解析して使う(クライアントが送り返す
// プレビュー結果を信用しない、menu-importと同じ方針)。
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { service } = auth;

  const formData = await request.formData();
  const file = formData.get("file");
  const periodStartDate = formData.get("periodStartDate");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "ファイルが指定されていません。" }, { status: 400 });
  }
  if (typeof periodStartDate !== "string" || !isValidDateString(periodStartDate)) {
    return NextResponse.json(
      { message: "対象期間の開始日(第1週の月曜日)を正しく指定してください。" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${randomUUID()}.xlsx`;

  const { error: uploadError } = await service.storage
    .from("shift-imports")
    .upload(storagePath, buffer, {
      contentType:
        file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

  if (uploadError) {
    return NextResponse.json(
      { message: `ファイルの保存に失敗しました: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const result = parseShiftImport(buffer, periodStartDate);

  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }

  return NextResponse.json({
    storagePath,
    originalFilename: file.name,
    startDate: periodStartDate,
    endDate: addDays(periodStartDate, 27),
    staff: result.staff,
    entries: result.entries,
    dateEvents: result.dateEvents,
  });
}
