'use client';

import { signOut } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AccountSignOut({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      className={cn(
        'text-foreground/55 hover:bg-rose-500/10 hover:text-rose-950',
        className
      )}
      onClick={async () => {
        await signOut();
        router.push('/');
        router.refresh();
      }}
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
