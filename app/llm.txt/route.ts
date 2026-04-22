import { NextResponse } from 'next/server';
import { resolveSiteUrl } from '@/lib/site';

export function GET() {
  return NextResponse.redirect(resolveSiteUrl('/llms.txt'), 308);
}
