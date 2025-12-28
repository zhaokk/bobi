/**
 * Wakeword Engine Interface
 * Detects "Hi Bobi" wake word for activating AI mode
 * 
 * TODO: Replace mock implementation with real wake word detection
 * - Integrate with Porcupine, Snowboy, or custom model
 * - Process audio stream from microphone hardware
 * - Run entirely offline/locally
 */

import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

export interface WakewordEngine {
  /**
   * Start listening for wake word
   */
  start(): void;

  /**
   * Stop listening
   */
  stop(): void;

  /**
   * Check if currently listening
   */
  isListening(): boolean;

  /**
   * Register callback for wake word detection
   */
  onWakeword(callback: () => void): void;

  /**
   * Process audio chunk (for engines that accept streaming audio)
   */
  processAudio?(audioChunk: Buffer): void;
}

/**
 * Mock implementation for WebUI testing
 * Wake word is triggered via WebSocket message from UI
 */
class MockWakewordEngine extends EventEmitter implements WakewordEngine {
  private listening = false;

  start(): void {
    this.listening = true;
    logger.info('Wakeword', 'Mock wakeword engine started (waiting for WebUI trigger)');
  }

  stop(): void {
    this.listening = false;
    logger.info('Wakeword', 'Mock wakeword engine stopped');
  }

  isListening(): boolean {
    return this.listening;
  }

  onWakeword(callback: () => void): void {
    this.on('wakeword', callback);
  }

  /**
   * Called by WebSocket handler when UI triggers wake
   */
  triggerWake(): void {
    if (!this.listening) {
      logger.warn('Wakeword', 'Wake triggered but engine not listening');
      return;
    }
    logger.info('Wakeword', 'Wake word detected: "Hi Bobi"');
    this.emit('wakeword');
  }

  // Mock: we don't process audio, but interface requires it
  processAudio(_audioChunk: Buffer): void {
    // TODO: Implement real audio processing for wake word detection
    // Example with Porcupine:
    // const result = this.porcupine.process(audioChunk);
    // if (result >= 0) this.emit('wakeword');
  }
}

/**
 * TODO: Real implementation example structure
 * 
 * class PorcupineWakewordEngine implements WakewordEngine {
 *   private porcupine: Porcupine;
 *   
 *   constructor() {
 *     this.porcupine = new Porcupine({
 *       accessKey: process.env.PORCUPINE_KEY,
 *       keywords: ['hi bobi'], // Custom trained keyword
 *     });
 *   }
 *   
 *   processAudio(audioChunk: Buffer): void {
 *     const pcm = convertToPCM(audioChunk);
 *     const result = this.porcupine.process(pcm);
 *     if (result >= 0) {
 *       this.emit('wakeword');
 *     }
 *   }
 * }
 */

// Export singleton mock engine
export const wakewordEngine = new MockWakewordEngine();
