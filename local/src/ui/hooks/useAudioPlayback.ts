/**
 * useAudioPlayback Hook
 * Plays audio from the store's audioQueue
 * Uses buffering to reduce choppiness
 */

import { useEffect, useRef, useCallback } from 'react';
import { bobiStore } from '../../core/store';
import { reaction } from 'mobx';

// Buffer size before starting playback (in samples at 24kHz)
const MIN_BUFFER_SAMPLES = 4800; // 200ms of audio

export function useAudioPlayback() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);
  const pcmBufferRef = useRef<Int16Array[]>([]);
  const totalSamplesRef = useRef(0);
  const nextStartTimeRef = useRef(0);

  // Initialize AudioContext
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      bobiStore.log('INFO', 'AudioPlayback', 'AudioContext initialized');
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // Decode base64 PCM16 to Int16Array
  const decodeChunk = useCallback((base64: string): Int16Array | null => {
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new Int16Array(bytes.buffer);
    } catch {
      return null;
    }
  }, []);

  // Schedule audio playback
  const schedulePlayback = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (!audioContext || pcmBufferRef.current.length === 0) return;

    // Merge all buffered chunks
    const totalLength = pcmBufferRef.current.reduce((acc, arr) => acc + arr.length, 0);
    const mergedPcm = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of pcmBufferRef.current) {
      mergedPcm.set(chunk, offset);
      offset += chunk.length;
    }
    pcmBufferRef.current = [];
    totalSamplesRef.current = 0;

    // Convert to Float32
    const float32 = new Float32Array(mergedPcm.length);
    for (let i = 0; i < mergedPcm.length; i++) {
      float32[i] = mergedPcm[i] / 32768;
    }

    // Create AudioBuffer
    const audioBuffer = audioContext.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);

    // Schedule playback
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    const currentTime = audioContext.currentTime;
    const startTime = Math.max(currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;

    source.onended = () => {
      isPlayingRef.current = pcmBufferRef.current.length > 0;
    };
  }, []);

  // Process audio from store queue with buffering
  const processStoreQueue = useCallback(() => {
    initAudioContext();

    let audioBase64: string | undefined;
    while ((audioBase64 = bobiStore.dequeueAudio()) !== undefined) {
      const chunk = decodeChunk(audioBase64);
      if (chunk) {
        pcmBufferRef.current.push(chunk);
        totalSamplesRef.current += chunk.length;
      }
    }

    // Start playback if we have enough buffered or if not currently playing
    if (totalSamplesRef.current >= MIN_BUFFER_SAMPLES || !isPlayingRef.current) {
      isPlayingRef.current = true;
      schedulePlayback();
    }
  }, [initAudioContext, decodeChunk, schedulePlayback]);

  // Watch store audioQueue
  useEffect(() => {
    const handleClick = () => {
      initAudioContext();
      document.removeEventListener('click', handleClick);
    };
    document.addEventListener('click', handleClick);

    const disposer = reaction(
      () => bobiStore.audioQueue.length,
      (length) => {
        if (length > 0) {
          processStoreQueue();
        }
      }
    );

    return () => {
      disposer();
      document.removeEventListener('click', handleClick);
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [initAudioContext, processStoreQueue]);

  return { initAudioContext };
}
