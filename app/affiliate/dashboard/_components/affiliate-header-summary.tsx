"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Link as LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AffiliateHeaderSummaryProps = {
  affiliateCode: string;
  referralLink: string;
};

const copyButtonClass =
  "size-7 rounded-none border border-white/12 bg-white/8 p-0 text-[#F4F1EA] hover:bg-white/12";

async function writeClipboard(value: string) {
  await navigator.clipboard.writeText(value);
}

export function AffiliateHeaderSummary({
  affiliateCode,
  referralLink,
}: AffiliateHeaderSummaryProps) {
  const [copiedField, setCopiedField] = useState<"code" | "link" | null>(null);

  async function copyValue(field: "code" | "link", value: string) {
    try {
      await writeClipboard(value);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((current) => (current === field ? null : current));
      }, 1600);
    } catch (error) {
      console.error(`Failed to copy ${field}:`, error);
    }
  }

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-[160px] space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/48">
          Growth Partner code
        </p>
        <div className="flex items-center gap-2">
          <p className="font-mono text-[1.55rem] font-semibold tracking-[-0.06em] text-[#F4F1EA]">
            {affiliateCode}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={copyButtonClass}
            onClick={() => copyValue("code", affiliateCode)}
            aria-label={copiedField === "code" ? "Partner code copied" : "Copy partner code"}
          >
            {copiedField === "code" ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      <div className="min-w-0 border border-white/10 bg-white/6 px-3 py-2.5 xl:ml-auto xl:max-w-[430px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center border border-white/10 bg-white/8">
              <LinkIcon className="size-4 text-[#F4F1EA]" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#F4F1EA]/48">
                Referral link
              </p>
              <code className="mt-1 block break-all text-[12px] text-[#F4F1EA]/88">
                {referralLink}
              </code>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(copyButtonClass, "shrink-0")}
            onClick={() => copyValue("link", referralLink)}
            aria-label={copiedField === "link" ? "Referral link copied" : "Copy referral link"}
          >
            {copiedField === "link" ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
