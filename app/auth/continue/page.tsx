import { redirect } from 'next/navigation';

import { getFreshServerSession } from '@/lib/auth-server';
import { resolvePostAuthDestination } from '@/lib/auth/post-auth';

export default async function AuthContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await getFreshServerSession();
  const params = await searchParams;

  if (!session?.user) {
    const callbackSuffix = params.callbackUrl
      ? `?callbackUrl=${encodeURIComponent(params.callbackUrl)}`
      : '';
    redirect(`/login${callbackSuffix}`);
  }

  redirect(
    await resolvePostAuthDestination({
      callbackUrl: params.callbackUrl,
      user: {
        id: session.user.id,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        role: (session.user as any)?.role ?? null,
      },
    }),
  );
}
