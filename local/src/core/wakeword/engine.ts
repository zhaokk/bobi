/**
 * Wakeword Engine
 * Detects "Hi Bobi" wake word for activating AI mode
 * 
 * TODO: Replace mock implementation with real wake word detection
 * - Integrate with Porcupine, Snowboy, or custom model
 * - Process audio stream from microphone hardware
 * - Run entirely offline/locally
 */

import { bobiStore } from '../store';

export interface WakewordEngine {
  start(): void;
  stop(): void;
  isListening(): boolean;
  onWakeword(callback: () => void): void;
  triggerWake(): void;
}

type WakewordCallback = () => void;

/**
 * Mock implementation for browser testing
 * Wake word is triggered via UI button click
 */
class MockWakewordEngine implements WakewordEngine {
  private listening = false;
  private callbacks: WakewordCallback[] = [];

  start(): void {
    this.listening = true;
    bobiStore.log('INFO', 'Wakeword', 'Wakeword engine started (click "Hi Bobi" to trigger)');
  }

  stop(): void {
    this.listening = false;
    bobiStore.log('INFO', 'Wakeword', 'Wakeword engine stopped');
  }

  isListening(): boolean {
    return this.listening;
  }

  onWakeword(callback: WakewordCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Called by UI to trigger wake
   */
  triggerWake(): void {
    if (!this.listening) {
      bobiStore.log('WARN', 'Wakeword', 'Wake triggered but engine not listening');
      return;
    }
    bobiStore.log('INFO', 'Wakeword', 'Wake word detected: "Hi Bobi"');
    this.callbacks.forEach(cb => cb());
  }
}

// Singleton instance
export const wakewordEngine: WakewordEngine = new MockWakewordEngine();
