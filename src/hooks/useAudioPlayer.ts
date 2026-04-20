'use client';
import { useState, useRef, useCallback } from 'react';

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  isFetching: boolean;
  playText: (text: string) => Promise<void>;
  stop: () => void;
  analyserNode: AnalyserNode | null;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

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
      // 🛑 DEV MODE TOGGLE: Set to true to save ElevenLabs credits
      const isDevMode = false; 

      if (isDevMode) {
        console.log("🛑 DEV MODE ACTIVE: ElevenLabs skipped.");
        console.log("🤖 Anaya says:", text);
        
        // Fetch your local mp3 just to trigger the visualizer and timing loop
        res = await fetch('/anaya-opening.mp3'); 
      } else {
        // 🚀 PRODUCTION MODE: Hit ElevenLabs
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
