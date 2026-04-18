import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 });
  }

  const trimmed = text.slice(0, 400);

  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/cgSgspJ2msm6clMCkdW9",
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: trimmed,
          model_id: 'eleven_turbo_v2', 
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error('ElevenLabs API failed with status:', response.status);
      return NextResponse.json({ error: 'TTS failed' }, { status: response.status });
    }

    // THE FIX: Force it into a raw Node Buffer so Next.js cannot corrupt the binary
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
      },
    });

  } catch (err) {
    console.error('TTS route error:', err);
    return NextResponse.json({ error: 'TTS service unavailable' }, { status: 500 });
  }
}
