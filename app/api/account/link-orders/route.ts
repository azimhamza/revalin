import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-server';
import { linkOrdersToUser } from '@/lib/checkout/link-orders-to-user';

export async function POST() {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await linkOrdersToUser(session.user.id, session.user.email);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[LINK-ORDERS]', error);
    return NextResponse.json({ error: 'Failed to link orders.' }, { status: 500 });
  }
}
