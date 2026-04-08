import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "This back-in-stock endpoint has been retired. Use the admin restock notification dashboard instead.",
    },
    { status: 410 },
  );
}
