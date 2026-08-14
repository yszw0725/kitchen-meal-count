import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { parseExcelImport } from "@/lib/excel-import/parse";

type ConfirmBody = {
  resolutions?: Record<string, "kept" | "overwritten">;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { service } = auth;
  const { batchId } = await params;

  const { data: batch } = await service
    .from("import_batches")
    .select("id, storage_path, status")
    .eq("id", batchId)
    .single();

  if (!batch || batch.status !== "pending_confirmation") {
    return NextResponse.json(
      { message: "確認待ちのバッチではないため確定できません。" },
      { status: 409 },
    );
  }

  const { data: fileBlob, error: downloadError } = await service.storage
    .from("excel-imports")
    .download(batch.storage_path);

  if (downloadError || !fileBlob) {
    return NextResponse.json(
      { message: `保存済みファイルの取得に失敗しました: ${downloadError?.message}` },
      { status: 500 },
    );
  }
  const buffer = Buffer.from(await fileBlob.arrayBuffer());

  const [{ data: groups }, { data: dbResidents }] = await Promise.all([
    service.from("resident_groups").select("name"),
    service.from("residents").select("name, left_on"),
  ]);
  const knownGroupNames = (groups ?? []).map((g) => g.name);
  const existingResidentNames = (dbResidents ?? []).map((r) => r.name);

  const result = parseExcelImport(buffer, knownGroupNames, existingResidentNames);

  if (!result.ok) {
    await service
      .from("import_batches")
      .update({ status: "failed", error_detail: JSON.stringify(result.errors, null, 2) })
      .eq("id", batchId);
    return NextResponse.json({ errors: result.errors }, { status: 422 });
  }

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const { data: unresolvedOverrides } = await service
    .from("kitchen_overrides")
    .select("id")
    .eq("date", todayIso)
    .is("resolved_at", null);

  const body: ConfirmBody = await request.json().catch(() => ({}));
  const resolutionsInput = body.resolutions ?? {};

  // 明示的な選択がない競合は「残す(kept)」を既定とする(§0.5: 一括上書きしない)
  const kitchenResolutions = (unresolvedOverrides ?? []).map((o) => ({
    id: o.id,
    resolution: resolutionsInput[o.id] === "overwritten" ? "overwritten" : "kept",
  }));

  const { data: applyResult, error: applyError } = await service.rpc("apply_excel_import", {
    p_batch_id: batchId,
    p_residents: result.residents.map((r) => ({
      name: r.name,
      groupName: r.groupName,
      mealForm: r.mealForm,
      enrolled: r.enrolled,
      note: r.note,
    })),
    p_meal_exception_dates: [...new Set(result.mealExceptions.map((e) => e.date))],
    p_meal_exceptions: result.mealExceptions,
    p_daily_extras: result.dailyExtras.map((d) => ({
      date: d.date,
      meal: d.meal,
      staffCount: d.staffCount,
      visitorCount: d.visitorCount,
    })),
    p_kitchen_resolutions: kitchenResolutions,
  });

  if (applyError) {
    await service
      .from("import_batches")
      .update({ status: "failed", error_detail: applyError.message })
      .eq("id", batchId);
    return NextResponse.json(
      { message: `反映処理に失敗しました: ${applyError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, result: applyResult });
}
