'use client';

import Link from 'next/link';
import { User } from 'lucide-react';
import { useAuthSession } from '@/components/auth/session-provider';
import { getAccountDestinationForRole } from '@/lib/account-destination';

/** Desktop version: renders as a plain nav-style link (sits inside the nav pill) */
export function UserMenuNav() {
  const { data: session, isPending } = useAuthSession();

  if (isPending) return null;

  const href = session?.user
    ? getAccountDestinationForRole((session.user as any)?.role)
    : '/login';
  const label = session?.user
    ? session.user.name?.split(' ')[0] || 'Account'
    : 'Log in';

  return (
    <Link
      href={href}
      className="font-semibold text-base uppercase transition-colors duration-200 text-foreground/50 hover:text-foreground"
      prefetch
    >
      {label}
    </Link>
  );
}

/** Mobile version: icon-only button visible on small screens */
export function UserMenuMobile() {
  const { data: session, isPending } = useAuthSession();

  if (isPending) return null;

  return (
    <Link
      href={session?.user ? getAccountDestinationForRole((session.user as any)?.role) : '/login'}
      className="flex items-center justify-center rounded-sm bg-background/10 p-1.5 text-foreground/60 backdrop-blur-md transition-colors hover:text-foreground md:hidden"
      aria-label={session?.user ? 'Account' : 'Log in'}
    >
      <User className="size-4" strokeWidth={2} />
    </Link>
  );
}
