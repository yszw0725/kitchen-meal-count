import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { service } = auth;
  const { batchId } = await params;

  const { data: batch } = await service
    .from("import_batches")
    .select("status")
    .eq("id", batchId)
    .single();

  if (!batch || batch.status !== "pending_confirmation") {
    return NextResponse.json(
      { message: "確認待ちのバッチではないため取り消せません。" },
      { status: 409 },
    );
  }

  await service
    .from("import_batches")
    .update({ status: "cancelled" })
    .eq("id", batchId);

  return NextResponse.json({ ok: true });
}
