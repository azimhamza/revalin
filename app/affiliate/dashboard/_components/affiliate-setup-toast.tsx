'use client';

import { useEffect } from "react";
import { toast } from "sonner";

type AffiliateSetupToastProps = {
  title: string;
  description: string;
  storageKey: string;
  actionHref?: string;
  actionLabel?: string;
};

export function AffiliateSetupToast({
  title,
  description,
  storageKey,
  actionHref,
  actionLabel,
}: AffiliateSetupToastProps) {
  useEffect(() => {
    if (!description) return;

    const sessionKey = `affiliate-setup-toast:${storageKey}`;
    if (window.sessionStorage.getItem(sessionKey)) return;

    toast.warning(title, {
      description,
      duration: 8000,
      action:
        actionHref && actionLabel
          ? {
              label: actionLabel,
              onClick: () => window.location.assign(actionHref),
            }
          : undefined,
    });

    window.sessionStorage.setItem(sessionKey, "shown");
  }, [actionHref, actionLabel, description, storageKey, title]);

  return null;
}
