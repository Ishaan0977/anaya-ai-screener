import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { assessWithFallback, buildAssessmentPrompt } from '@/lib/gemini';

type DimensionScoreRaw = {
  dimension: string;
  score: number;
  evidence_quote: string;
  notes: string;
};

type AssessmentData = {
  verdict: string;
  verdict_reason: string;
  overall_score: number;
  tone_badge?: string;
  tone_description?: string;
  red_flags: string[];
  standout_moments: string[];
  scores: DimensionScoreRaw[];
};

type IntegritySignals = {
  tabSwitches?: number;
  longPauses?: number;
  fastResponses?: number;
  avgResponseStartMs?: number;
};

// Attempt to repair truncated JSON by closing open structures
function repairTruncatedJson(raw: string): string {
  let s = raw.trim();

  // Count open braces and brackets
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }

  // If we're mid-string, close it
  if (inString) s += '"';

  // Close any open arrays/objects
  while (brackets > 0) { s += ']'; brackets--; }
  while (braces > 0) { s += '}'; braces--; }

  return s;
}

async function saveAssessment(
  session_id: string,
  assessment: AssessmentData,
  integrity_signals: IntegritySignals = {}
) {
  // Check if assessment already exists for this session
  const { data: existing } = await supabaseAdmin
    .from('assessments')
    .select('id')
    .eq('session_id', session_id)
    .single();

  let assessmentId: string;

  if (existing) {
    // Update existing assessment
    const { error: uErr } = await supabaseAdmin
      .from('assessments')
      .update({
        verdict: assessment.verdict,
        verdict_reason: assessment.verdict_reason ?? 'Assessment completed.',
        overall_score: assessment.overall_score ?? 3.0,
        red_flags: assessment.red_flags ?? [],
        standout_moments: assessment.standout_moments ?? [],
        tone_badge: assessment.tone_badge ?? '',
        tone_description: assessment.tone_description ?? '',
        integrity_signals: integrity_signals ?? {},
      })
      .eq('session_id', session_id);
    if (uErr) throw uErr;
    assessmentId = existing.id;

    // Delete old dimension scores
    await supabaseAdmin
      .from('dimension_scores')
      .delete()
      .eq('session_id', session_id);
  } else {
    // Insert new assessment
    const { data: assessmentRow, error: aErr } = await supabaseAdmin
      .from('assessments')
      .insert({
        session_id,
        verdict: assessment.verdict,
        verdict_reason: assessment.verdict_reason ?? 'Assessment completed.',
        overall_score: assessment.overall_score ?? 3.0,
        red_flags: assessment.red_flags ?? [],
        standout_moments: assessment.standout_moments ?? [],
        tone_badge: assessment.tone_badge ?? '',
        tone_description: assessment.tone_description ?? '',
        integrity_signals: integrity_signals ?? {},
      })
      .select('id')
      .single();
    if (aErr) throw aErr;
    assessmentId = assessmentRow.id;
  }

  // Insert dimension scores
  const dimensionRows = assessment.scores.map((s) => ({
    assessment_id: assessmentId,
    session_id,
    dimension: s.dimension,
    score: s.score,
    evidence_quote: s.evidence_quote ?? '',
    notes: s.notes ?? '',
  }));
  await supabaseAdmin.from('dimension_scores').insert(dimensionRows);

  // Mark session complete
  await supabaseAdmin
    .from('sessions')
    .update({ status: 'completed', ended_at: new Date().toISOString() })
    .eq('id', session_id);
}

function buildFallbackAssessment(answerCount: number): AssessmentData {
  const score = answerCount >= 4 ? 3 : 2;
  return {
    verdict: score >= 3 ? 'Hold' : 'Pass',
    verdict_reason: 'Manual review recommended — automated scoring unavailable.',
    overall_score: score,
    tone_badge: '',
    tone_description: '',
    scores: [
      'Communication Clarity',
      'Warmth & Patience',
      'Ability to Simplify',
      'English Fluency',
      'Adaptability',
    ].map((dimension) => ({
      dimension,
      score,
      evidence_quote: 'See transcript for context.',
      notes: 'Manual review recommended.',
    })),
    red_flags: ['Automated assessment incomplete — manual review required'],
    standout_moments: ['Candidate completed the screening interview'],
  };
}

function parseAssessmentJson(rawText: string): AssessmentData | null {
  // Clean markdown fences
  let jsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

  // Extract JSON boundaries
  const startIdx = jsonText.indexOf('{');
  const endIdx = jsonText.lastIndexOf('}');

  if (startIdx === -1) {
    console.error('No JSON opening brace found');
    return null;
  }

  // If no closing brace or content seems truncated, attempt repair
  if (endIdx === -1 || endIdx <= startIdx) {
    console.log('JSON appears truncated — attempting repair...');
    jsonText = repairTruncatedJson(jsonText.slice(startIdx));
  } else {
    jsonText = jsonText.slice(startIdx, endIdx + 1);
  }

  // First attempt: parse as-is
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed.verdict && Array.isArray(parsed.scores)) return parsed;
  } catch {
    // Fall through to repair attempt
  }

  // Second attempt: repair and parse
  try {
    const repaired = repairTruncatedJson(jsonText);
    console.log('Attempting repaired JSON parse...');
    const parsed = JSON.parse(repaired);
    if (parsed.verdict && Array.isArray(parsed.scores)) {
      console.log('Repaired JSON parsed successfully.');
      return parsed;
    }
  } catch (e) {
    console.error('Repaired JSON also failed:', e);
  }

  console.error('JSON parse failed:', jsonText.slice(0, 500));
  return null;
}

export async function POST(req: NextRequest) {
  const { session_id, integrity_signals } = await req.json();

  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  try {
    const { data: session, error: sErr } = await supabaseAdmin
      .from('sessions')
      .select('candidate_name')
      .eq('id', session_id)
      .single();

    if (sErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { data: transcript } = await supabaseAdmin
      .from('transcript_entries')
      .select('role, text')
      .eq('session_id', session_id)
      .order('turn_index', { ascending: true });

    const candidateAnswers = (transcript ?? [])
      .filter((t) => t.role === 'candidate')
      .map((t) => t.text);

    if (candidateAnswers.length < 2) {
      return NextResponse.json({ error: 'Not enough responses to assess' }, { status: 400 });
    }

    const prompt = buildAssessmentPrompt(session.candidate_name, candidateAnswers);

    let rawText: string;
    try {
      rawText = await assessWithFallback(prompt);
    } catch (providerErr) {
      console.error('Both Gemini and Groq failed:', providerErr);
      const fallback = buildFallbackAssessment(candidateAnswers.length);
      await saveAssessment(session_id, fallback, integrity_signals ?? {});
      return NextResponse.json({
        success: false,
        fallback: true,
        assessment: fallback,
        error: 'AI providers unavailable — fallback report saved.',
      });
    }

    const assessment = parseAssessmentJson(rawText);

    if (!assessment) {
      // Parse failed — save fallback but return failure flag so UI can offer retry
      const fallback = buildFallbackAssessment(candidateAnswers.length);
      await saveAssessment(session_id, fallback, integrity_signals ?? {});
      return NextResponse.json({
        success: false,
        fallback: true,
        assessment: fallback,
        error: 'Report generation failed — fallback saved. You can retry.',
      });
    }

    await saveAssessment(session_id, assessment, integrity_signals ?? {});
    return NextResponse.json({ success: true, fallback: false, assessment });

  } catch (err) {
    console.error('Assessment error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to generate assessment' },
      { status: 500 }
    );
  }
}
