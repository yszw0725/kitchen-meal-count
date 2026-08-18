import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

type DeleteBody = {
  id?: string;
};

// 勤務表は最新の1件のみを保持する設計のため、削除すると勤務表0件の
// 状態になる(/shiftsはget_shift_boardがその場合startDate=nullを返し、
// 「まだアップロードされていません」の案内を表示する)。
// shift_entries・shift_date_eventsはshift_imports.idへのon delete cascadeで
// 連動削除される。一方、shift_staff(職員名簿)・shift_events(手入力の
// 行事・会議予定)・shift_work_notes(掃除当番メモ)はshift_importsを一切
// 参照していないため、この削除では一切影響を受けない。
// Storage上の原本ファイルはDBのcascadeでは消えないため、別途削除する。
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { service } = auth;

  const body: DeleteBody = await request.json().catch(() => ({}));
  const { id } = body;

  if (!id) {
    return NextResponse.json({ message: "削除対象が指定されていません。" }, { status: 400 });
  }

  const { data: importRow, error: fetchError } = await service
    .from("shift_imports")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ message: fetchError.message }, { status: 500 });
  }
  if (!importRow) {
    return NextResponse.json({ message: "対象の勤務表が見つかりません。" }, { status: 404 });
  }

  const { error: deleteError } = await service.from("shift_imports").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ message: deleteError.message }, { status: 500 });
  }

  const { error: storageError } = await service.storage
    .from("shift-imports")
    .remove([importRow.storage_path]);

  if (storageError) {
    return NextResponse.json({
      ok: true,
      warning: `勤務表データは削除しましたが、原本ファイルの削除に失敗しました: ${storageError.message}`,
    });
  }

  return NextResponse.json({ ok: true });
}
