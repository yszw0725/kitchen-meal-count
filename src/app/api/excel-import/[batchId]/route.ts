import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { service } = auth;
  const { batchId } = await params;

  const { data: batch, error } = await service
    .from("import_batches")
    .select(
      "id, uploaded_at, original_filename, status, diff_summary, error_detail",
    )
    .eq("id", batchId)
    .single();

  if (error || !batch) {
    return NextResponse.json({ message: "バッチが見つかりません。" }, { status: 404 });
  }

  return NextResponse.json({ batch });
}
