/**
 * Shared Store for Bobi Local
 * 
 * This store is shared between core logic and UI.
 * Core updates state directly, UI observes changes via MobX.
 * No network communication needed - everything in same process.
 */

import { makeAutoObservable, runInAction } from 'mobx';
import type {
  BobiState,
  DeviceState,
  GPSLocation,
  ConversationMessage,
  LogEntry,
  LogLevel,
  FrameRequest,
  RealtimeSessionStatus,
  CapturedFrame,
} from './types';

class BobiStore {
  // ============== Connection State ==============
  realtimeStatus: RealtimeSessionStatus = 'disconnected';
  realtimeModel: string | null = null;
  sessionId: string | null = null;

  // ============== State Machine ==============
  state: BobiState = 'DVR_IDLE';
  awakeStartTime: number | null = null;
  dialogStartTime: number | null = null;
  lastInteractionTime: number | null = null;
  dvrRecording = true;

  // ============== Device State ==============
  deviceState: DeviceState = {
    volume: 50,
    brightness: 70,
    expression: 'sleepy',
    headPose: { yaw: 0, pitch: 0, roll: 0 },
  };

  // ============== Camera State ==============
  camera = {
    isActive: false,
    hasError: false,
    errorMessage: '',
  };

  // ============== Sensors ==============
  gpsLocation: GPSLocation = {
    lat: 39.9042,
    lng: 116.4074,
    speed_kmh: 0,
    heading: 0,
    accuracy: 10,
    ts: Date.now(),
  };

  // ============== Conversation ==============
  conversation: ConversationMessage[] = [];
  currentResponse = '';
  streamingResponse = '';  // For UI display during streaming

  // ============== Logs ==============
  logs: LogEntry[] = [];
  maxLogs = 200;

  // ============== Frame Capture ==============
  pendingFrameRequest: FrameRequest | null = null;
  private frameResolvers: Map<string, (frame: CapturedFrame | null) => void> = new Map();

  // ============== Audio Queue ==============
  audioQueue: string[] = [];

  // ============== Microphone State ==============
  micLevel: number = 0;  // 0-100 audio level
  micActive: boolean = false;

  constructor() {
    makeAutoObservable(this);
  }

  // ============== State Machine Actions ==============

  setState(newState: BobiState): void {
    runInAction(() => {
      const oldState = this.state;
      this.state = newState;
      
      if (newState === 'AWAKE_LISTEN' && oldState === 'DVR_IDLE') {
        this.awakeStartTime = Date.now();
        this.deviceState.expression = 'curious';
      } else if (newState === 'DVR_IDLE') {
        this.awakeStartTime = null;
        this.dialogStartTime = null;
        this.deviceState.expression = 'sleepy';
      } else if (newState === 'ACTIVE_DIALOG' && oldState !== 'ACTIVE_DIALOG') {
        this.dialogStartTime = Date.now();
        this.deviceState.expression = 'happy';
      }
    });
  }

  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  recordInteraction(): void {
    this.lastInteractionTime = Date.now();
  }

  // ============== Device State Actions ==============

  updateDeviceState(updates: Partial<DeviceState>): void {
    runInAction(() => {
      this.deviceState = { ...this.deviceState, ...updates };
    });
  }

  // ============== Realtime Status Actions ==============

  setRealtimeStatus(status: RealtimeSessionStatus, model?: string): void {
    runInAction(() => {
      this.realtimeStatus = status;
      if (model !== undefined) {
        this.realtimeModel = model;
      }
      if (status === 'disconnected') {
        this.realtimeModel = null;
        this.sessionId = null;
      }
    });
  }

  // ============== Conversation Actions ==============

  private currentTurnId: string | null = null;
  private completedTurnIds: Set<string> = new Set();

  appendTextDelta(text: string, turnId?: string): void {
    runInAction(() => {
      // Track current turn
      if (turnId && turnId !== this.currentTurnId) {
        this.currentTurnId = turnId;
        this.currentResponse = '';
      }
      this.currentResponse += text;
      this.streamingResponse = this.currentResponse;
    });
  }

  completeText(text: string, turnId?: string): void {
    runInAction(() => {
      // Avoid duplicate messages for same turn
      if (turnId && this.completedTurnIds.has(turnId)) {
        return;
      }
      if (turnId) {
        this.completedTurnIds.add(turnId);
        // Clean up old turn IDs to prevent memory leak
        if (this.completedTurnIds.size > 100) {
          const arr = Array.from(this.completedTurnIds);
          this.completedTurnIds = new Set(arr.slice(-50));
        }
      }
      
      const content = text || this.currentResponse;
      if (content.trim()) {
        this.conversation.push({
          role: 'assistant',
          content,
          ts: Date.now(),
          turnId,
        });
      }
      this.currentResponse = '';
      this.streamingResponse = '';
      this.currentTurnId = null;
    });
  }

  addUserMessage(text: string): void {
    runInAction(() => {
      // Avoid duplicate consecutive user messages
      const lastMsg = this.conversation[this.conversation.length - 1];
      if (lastMsg?.role === 'user' && lastMsg.content === text) {
        return;
      }
      this.conversation.push({
        role: 'user',
        content: text,
        ts: Date.now(),
      });
    });
  }

  // ============== Log Actions ==============

  log(level: LogLevel, category: string, message: string, data?: unknown): void {
    runInAction(() => {
      this.logs.push({
        level,
        category,
        message,
        data,
        ts: Date.now(),
        timestamp: new Date(),
      });
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(-this.maxLogs);
      }
    });

    // Also console log
    const prefix = `[${new Date().toLocaleTimeString()}] [${level}] [${category}]`;
    if (level === 'ERROR') {
      console.error(prefix, message, data ?? '');
    } else if (level === 'WARN') {
      console.warn(prefix, message, data ?? '');
    } else if (level === 'DEBUG') {
      console.debug(prefix, message, data ?? '');
    } else {
      console.log(prefix, message, data ?? '');
    }
  }

  clearLogs(): void {
    this.logs = [];
  }

  // ============== Frame Capture Actions ==============

  /**
   * Request a frame from the camera (called by core)
   * Returns a promise that resolves when UI captures the frame
   */
  requestFrame(request: FrameRequest): Promise<CapturedFrame | null> {
    return new Promise((resolve) => {
      this.frameResolvers.set(request.requestId, resolve);
      runInAction(() => {
        this.pendingFrameRequest = request;
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.frameResolvers.has(request.requestId)) {
          this.frameResolvers.delete(request.requestId);
          runInAction(() => {
            if (this.pendingFrameRequest?.requestId === request.requestId) {
              this.pendingFrameRequest = null;
            }
          });
          resolve(null);
        }
      }, 10000);
    });
  }

  /**
   * Fulfill a frame request (called by UI after capturing)
   */
  fulfillFrameRequest(requestId: string, frame: CapturedFrame | null): void {
    const resolver = this.frameResolvers.get(requestId);
    if (resolver) {
      this.frameResolvers.delete(requestId);
      runInAction(() => {
        this.pendingFrameRequest = null;
      });
      resolver(frame);
    }
  }

  // ============== Audio Actions ==============

  enqueueAudio(audioBase64: string): void {
    this.audioQueue.push(audioBase64);
  }

  dequeueAudio(): string | undefined {
    return this.audioQueue.shift();
  }

  // ============== GPS Actions ==============

  updateGPS(updates: Partial<GPSLocation>): void {
    runInAction(() => {
      this.gpsLocation = { ...this.gpsLocation, ...updates, ts: Date.now() };
    });
  }

  // ============== Camera Actions ==============

  updateCamera(updates: { isActive?: boolean; hasError?: boolean; errorMessage?: string }): void {
    runInAction(() => {
      if (updates.isActive !== undefined) this.camera.isActive = updates.isActive;
      if (updates.hasError !== undefined) this.camera.hasError = updates.hasError;
      if (updates.errorMessage !== undefined) this.camera.errorMessage = updates.errorMessage;
    });
  }

  // ============== Microphone Actions ==============

  updateMicLevel(level: number): void {
    this.micLevel = Math.min(100, Math.max(0, level));
  }

  setMicActive(active: boolean): void {
    runInAction(() => {
      this.micActive = active;
      if (!active) {
        this.micLevel = 0;
      }
    });
  }

  // ============== Computed ==============

  get isAwake(): boolean {
    return this.state !== 'DVR_IDLE';
  }

  get awakeRemainingMs(): number {
    if (!this.awakeStartTime) return 0;
    const elapsed = Date.now() - this.awakeStartTime;
    const timeout = this.state === 'ACTIVE_DIALOG' ? 180000 : 30000; // 3min dialog, 30s listen
    return Math.max(0, timeout - elapsed);
  }

  get dialogDurationMs(): number {
    if (!this.dialogStartTime) return 0;
    return Date.now() - this.dialogStartTime;
  }

  get stateEmoji(): string {
    switch (this.state) {
      case 'DVR_IDLE': return '📹';
      case 'AWAKE_LISTEN': return '👂';
      case 'ACTIVE_DIALOG': return '💬';
      case 'VISION_CHECK': return '👀';
      default: return '❓';
    }
  }

  get expressionEmoji(): string {
    switch (this.deviceState.expression) {
      case 'happy': return '😊';
      case 'curious': return '🤔';
      case 'sleepy': return '😴';
      case 'surprised': return '😮';
      case 'concerned': return '😟';
      case 'neutral':
      default: return '😐';
    }
  }

  get headPose(): { pitch: number; yaw: number; roll: number } {
    return this.deviceState.headPose;
  }
}

// Singleton instance - shared between core and UI
export const bobiStore = new BobiStore();
