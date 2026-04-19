import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();

    if (!apiKey || !voiceId) {
      console.error("❌ TTS ERROR: Missing ElevenLabs API Key or Voice ID in .env.local");
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey, // <-- This is the exact header ElevenLabs demands
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5', // The fastest model for voice AI
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      // If it fails, extract the exact error message from ElevenLabs
      const errorText = await response.text();
      console.error(`❌ ElevenLabs Failed! Status: ${response.status}`);
      console.error(`❌ ElevenLabs Reason: ${errorText}`);
      return NextResponse.json({ error: 'TTS request failed' }, { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });

  } catch (error) {
    console.error('❌ Internal TTS Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
