'use client';

import { signOut } from '@/lib/auth-client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AccountSignOut({ className }: { className?: string }) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <Button
      variant="ghost"
      className={cn(
        'text-foreground/55 hover:bg-rose-500/10 hover:text-rose-950',
        className
      )}
      disabled={isSigningOut}
      onClick={async () => {
        if (isSigningOut) return;

        setIsSigningOut(true);

        try {
          await signOut();
          window.location.assign('/');
        } catch (error) {
          setIsSigningOut(false);
          console.error('Failed to sign out:', error);
        }
      }}
    >
      {isSigningOut ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      {isSigningOut ? 'Signing out...' : 'Sign out'}
    </Button>
  );
}
