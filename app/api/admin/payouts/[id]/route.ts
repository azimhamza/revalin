import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-server';
import {
  approvePayout,
  getPayoutApprovalPreview,
  markPayoutPaid,
  rejectPayout,
} from '@/lib/checkout/payout-service';

const patchSchema = z.object({
  action: z.enum(['approve', 'reject', 'mark_paid']),
  txHash: z.string().trim().min(1).optional(),
  notes: z.string().trim().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = patchSchema.parse(body);

    switch (data.action) {
      case 'approve':
        await approvePayout(id);
        break;
      case 'reject':
        await rejectPayout(id, data.notes);
        break;
      case 'mark_paid':
        if (!data.txHash) {
          return NextResponse.json({ error: 'txHash is required for mark_paid.' }, { status: 400 });
        }
        await markPayoutPaid(id, data.txHash);
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues.map((i) => i.message).join(' ') }, { status: 400 });
    }
    console.error('[ADMIN-PAYOUT-PATCH]', error);
    return NextResponse.json({ error: 'Failed to update payout.' }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const preview = await getPayoutApprovalPreview(id);

    return NextResponse.json({ preview });
  } catch (error) {
    console.error('[ADMIN-PAYOUT-GET]', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load payout preview.',
      },
      { status: 500 }
    );
  }
}
