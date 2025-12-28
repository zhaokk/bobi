/**
 * State Machine for Bobi
 * Manages transitions between DVR_IDLE, AWAKE_LISTEN, ACTIVE_DIALOG, VISION_CHECK
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { ENV } from '../config/env.js';
import type { BobiState, StateContext, DeviceState, Expression } from '../types/index.js';
import { dvrRecorder } from '../dvr/recorder.js';

export interface StateMachineEvents {
  stateChange: (newState: BobiState, oldState: BobiState, context: StateContext) => void;
  requestLLMConnect: () => void;
  requestLLMDisconnect: () => void;
  dialogTimeout: () => void;
  awakeTimeout: () => void;
}

class StateMachine extends EventEmitter {
  private context: StateContext = {
    state: 'DVR_IDLE',
    awakeStartTime: null,
    dialogStartTime: null,
    lastInteractionTime: null,
    sessionId: null,
  };

  private deviceState: DeviceState = {
    volume: 50,
    brightness: 70,
    expression: 'sleepy',
    headPose: { yaw: 0, pitch: 0 },
  };

  private awakeTimer: NodeJS.Timeout | null = null;
  private dialogTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    // Start in DVR mode
    this.enterDVRIdle();
  }

  // ============== Getters ==============

  getState(): BobiState {
    return this.context.state;
  }

  getContext(): Readonly<StateContext> {
    return { ...this.context };
  }

  getDeviceState(): Readonly<DeviceState> {
    return { ...this.deviceState };
  }

  getAwakeRemainingMs(): number {
    if (this.context.state === 'DVR_IDLE' || !this.context.awakeStartTime) return 0;
    const elapsed = Date.now() - this.context.awakeStartTime;
    return Math.max(0, ENV.AWAKE_WINDOW_MS - elapsed);
  }

  getDialogDurationMs(): number {
    if (!this.context.dialogStartTime) return 0;
    return Date.now() - this.context.dialogStartTime;
  }

  // ============== State Transitions ==============

  private transition(newState: BobiState): void {
    const oldState = this.context.state;
    if (oldState === newState) return;

    logger.info('StateMachine', `Transition: ${oldState} -> ${newState}`);
    this.context.state = newState;
    this.emit('stateChange', newState, oldState, this.getContext());
  }

  /**
   * Enter DVR_IDLE state
   * - Stop LLM session
   * - Start DVR recording
   * - Set sleepy expression
   */
  enterDVRIdle(): void {
    this.clearTimers();
    this.context.awakeStartTime = null;
    this.context.dialogStartTime = null;
    this.context.sessionId = null;

    // Disconnect LLM
    this.emit('requestLLMDisconnect');

    // Start DVR recording
    if (!dvrRecorder.isRecording()) {
      dvrRecorder.startRecording();
    }

    // Set sleepy expression
    this.updateDeviceState({ expression: 'sleepy' });

    this.transition('DVR_IDLE');
  }

  /**
   * Wake up - enter AWAKE_LISTEN state
   * - Start awake window timer
   * - Connect to LLM
   * - Set neutral/happy expression
   */
  wake(): void {
    if (this.context.state !== 'DVR_IDLE') {
      // If already awake, just refresh the timer
      this.refreshAwakeTimer();
      return;
    }

    logger.info('StateMachine', 'Waking up Bobi!');
    
    this.context.awakeStartTime = Date.now();
    this.context.lastInteractionTime = Date.now();

    // Set happy expression
    this.updateDeviceState({ expression: 'happy' });

    // Request LLM connection
    this.emit('requestLLMConnect');

    // Start awake window timer
    this.startAwakeTimer();

    this.transition('AWAKE_LISTEN');
  }

  /**
   * Start active dialog (user is speaking or LLM is responding)
   */
  startDialog(): void {
    if (this.context.state === 'DVR_IDLE') {
      logger.warn('StateMachine', 'Cannot start dialog from DVR_IDLE - need to wake first');
      return;
    }

    this.clearTimers();
    this.context.dialogStartTime = this.context.dialogStartTime || Date.now();
    this.context.lastInteractionTime = Date.now();

    // Start dialog timeout timer
    this.startDialogTimer();

    this.transition('ACTIVE_DIALOG');
  }

  /**
   * Enter vision check state (waiting for camera capture)
   */
  enterVisionCheck(): void {
    if (this.context.state === 'DVR_IDLE') {
      logger.warn('StateMachine', 'Cannot enter vision check from DVR_IDLE');
      return;
    }

    this.context.lastInteractionTime = Date.now();
    this.updateDeviceState({ expression: 'curious' });

    this.transition('VISION_CHECK');
  }

  /**
   * Exit vision check back to dialog
   */
  exitVisionCheck(): void {
    if (this.context.state !== 'VISION_CHECK') return;
    this.transition('ACTIVE_DIALOG');
  }

  /**
   * Record user interaction (resets timeouts)
   */
  recordInteraction(): void {
    this.context.lastInteractionTime = Date.now();
    
    if (this.context.state === 'AWAKE_LISTEN') {
      this.refreshAwakeTimer();
    } else if (this.context.state === 'ACTIVE_DIALOG') {
      this.refreshDialogTimer();
    }
  }

  /**
   * Update device state (volume, brightness, expression, headPose)
   */
  updateDeviceState(updates: Partial<DeviceState>): void {
    Object.assign(this.deviceState, updates);
    logger.debug('StateMachine', 'Device state updated', this.deviceState);
    this.emit('deviceStateChange', this.deviceState);
  }

  /**
   * Set LLM session ID
   */
  setSessionId(sessionId: string): void {
    this.context.sessionId = sessionId;
  }

  // ============== Timers ==============

  private clearTimers(): void {
    if (this.awakeTimer) {
      clearTimeout(this.awakeTimer);
      this.awakeTimer = null;
    }
    if (this.dialogTimer) {
      clearTimeout(this.dialogTimer);
      this.dialogTimer = null;
    }
  }

  private startAwakeTimer(): void {
    this.awakeTimer = setTimeout(() => {
      logger.info('StateMachine', 'Awake window timeout - returning to DVR_IDLE');
      this.emit('awakeTimeout');
      this.enterDVRIdle();
    }, ENV.AWAKE_WINDOW_MS);
  }

  private refreshAwakeTimer(): void {
    if (this.awakeTimer) {
      clearTimeout(this.awakeTimer);
    }
    this.context.awakeStartTime = Date.now();
    this.startAwakeTimer();
  }

  private startDialogTimer(): void {
    const remaining = ENV.MAX_DIALOG_DURATION_MS - this.getDialogDurationMs();
    if (remaining <= 0) {
      this.handleDialogTimeout();
      return;
    }

    this.dialogTimer = setTimeout(() => {
      this.handleDialogTimeout();
    }, remaining);
  }

  private refreshDialogTimer(): void {
    // Dialog timer doesn't reset on interaction - it's a max duration
    // But we can extend awake window
    if (this.context.state === 'ACTIVE_DIALOG') {
      this.context.awakeStartTime = Date.now();
    }
  }

  private handleDialogTimeout(): void {
    logger.info('StateMachine', 'Dialog max duration reached');
    this.emit('dialogTimeout');
    // LLM should be notified to wrap up, then we'll return to DVR_IDLE
    // The orchestrator will handle the graceful shutdown
  }

  // ============== State Queries ==============

  isAwake(): boolean {
    return this.context.state !== 'DVR_IDLE';
  }

  canUploadData(): boolean {
    // Only allow data upload (frames, location) when awake
    return this.isAwake();
  }

  canCallLLM(): boolean {
    return this.isAwake() && this.context.sessionId !== null;
  }
}

// Singleton instance
export const stateMachine = new StateMachine();
