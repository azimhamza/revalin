import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

import { assertAdmin, isForbiddenError } from "@/lib/auth/assert-admin";
import { slugify } from "@/lib/research/slug";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  try {
    await assertAdmin();

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json(
        {
          error:
            "Missing BLOB_READ_WRITE_TOKEN env var. Enable Vercel Blob in this project.",
        },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing file field." },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type || "unknown"}. Allowed: ${Array.from(ALLOWED_TYPES).join(", ")}.`,
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large. Max size is ${MAX_SIZE / 1024 / 1024} MB.` },
        { status: 400 },
      );
    }

    const originalName =
      (file as unknown as { name?: string }).name ?? "upload";
    const extension = originalName.includes(".")
      ? originalName.slice(originalName.lastIndexOf("."))
      : "";
    const nameWithoutExt = originalName.replace(extension, "");
    const safeName = slugify(nameWithoutExt) || "upload";
    const uuid = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
    const key = `research/${uuid}-${safeName}${extension}`;

    const blob = await put(key, file, {
      access: "public",
      token,
      contentType: file.type,
    });

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: file.type,
      size: file.size,
    });
  } catch (error) {
    if (isForbiddenError(error)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[ADMIN-RESEARCH-UPLOAD]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload file.",
      },
      { status: 500 },
    );
  }
}
