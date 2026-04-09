"use client";

import { useRef, useState } from "react";
import { Loader2, UploadCloud, X } from "lucide-react";
import { getApiData, getApiErrorMessage, readJsonSafely } from "@/lib/api/client";

import {
  adminFieldClass,
  adminSecondaryButtonClass,
} from "../../_components/admin-shell";

type ImageUploaderProps = {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  hint?: string;
};

export function ImageUploader({
  value,
  onChange,
  label,
  hint,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/research/assets", {
        method: "POST",
        body: fd,
      });
      const payload = await readJsonSafely(res);
      const data =
        getApiData<{ url?: string }>(payload) ??
        (payload as { url?: string });
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, `Upload failed (${res.status})`));
      }
      onChange(data.url ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {label ? (
        <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </label>
      ) : null}

      <div className="flex flex-col gap-2">
        {value ? (
          <div className="relative overflow-hidden rounded-md border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Preview"
              className="h-40 w-full object-cover"
            />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
              aria-label="Remove image"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={adminSecondaryButtonClass}
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Uploading
              </>
            ) : (
              <>
                <UploadCloud className="size-3" /> Upload image
              </>
            )}
          </button>
          <input
            type="text"
            placeholder="or paste image URL"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className={`${adminFieldClass} flex-1`}
          />
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
      {error ? <p className="text-[10px] text-red-500">{error}</p> : null}
    </div>
  );
}
