/**
 * useAudioPlayback Hook
 * Plays audio from the store's audioQueue with interruption support
 * Uses scheduled playback for smooth audio without gaps
 */

import { useEffect, useRef, useCallback } from 'react';
import { bobiStore } from '../../core/store';
import { reaction } from 'mobx';

// Minimum buffer before starting playback (ms)
const MIN_BUFFER_MS = 100;

export function useAudioPlayback() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const bufferAccumulatorRef = useRef<Float32Array[]>([]);
  const bufferSamplesRef = useRef(0);
  const playbackTimerRef = useRef<number | null>(null);

  // Initialize AudioContext
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      // Create GainNode for volume control
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.connect(audioContextRef.current.destination);
      // Set initial volume from store
      gainNodeRef.current.gain.value = bobiStore.deviceState.volume / 100;
      bobiStore.log('INFO', 'AudioPlayback', 'AudioContext initialized with volume: ' + bobiStore.deviceState.volume);
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // Stop all playback immediately
  const stopPlayback = useCallback(() => {
    // Stop all scheduled sources
    for (const source of scheduledSourcesRef.current) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Already stopped
      }
    }
    scheduledSourcesRef.current = [];
    bufferAccumulatorRef.current = [];
    bufferSamplesRef.current = 0;
    nextPlayTimeRef.current = 0;
    isPlayingRef.current = false;
    
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    
    bobiStore.setPlayingAudio(false);
  }, []);

  // Decode base64 PCM16 to Float32Array
  const decodeToFloat32 = useCallback((base64: string): Float32Array | null => {
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768;
      }
      return float32;
    } catch {
      return null;
    }
  }, []);

  // Schedule a buffer for playback
  const scheduleBuffer = useCallback((audioData: Float32Array) => {
    const audioContext = audioContextRef.current;
    const gainNode = gainNodeRef.current;
    if (!audioContext || !gainNode) return;

    const audioBuffer = audioContext.createBuffer(1, audioData.length, 24000);
    audioBuffer.copyToChannel(audioData, 0);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNode);  // Connect to GainNode for volume control

    // Schedule seamlessly after previous buffer
    const currentTime = audioContext.currentTime;
    const startTime = Math.max(currentTime + 0.01, nextPlayTimeRef.current);
    
    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;

    // Track source for cleanup
    scheduledSourcesRef.current.push(source);
    
    // Clean up finished sources
    source.onended = () => {
      const idx = scheduledSourcesRef.current.indexOf(source);
      if (idx > -1) {
        scheduledSourcesRef.current.splice(idx, 1);
      }
      // Check if all playback finished
      if (scheduledSourcesRef.current.length === 0 && bobiStore.audioQueue.length === 0) {
        isPlayingRef.current = false;
        bobiStore.setPlayingAudio(false);
      }
    };
  }, []);

  // Flush accumulated buffer to playback
  const flushBuffer = useCallback(() => {
    if (bufferAccumulatorRef.current.length === 0) return;

    // Merge accumulated chunks
    const totalLength = bufferSamplesRef.current;
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of bufferAccumulatorRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    
    bufferAccumulatorRef.current = [];
    bufferSamplesRef.current = 0;

    scheduleBuffer(merged);
  }, [scheduleBuffer]);

  // Process audio queue with buffering
  const processQueue = useCallback(() => {
    const audioContext = initAudioContext();
    if (!audioContext) return;

    // Collect chunks from queue
    while (bobiStore.audioQueue.length > 0) {
      const base64 = bobiStore.dequeueAudio();
      if (base64) {
        const decoded = decodeToFloat32(base64);
        if (decoded) {
          bufferAccumulatorRef.current.push(decoded);
          bufferSamplesRef.current += decoded.length;
        }
      }
    }

    // Check if we have enough buffer to start/continue playback
    const bufferMs = (bufferSamplesRef.current / 24000) * 1000;
    
    if (!isPlayingRef.current) {
      // Wait for minimum buffer before starting
      if (bufferMs >= MIN_BUFFER_MS) {
        isPlayingRef.current = true;
        bobiStore.setPlayingAudio(true);
        flushBuffer();
      } else {
        // Wait a bit more for buffer to fill
        if (!playbackTimerRef.current) {
          playbackTimerRef.current = window.setTimeout(() => {
            playbackTimerRef.current = null;
            if (bufferSamplesRef.current > 0) {
              isPlayingRef.current = true;
              bobiStore.setPlayingAudio(true);
              flushBuffer();
            }
          }, MIN_BUFFER_MS);
        }
      }
    } else {
      // Already playing - flush immediately for continuous playback
      flushBuffer();
    }
  }, [initAudioContext, decodeToFloat32, flushBuffer]);

  // Watch store audioQueue and handle interruption
  useEffect(() => {
    const handleClick = () => {
      initAudioContext();
      document.removeEventListener('click', handleClick);
    };
    document.addEventListener('click', handleClick);

    // Watch for new audio
    const audioDisposer = reaction(
      () => bobiStore.audioQueue.length,
      (length) => {
        if (length > 0) {
          processQueue();
        }
      }
    );

    // Watch for volume changes
    const volumeDisposer = reaction(
      () => bobiStore.deviceState.volume,
      (volume) => {
        if (gainNodeRef.current) {
          gainNodeRef.current.gain.value = volume / 100;
          bobiStore.log('DEBUG', 'AudioPlayback', `Volume set to ${volume}%`);
        }
      }
    );

    // Watch for interruption (queue cleared)
    const interruptDisposer = reaction(
      () => bobiStore.isPlayingAudio,
      (playing) => {
        if (!playing && scheduledSourcesRef.current.length > 0) {
          stopPlayback();
        }
      }
    );

    return () => {
      audioDisposer();
      volumeDisposer();
      interruptDisposer();
      document.removeEventListener('click', handleClick);
      stopPlayback();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [initAudioContext, processQueue, stopPlayback]);

  return { initAudioContext };
}
