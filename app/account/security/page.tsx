import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth-server';
import { db } from '@/lib/db';
import { account } from '@/lib/db/schema';
import { accountPanelClass } from '../account-theme';
import { PasswordForm } from './password-form';

export const metadata = {
  title: 'Security | Revalin',
};

export default async function SecurityPage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect('/login');
  }

  const credentialAccounts = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(eq(account.userId, session.user.id), eq(account.providerId, 'credential')),
    )
    .limit(1);

  return (
    <div className="space-y-4">
      <section className={`${accountPanelClass} p-5 sm:p-6`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
          Security
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#0B2E2F]">
          Password settings
        </h2>
      </section>

      <PasswordForm hasPassword={credentialAccounts.length > 0} />
    </div>
  );
}
