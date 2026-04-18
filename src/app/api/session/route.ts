import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST /api/session — create a new interview session
export async function POST(req: NextRequest) {
  const { candidate_name, candidate_email } = await req.json();

  if (!candidate_name || !candidate_email) {
    return NextResponse.json(
      { error: 'Name and email are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('sessions')
    .insert({ candidate_name, candidate_email })
    .select('id, candidate_name, candidate_email, started_at')
    .single();

  if (error) {
    console.error('Session create error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }

  return NextResponse.json(data);
}

// GET /api/session?id=xxx — fetch a session with its assessment
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('id');

  if (!sessionId) {
    // Return all completed sessions for HR dashboard
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select(`
        id, candidate_name, candidate_email,
        status, started_at, ended_at,
        assessments (
          verdict, verdict_reason, overall_score
        )
      `)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Single session with full detail
  const { data: session, error: sErr } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sErr) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const { data: transcript } = await supabaseAdmin
    .from('transcript_entries')
    .select('*')
    .eq('session_id', sessionId)
    .order('turn_index', { ascending: true });

  const { data: assessment } = await supabaseAdmin
    .from('assessments')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  const { data: dimensions } = await supabaseAdmin
    .from('dimension_scores')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    ...session,
    transcript: transcript ?? [],
    assessment: assessment
      ? { ...assessment, scores: dimensions ?? [] }
      : null,
  });
}

// PATCH /api/session — update session (save transcript turn or mark complete)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { session_id, action } = body;

  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  // Action: add a transcript entry
  if (action === 'add_turn') {
    const { role, text, turn_index, timestamp_ms } = body;
    const { error } = await supabaseAdmin
      .from('transcript_entries')
      .insert({ session_id, role, text, turn_index, timestamp_ms });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Action: mark session as abandoned
  if (action === 'abandon') {
    await supabaseAdmin
      .from('sessions')
      .update({ status: 'abandoned', ended_at: new Date().toISOString() })
      .eq('id', session_id);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
