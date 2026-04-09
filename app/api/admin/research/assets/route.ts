import { put } from "@vercel/blob";

import { createApiRoute } from "@/lib/api/route";
import { apiError } from "@/lib/api/errors";
import { withProviderTimeout } from "@/lib/api/provider-client";
import { slugify } from "@/lib/research/slug";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

const MAX_SIZE = 10 * 1024 * 1024;

export const dynamic = "force-dynamic";

export const POST = createApiRoute({
  route: "/api/admin/research/assets",
  access: "admin",
  cacheControl: "no-store",
  handler: async ({ request }) => {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw apiError.internal(
        "Missing BLOB_READ_WRITE_TOKEN env var. Enable Vercel Blob in this project.",
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      throw apiError.badRequest("Missing file field.");
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      throw apiError.badRequest(
        `Unsupported file type: ${file.type || "unknown"}. Allowed: ${Array.from(ALLOWED_TYPES).join(", ")}.`,
      );
    }

    if (file.size > MAX_SIZE) {
      throw apiError.badRequest(
        `File too large. Max size is ${MAX_SIZE / 1024 / 1024} MB.`,
      );
    }

    const originalName = (file as Blob & { name?: string }).name ?? "upload";
    const extension = originalName.includes(".")
      ? originalName.slice(originalName.lastIndexOf("."))
      : "";
    const nameWithoutExt = originalName.replace(extension, "");
    const safeName = slugify(nameWithoutExt) || "upload";
    const uuid = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
    const key = `research/${uuid}-${safeName}${extension}`;

    const blob = await withProviderTimeout({
      provider: "blob",
      operation: "upload_research_asset",
      route: "/api/admin/research/assets",
      task: () =>
        put(key, file, {
          access: "public",
          token,
          contentType: file.type,
        }),
    });

    return {
      data: {
        url: blob.url,
        pathname: blob.pathname,
        contentType: file.type,
        size: file.size,
      },
    };
  },
});
