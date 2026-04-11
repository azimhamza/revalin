import { NextResponse, type NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  const { code } = await context.params;
  return NextResponse.redirect(
    new URL(`/grow/${encodeURIComponent(code)}`, request.url),
    { status: 308 },
  );
}
