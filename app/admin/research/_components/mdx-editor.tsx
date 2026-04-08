"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Loader2, Pencil } from "lucide-react";

import {
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "../../_components/admin-shell";

type MdxEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

type Mode = "write" | "preview";

export function MdxEditor({ value, onChange }: MdxEditorProps) {
  const [mode, setMode] = useState<Mode>("write");
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode !== "preview") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/research/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mdx: value }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Preview failed");
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
        <span className="ml-auto text-[10px] text-muted-foreground">
          MDX · supports <code>&lt;Callout&gt;</code>,{" "}
          <code>&lt;Figure&gt;</code>, <code>&lt;Citation&gt;</code>,{" "}
          <code>&lt;PubMedLink&gt;</code>
        </span>
      </div>

      {mode === "write" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[420px] w-full resize-y rounded-none border border-border bg-background p-3 font-mono text-xs leading-5 text-foreground shadow-sm focus:border-primary focus:outline-none"
          placeholder={`## Overview\n\nWrite MDX content here. You can use headings, lists, **bold**, _italic_, and custom components like:\n\n<Callout tone="info" title="Note">\n  All content is research use only.\n</Callout>\n`}
        />
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
    </div>
  );
}
