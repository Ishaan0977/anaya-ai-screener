import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  // 1. Detect the magic test email
  const isTestAccount = email.trim().toLowerCase() === 'test@gmail.com';
  
  // 2. Use 123456 for the test account, otherwise generate a real one
  const otp = isTestAccount ? '123456' : generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // Delete any existing OTPs for this email
  await supabaseAdmin
    .from('otp_verifications')
    .delete()
    .eq('email', email);

  // Store new OTP in Supabase
  const { error } = await supabaseAdmin
    .from('otp_verifications')
    .insert({ email, otp, expires_at: expiresAt.toISOString() });

  if (error) {
    return NextResponse.json({ error: 'Failed to create OTP' }, { status: 500 });
  }

  // 3. MAGIC BYPASS: If it's the test account, skip Resend entirely!
  if (isTestAccount) {
    console.log('Skipping email send for test account. OTP is 123456');
    return NextResponse.json({ success: true, testMode: true });
  }

  // Send real email via Resend for everyone else
  try {
    await resend.emails.send({
      from: 'Cuemath Talent Team <onboarding@resend.dev>',
      to: email,
      subject: 'Your Cuemath Interview Verification Code',
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#0a0a0f;font-family:'Outfit',Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:40px 20px;">
                <table width="480" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:24px;overflow:hidden;">
                  <tr>
                    <td style="padding:32px;text-align:center;background:linear-gradient(135deg,rgba(201,168,76,0.15),rgba(201,168,76,0.05));border-bottom:1px solid rgba(255,255,255,0.08);">
                      <div style="width:40px;height:40px;background:linear-gradient(135deg,#c9a84c,#e8c96a);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;color:#0a0a0f;margin-bottom:16px;">C</div>
                      <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;">Cuemath Talent Screener</h1>
                      <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:8px 0 0;">Email Verification</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:40px 32px;text-align:center;">
                      <p style="color:rgba(255,255,255,0.7);font-size:15px;margin:0 0 28px;line-height:1.6;">
                        Here is your verification code for the Cuemath tutor screening interview.
                        This code expires in <strong style="color:#c9a84c;">10 minutes</strong>.
                      </p>
                      <div style="background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.3);border-radius:16px;padding:24px;display:inline-block;margin-bottom:28px;">
                        <span style="font-size:42px;font-weight:800;letter-spacing:12px;color:#c9a84c;font-family:monospace;">${otp}</span>
                      </div>
                      <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;line-height:1.6;">
                        If you did not request this code, please ignore this email.<br/>
                        Do not share this code with anyone.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);">
                      <p style="color:rgba(255,255,255,0.3);font-size:11px;margin:0;">
                        © ${new Date().getFullYear()} Cuemath · Talent Team
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });
  } catch (emailErr) {
    console.error('Email send error:', emailErr);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
