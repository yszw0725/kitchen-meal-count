import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/require-admin";
import { parseExcelImport } from "@/lib/excel-import/parse";
import { computeRosterDiff, type KitchenOverrideConflict } from "@/lib/excel-import/diff";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { user, service } = auth;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "ファイルが指定されていません。" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const batchId = randomUUID();
  const storagePath = `${batchId}/${file.name}`;

  const { error: uploadError } = await service.storage
    .from("excel-imports")
    .upload(storagePath, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

  if (uploadError) {
    return NextResponse.json(
      { message: `ファイルの保存に失敗しました: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const [{ data: groups }, { data: dbResidents }] = await Promise.all([
    service.from("resident_groups").select("name"),
    service.from("residents").select("name, left_on"),
  ]);

  const knownGroupNames = (groups ?? []).map((g) => g.name);
  const existingResidentNames = (dbResidents ?? []).map((r) => r.name);

  const result = parseExcelImport(buffer, knownGroupNames, existingResidentNames);

  if (!result.ok) {
    await service.from("import_batches").insert({
      id: batchId,
      uploaded_by: user.id,
      original_filename: file.name,
      storage_path: storagePath,
      status: "failed",
      error_detail: JSON.stringify(result.errors, null, 2),
    });

    return NextResponse.json({ batchId, errors: result.errors }, { status: 422 });
  }

  const rosterDiff = computeRosterDiff(
    (dbResidents ?? []).map((r) => ({ name: r.name, enrolled: r.left_on === null })),
    result.residents,
  );

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const { data: unresolvedOverrides } = await service
    .from("kitchen_overrides")
    .select("id, meal, type, created_at, residents(name)")
    .eq("date", todayIso)
    .is("resolved_at", null);

  const conflicts: KitchenOverrideConflict[] = (unresolvedOverrides ?? []).map((o) => ({
    id: o.id,
    residentName: (o.residents as unknown as { name: string } | null)?.name ?? "(不明)",
    meal: o.meal,
    type: o.type,
    createdAt: o.created_at,
  }));

  const diffSummary = {
    rosterDiff,
    kitchenOverrideConflicts: conflicts,
    mealExceptionCount: result.mealExceptions.length,
    dailyExtraCount: result.dailyExtras.length,
    mealExceptionDates: [...new Set(result.mealExceptions.map((e) => e.date))].sort(),
  };

  await service.from("import_batches").insert({
    id: batchId,
    uploaded_by: user.id,
    original_filename: file.name,
    storage_path: storagePath,
    status: "pending_confirmation",
    diff_summary: diffSummary,
  });

  return NextResponse.json({ batchId, diffSummary });
}
