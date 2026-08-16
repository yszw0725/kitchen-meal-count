import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/lib/documents";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { user, service } = auth;

  const formData = await request.formData();
  const category = formData.get("category");
  const file = formData.get("file");

  if (
    typeof category !== "string" ||
    !DOCUMENT_CATEGORIES.includes(category as DocumentCategory)
  ) {
    return NextResponse.json({ message: "区分が不正です。" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "ファイルが指定されていません。" }, { status: 400 });
  }

  // 差し替え履歴は不要なため、同じcategory配下の既存ファイルは先に削除してから
  // 常に同じパス(category/current.拡張子)へ保存する(Storageにゴミを残さない)。
  const { data: existing } = await service.storage.from("documents").list(category);
  if (existing && existing.length > 0) {
    await service.storage
      .from("documents")
      .remove(existing.map((f) => `${category}/${f.name}`));
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const storagePath = `${category}/current.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await service.storage
    .from("documents")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { message: `ファイルの保存に失敗しました: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { error: upsertError } = await service.from("documents").upsert(
    {
      category,
      storage_path: storagePath,
      original_filename: file.name,
      uploaded_by: user.id,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: "category" },
  );

  if (upsertError) {
    return NextResponse.json(
      { message: `登録に失敗しました: ${upsertError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
