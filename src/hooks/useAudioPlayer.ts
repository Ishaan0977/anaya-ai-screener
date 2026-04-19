'use client';
import { useState, useRef, useCallback } from 'react';

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  isFetching: boolean;
  playText: (text: string) => Promise<void>; // Back to normal, no turnIndex needed!
  stop: () => void;
  analyserNode: AnalyserNode | null;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // THE FIX: The hook keeps track of its own turns internally
  const turnCounterRef = useRef(0);

  const stop = useCallback(() => {
    sourceRef.current?.stop();
    setIsPlaying(false);
  }, []);

  const playText = useCallback(async (text: string) => {
    if (!text.trim()) return;

    try {
      setIsFetching(true);
      stop();

      let res;
      const isDevMode = false; // Flip to false when you want real ElevenLabs tokens
      const isFirstTurn = turnCounterRef.current === 0;

      // Increment the counter so the next time this runs, isFirstTurn is false
      turnCounterRef.current += 1;

      if (isFirstTurn || isDevMode) {
        if (isDevMode && !isFirstTurn) {
          console.log("🛑 DEV MODE: Skipping ElevenLabs API.");
          console.log("Anaya says:", text);
        }
        
        // Grab the free local file for the intro or dev mode
        res = await fetch('/anaya-opening.mp3');
      } else {
        // Normal Production API Call
        res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      }

      if (!res.ok) throw new Error('TTS request failed');

      // Set up Web Audio API for visualizer
      const arrayBuffer = await res.arrayBuffer();
      setIsFetching(false);

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      setAnalyserNode(analyser);

      const source = ctx.createBufferSource();
      sourceRef.current = source;
      source.buffer = audioBuffer;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      source.onended = () => setIsPlaying(false);
      source.start();
      setIsPlaying(true);

    } catch (err) {
      console.error('Audio playback error:', err);
      setIsFetching(false);
      setIsPlaying(false);
    }
  }, [stop]);

  return { isPlaying, isFetching, playText, stop, analyserNode };
}
