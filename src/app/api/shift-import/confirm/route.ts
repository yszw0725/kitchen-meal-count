import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { parseShiftImport } from "@/lib/shift-import/parse";
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
  // 再ダウンロード・再解析してから確定する(既存のExcel取込・menu-importと
  // 同じ方針)。
  const { data: fileBlob, error: downloadError } = await service.storage
    .from("shift-imports")
    .download(storagePath);

  if (downloadError || !fileBlob) {
    return NextResponse.json(
      { message: `保存済みファイルの取得に失敗しました: ${downloadError?.message}` },
      { status: 500 },
    );
  }
  const buffer = Buffer.from(await fileBlob.arrayBuffer());

  const result = parseShiftImport(buffer, startDate);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }

  const endDate = addDays(startDate, 27);

  const { data: importRow, error: importError } = await service
    .from("shift_imports")
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

  // 職員は氏名で名寄せする(§3.2)。今回の取込に含まれる職員はis_active=true
  // で作成/更新し、含まれない既存職員(退職・非表示行になった等)は削除せず
  // is_active=falseにする(過去のshift_entriesとの参照整合性を保つため)。
  const { data: upsertedStaff, error: staffError } = await service
    .from("shift_staff")
    .upsert(
      result.staff.map((s) => ({ name: s.name, sort_order: s.sortOrder, is_active: true })),
      { onConflict: "name" },
    )
    .select("id, name");

  if (staffError || !upsertedStaff) {
    return NextResponse.json(
      { message: `職員情報の登録に失敗しました: ${staffError?.message}` },
      { status: 500 },
    );
  }

  const idsInImport = upsertedStaff.map((s) => s.id);
  if (idsInImport.length > 0) {
    const { error: deactivateError } = await service
      .from("shift_staff")
      .update({ is_active: false })
      .not("id", "in", `(${idsInImport.join(",")})`);

    if (deactivateError) {
      return NextResponse.json(
        { message: `職員情報の更新に失敗しました: ${deactivateError.message}` },
        { status: 500 },
      );
    }
  }

  const nameToId = new Map(upsertedStaff.map((s) => [s.name, s.id]));

  // 同じ期間を再アップロードした場合の洗い替え(menu_itemsと同じ方針):
  // 対象期間のshift_entriesを先に削除してから新しい内容を投入する。
  const { error: deleteError } = await service
    .from("shift_entries")
    .delete()
    .gte("date", startDate)
    .lte("date", endDate);

  if (deleteError) {
    return NextResponse.json(
      { message: `既存データの削除に失敗しました: ${deleteError.message}` },
      { status: 500 },
    );
  }

  const { error: insertError } = await service.from("shift_entries").insert(
    result.entries.map((entry) => ({
      date: entry.date,
      staff_id: nameToId.get(entry.staffName),
      code: entry.code,
      import_id: importRow.id,
    })),
  );

  if (insertError) {
    return NextResponse.json(
      { message: `勤務データの登録に失敗しました: ${insertError.message}` },
      { status: 500 },
    );
  }

  // shift_date_events(ファイル内の日付に紐づく会議・行事の記載)も
  // 同じ期間で洗い替えする。
  const { error: deleteDateEventsError } = await service
    .from("shift_date_events")
    .delete()
    .gte("date", startDate)
    .lte("date", endDate);

  if (deleteDateEventsError) {
    return NextResponse.json(
      { message: `既存データの削除に失敗しました: ${deleteDateEventsError.message}` },
      { status: 500 },
    );
  }

  if (result.dateEvents.length > 0) {
    const { error: dateEventsInsertError } = await service.from("shift_date_events").insert(
      result.dateEvents.map((e) => ({
        date: e.date,
        note: e.note,
        import_id: importRow.id,
      })),
    );

    if (dateEventsInsertError) {
      return NextResponse.json(
        { message: `日付別の予定の登録に失敗しました: ${dateEventsInsertError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    staffCount: result.staff.length,
    entryCount: result.entries.length,
    dateEventCount: result.dateEvents.length,
  });
}
