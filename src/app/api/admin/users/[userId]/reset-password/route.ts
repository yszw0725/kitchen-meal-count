import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAdmin } from "@/lib/require-admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { service } = auth;
  const { userId } = await params;

  const newPassword = randomBytes(12).toString("base64url");

  const { error } = await service.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ password: newPassword });
}
