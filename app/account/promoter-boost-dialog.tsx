"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function PromoterBoostDialog({
  promoterFirstName,
}: {
  promoterFirstName: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {promoterFirstName} is putting your application at the top of the list
          </DialogTitle>
          <DialogDescription>
            Your Growth Partner application has been linked to {promoterFirstName}&apos;s
            referral. The admin team will prioritize your review.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            onClick={() => setOpen(false)}
            className="h-11 border border-[#0B2E2F] bg-[#0B2E2F] px-5 text-sm font-semibold text-[#F4F1EA] hover:bg-[#173d3e]"
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
