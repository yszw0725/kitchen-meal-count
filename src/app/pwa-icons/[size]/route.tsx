import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

const SIZES: Record<string, { px: number; maskable: boolean }> = {
  "192": { px: 192, maskable: false },
  "512": { px: 512, maskable: false },
  "192-maskable": { px: 192, maskable: true },
  "512-maskable": { px: 512, maskable: true },
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params;
  const config = SIZES[size];
  if (!config) {
    return NextResponse.json({ message: "unknown icon size" }, { status: 404 });
  }

  const { px, maskable } = config;
  // maskableアイコンはOSがクロップする可能性があるため、中央78%のセーフゾーンに収める
  const fontSize = maskable ? Math.round(px * 0.34) : Math.round(px * 0.5);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
        }}
      >
        <span
          style={{
            fontSize,
            color: "#ffffff",
            fontWeight: 700,
          }}
        >
          食
        </span>
      </div>
    ),
    { width: px, height: px },
  );
}
