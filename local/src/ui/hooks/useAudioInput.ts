/**
 * useAudioInput Hook
 * Captures microphone audio and sends PCM16 data to LLM via orchestrator
 * Uses ScriptProcessor for better browser compatibility
 * Resamples to 24kHz as required by OpenAI Realtime API
 */

import { useEffect, useRef, useCallback } from 'react';
import { bobiStore } from '../../core/store';
import { orchestrator } from '../../core/orchestrator';

export function useAudioInput() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isActiveRef = useRef(false);
  const chunkCountRef = useRef(0);

  const startCapture = useCallback(async () => {
    if (isActiveRef.current) {
      bobiStore.log('WARN', 'AudioInput', 'Already capturing');
      return;
    }

    try {
      bobiStore.log('INFO', 'AudioInput', 'Requesting microphone access...');

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      bobiStore.log('INFO', 'AudioInput', 'Microphone access granted');

      // Create audio context (browser default sample rate, usually 44100 or 48000)
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const inputSampleRate = audioContext.sampleRate;
      bobiStore.log('INFO', 'AudioInput', `Audio context sample rate: ${inputSampleRate}Hz`);

      // Create analyser for level monitoring
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      // Create media stream source
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Use ScriptProcessor for audio capture
      // Buffer size: 8192 samples for less frequent callbacks
      const processor = audioContext.createScriptProcessor(8192, 1, 1);
      processorRef.current = processor;

      // Resample ratio (from browser rate to 24kHz)
      const targetSampleRate = 24000;
      const resampleRatio = targetSampleRate / inputSampleRate;

      processor.onaudioprocess = (event) => {
        if (!isActiveRef.current || !bobiStore.isAwake) return;

        const inputData = event.inputBuffer.getChannelData(0);
        
        // Resample to 24kHz
        const outputLength = Math.round(inputData.length * resampleRatio);
        const resampledData = new Float32Array(outputLength);
        
        for (let i = 0; i < outputLength; i++) {
          const srcIndex = i / resampleRatio;
          const srcIndexFloor = Math.floor(srcIndex);
          const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
          const fraction = srcIndex - srcIndexFloor;
          
          // Linear interpolation
          resampledData[i] = inputData[srcIndexFloor] * (1 - fraction) + 
                             inputData[srcIndexCeil] * fraction;
        }

        // Convert float32 to int16 PCM
        const pcm16 = new Int16Array(resampledData.length);
        for (let i = 0; i < resampledData.length; i++) {
          const s = Math.max(-1, Math.min(1, resampledData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Convert to base64
        const base64 = arrayBufferToBase64(pcm16.buffer);
        
        // Send to LLM
        orchestrator.sendAudio(base64);

        // Log periodically
        chunkCountRef.current++;
        if (chunkCountRef.current % 25 === 0) {
          bobiStore.log('DEBUG', 'AudioInput', `Audio chunks sent: ${chunkCountRef.current}`);
        }
      };

      // Connect nodes: source -> processor -> destination (required for ScriptProcessor to work)
      source.connect(processor);
      processor.connect(audioContext.destination);

      isActiveRef.current = true;
      chunkCountRef.current = 0;
      bobiStore.setMicActive(true);
      bobiStore.log('INFO', 'AudioInput', 'Microphone capture started - sending audio to LLM');

      // Start level monitoring loop
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current || !isActiveRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate average level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;

        // Convert to 0-100 scale
        const level = Math.min(100, (average / 128) * 100);
        bobiStore.updateMicLevel(level);

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      bobiStore.log('ERROR', 'AudioInput', 'Failed to start microphone', err);
      bobiStore.setMicActive(false);
      isActiveRef.current = false;
    }
  }, []);

  const stopCapture = useCallback(() => {
    bobiStore.log('INFO', 'AudioInput', 'Stopping microphone capture...');

    isActiveRef.current = false;

    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Disconnect processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    analyserRef.current = null;
    bobiStore.setMicActive(false);
    bobiStore.updateMicLevel(0);

    bobiStore.log('INFO', 'AudioInput', `Microphone stopped. Total chunks: ${chunkCountRef.current}`);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isActiveRef.current) {
        stopCapture();
      }
    };
  }, [stopCapture]);

  return { startCapture, stopCapture, isActive: isActiveRef.current };
}

// Helper: ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
