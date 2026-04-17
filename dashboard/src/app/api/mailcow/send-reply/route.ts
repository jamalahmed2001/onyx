import { NextResponse, type NextRequest } from 'next/server';
import { sendEmail, type SendInput } from '@/lib/mailcowSend';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const input = await req.json() as SendInput;
    if (!input.account || !input.to || !input.subject || !input.body) {
      return NextResponse.json({ error: 'Missing account, to, subject, or body' }, { status: 400 });
    }
    const result = await sendEmail(input);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
