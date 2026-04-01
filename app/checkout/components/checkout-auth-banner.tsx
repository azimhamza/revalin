'use client';

import { useAuthSession } from '@/components/auth/session-provider';

export function CheckoutAuthBanner() {
  const { data: session, isPending } = useAuthSession();

  if (isPending) return null;

  return session?.user ? (
    <div className="rounded-xl border border-[#0B2E2F]/15 bg-[#0B2E2F]/5 px-4 py-3 text-sm">
      Signed in as <span className="font-semibold">{session.user.email}</span>
    </div>
  ) : null;
}
