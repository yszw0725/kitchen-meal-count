import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

type DeleteBody = {
  id?: string;
};

// 週間献立表は最新の1件のみを保持する設計のため、削除すると献立表0件の
// 状態になる(/menuはget_menu_boardがその場合startDate=nullを返し、
// 「まだアップロードされていません」の案内を表示する)。
// menu_itemsはmenu_imports.idへのon delete cascadeで連動削除される。
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
    .from("menu_imports")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ message: fetchError.message }, { status: 500 });
  }
  if (!importRow) {
    return NextResponse.json({ message: "対象の献立表が見つかりません。" }, { status: 404 });
  }

  const { error: deleteError } = await service.from("menu_imports").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ message: deleteError.message }, { status: 500 });
  }

  // Storageの実体削除はDB削除が成功した後に行う(DBのcascadeでは消えないため)。
  // ここで失敗してもDB側は既に削除済みなので、警告として返すに留める。
  const { error: storageError } = await service.storage
    .from("menu-imports")
    .remove([importRow.storage_path]);

  if (storageError) {
    return NextResponse.json({
      ok: true,
      warning: `献立表データは削除しましたが、原本ファイルの削除に失敗しました: ${storageError.message}`,
    });
  }

  return NextResponse.json({ ok: true });
}
