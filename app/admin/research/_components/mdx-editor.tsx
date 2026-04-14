"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, ImagePlus, Loader2, Pencil } from "lucide-react";
import { getApiData, getApiErrorMessage, readJsonSafely } from "@/lib/api/client";

import {
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "../../_components/admin-shell";

type MdxEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

type Mode = "write" | "preview";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

async function uploadImageFile(
  file: File,
): Promise<{ url: string } | { error: string }> {
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch("/api/admin/research/assets", {
      method: "POST",
      body: fd,
    });
    const payload = await readJsonSafely(res);
    if (!res.ok) {
      return {
        error: getApiErrorMessage(payload, `Upload failed (${res.status})`),
      };
    }
    const data =
      getApiData<{ url?: string }>(payload) ?? (payload as { url?: string });
    return { url: data.url ?? "" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed" };
  }
}

function extractImageFiles(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];
  for (let i = 0; i < dataTransfer.files.length; i++) {
    const file = dataTransfer.files[i];
    if (IMAGE_TYPES.has(file.type)) files.push(file);
  }
  return files;
}

function buildFigureTag(url: string, alt: string): string {
  return `<Figure src="${url}" alt="${alt}" />`;
}

export function MdxEditor({ value, onChange }: MdxEditorProps) {
  const [mode, setMode] = useState<Mode>("write");
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  /** Insert text at the current cursor position (or end) and update value */
  const insertAtCursor = useCallback(
    (text: string) => {
      const ta = textareaRef.current;
      if (!ta) {
        onChange(value + "\n\n" + text);
        return;
      }
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      // Add newlines around the inserted tag for clean MDX
      const before = value.slice(0, start);
      const after = value.slice(end);
      const prefix = before.length > 0 && !before.endsWith("\n") ? "\n\n" : "";
      const suffix = after.length > 0 && !after.startsWith("\n") ? "\n\n" : "";
      const next = before + prefix + text + suffix + after;
      onChange(next);
      // Restore cursor after the inserted text
      requestAnimationFrame(() => {
        const newPos = (before + prefix + text + suffix).length;
        ta.selectionStart = newPos;
        ta.selectionEnd = newPos;
        ta.focus();
      });
    },
    [value, onChange],
  );

  /** Upload image files and insert <Figure> tags at cursor */
  const handleImageFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      const results: string[] = [];
      for (const file of files) {
        const result = await uploadImageFile(file);
        if ("error" in result) {
          setError(result.error);
        } else {
          const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
          results.push(buildFigureTag(result.url, alt));
        }
      }
      if (results.length > 0) {
        insertAtCursor(results.join("\n\n"));
      }
      setUploading(false);
    },
    [insertAtCursor],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const images = extractImageFiles(e.clipboardData);
      if (images.length === 0) return; // let normal text paste through
      e.preventDefault();
      handleImageFiles(images);
    },
    [handleImageFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      setDragOver(false);
      const images = extractImageFiles(e.dataTransfer);
      handleImageFiles(images);
    },
    [handleImageFiles],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      setDragOver(true);
    },
    [],
  );

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  useEffect(() => {
    if (mode !== "preview") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/research/preview-render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mdx: value }),
        });
        const payload = await readJsonSafely(res);
        const data =
          getApiData<{ html?: string }>(payload) ??
          (payload as { html?: string });
        if (!res.ok) throw new Error(getApiErrorMessage(payload, "Preview failed"));
        setHtml(data.html ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Preview failed");
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [mode, value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("write")}
          className={
            mode === "write" ? adminPrimaryButtonClass : adminSecondaryButtonClass
          }
        >
          <Pencil className="size-3" /> Write
        </button>
        <button
          type="button"
          onClick={() => setMode("preview")}
          className={
            mode === "preview"
              ? adminPrimaryButtonClass
              : adminSecondaryButtonClass
          }
        >
          <Eye className="size-3" /> Preview
          {loading ? <Loader2 className="size-3 animate-spin" /> : null}
        </button>
        {uploading ? (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Uploading image…
          </span>
        ) : null}
        <span className="ml-auto text-[10px] text-muted-foreground">
          <ImagePlus className="mb-px inline size-3" /> Paste or drop images
          {" · "}
          MDX · <code>&lt;Callout&gt;</code> <code>&lt;Figure&gt;</code>{" "}
          <code>&lt;Citation&gt;</code> <code>&lt;PubMedLink&gt;</code>
        </span>
      </div>

      {mode === "write" ? (
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`min-h-[420px] w-full resize-y rounded-none border bg-background p-3 font-mono text-xs leading-5 text-foreground shadow-sm focus:border-primary focus:outline-none ${
              dragOver
                ? "border-primary border-dashed bg-primary/5"
                : "border-border"
            }`}
            placeholder={`## Overview\n\nWrite MDX content here. You can use headings, lists, **bold**, _italic_, and custom components like:\n\n<Callout tone="info" title="Note">\n  All content is research use only.\n</Callout>\n\nPaste or drag & drop images to auto-upload.`}
          />
          {dragOver ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-none border-2 border-dashed border-primary bg-primary/5">
              <span className="flex items-center gap-2 text-sm font-medium text-primary">
                <ImagePlus className="size-5" /> Drop image to upload
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="min-h-[420px] rounded-none border border-border bg-background p-4">
          {error ? (
            <p className="text-xs text-red-500">{error}</p>
          ) : html ? (
            <div
              className="prose max-w-none text-sm"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {loading ? "Rendering…" : "Preview will appear here."}
            </p>
          )}
        </div>
      )}
      {error && mode === "write" ? (
        <p className="text-[10px] text-red-500">{error}</p>
      ) : null}
    </div>
  );
}
