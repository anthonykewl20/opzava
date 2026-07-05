import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    { status: "ok" },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
