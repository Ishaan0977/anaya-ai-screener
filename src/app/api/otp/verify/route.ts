import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { email, otp } = await req.json();

  if (!email || !otp) {
    return NextResponse.json({ error: 'Email and OTP required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('otp_verifications')
    .select('*')
    .eq('email', email)
    .eq('otp', otp)
    .eq('verified', false)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Code has expired. Please request a new one.' }, { status: 400 });
  }

  // Mark as verified
  await supabaseAdmin
    .from('otp_verifications')
    .update({ verified: true })
    .eq('id', data.id);

  return NextResponse.json({ success: true });
}
