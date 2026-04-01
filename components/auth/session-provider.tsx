'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useSession } from '@/lib/auth-client';

type SessionContext = ReturnType<typeof useSession>;

const AuthSessionContext = createContext<SessionContext | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  return (
    <AuthSessionContext.Provider value={session}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error('useAuthSession must be used within a SessionProvider');
  }
  return context;
}
