/**
 * Audio Playback Hook
 * Plays PCM16 audio chunks from LLM
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { bobiStore } from '../store/bobiStore';

export function useAudioPlayback(): {
  isPlaying: boolean;
  startPlayback: () => void;
  stopPlayback: () => void;
} {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const nextPlayTimeRef = useRef(0);

  const processAudioQueue = useCallback(() => {
    if (!audioContextRef.current) return;

    const audioBase64 = bobiStore.dequeueAudio();
    if (!audioBase64) return;

    try {
      // Resume AudioContext if suspended (browser autoplay policy)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      // Decode base64 to PCM16 bytes
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert PCM16 to Float32
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768;
      }

      // Create audio buffer (24kHz mono)
      const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      // Schedule playback with proper timing to avoid gaps
      const currentTime = audioContextRef.current.currentTime;
      const startTime = Math.max(currentTime, nextPlayTimeRef.current);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start(startTime);

      // Update next play time
      nextPlayTimeRef.current = startTime + audioBuffer.duration;

      console.log(`🔊 Playing audio chunk: ${float32.length} samples`);
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, []);

  const startPlayback = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      console.log('🔊 AudioContext created');
    }
    
    // Resume if suspended
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().then(() => {
        console.log('🔊 AudioContext resumed');
      });
    }

    nextPlayTimeRef.current = 0;
    setIsPlaying(true);

    // Process queue every 30ms for smoother playback
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = window.setInterval(processAudioQueue, 30);
    console.log('🔊 Audio playback started');
  }, [processAudioQueue]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    console.log('🔊 Audio playback stopped');
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
      audioContextRef.current?.close();
    };
  }, [stopPlayback]);

  return {
    isPlaying,
    startPlayback,
    stopPlayback,
  };
}
