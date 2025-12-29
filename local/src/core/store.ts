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

// Re-export personality types and constants from presets
export {
  type PersonalitySettings,
  type CharacterMimicry,
  type PersonalityPreset,
  type OpenAIVoice,
  CHARACTER_MIMICRY,
  PERSONALITY_PRESETS,
  PRESET_DISPLAY,
  PRESET_VOICE,
  isCharacterPreset,
  getCharacterMimicry,
  getPresetVoice,
} from './presets/personality';

import { PERSONALITY_PRESETS, type PersonalitySettings, type PersonalityPreset } from './presets/personality';

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
    mood: 'sleepy',
    expression: 'sleepy_0',
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
  maxLogs = 500;  // Increased from 200

  // ============== Frame Capture ==============
  pendingFrameRequest: FrameRequest | null = null;
  private frameResolvers: Map<string, (frame: CapturedFrame | null) => void> = new Map();
  
  // ============== Captured Images History (for debugging) ==============
  capturedImages: Array<{ imageDataUrl: string; camera: string; ts: number }> = [];
  maxCapturedImages = 20;

  // ============== Audio Queue ==============
  audioQueue: string[] = [];
  isPlayingAudio: boolean = false;
  audioPlayedMs: number = 0;  // Track playback position for truncation

  // ============== Microphone State ==============
  micLevel: number = 0;  // 0-100 audio level
  micActive: boolean = false;

  // ============== Personality Settings ==============
  personality: PersonalitySettings = { ...PERSONALITY_PRESETS.default };
  personalityPreset: PersonalityPreset = 'default';
  onPersonalityChange: (() => void) | null = null;  // Callback for session update

  constructor() {
    makeAutoObservable(this);
  }

  // ============== Personality Actions ==============

  updatePersonality(key: keyof PersonalitySettings, value: number): void {
    runInAction(() => {
      this.personality[key] = Math.max(0, Math.min(100, value));
      this.personalityPreset = 'default';  // Reset to custom
    });
    // Trigger session update callback
    this.onPersonalityChange?.();
  }

  applyPersonalityPreset(preset: PersonalityPreset): void {
    runInAction(() => {
      this.personality = { ...PERSONALITY_PRESETS[preset] };
      this.personalityPreset = preset;
    });
    this.onPersonalityChange?.();
  }

  setPersonalityChangeCallback(callback: (() => void) | null): void {
    this.onPersonalityChange = callback;
  }

  // ============== Audio Playback State ==============
  
  setPlayingAudio(playing: boolean): void {
    runInAction(() => {
      this.isPlayingAudio = playing;
      if (!playing) {
        this.audioPlayedMs = 0;
      }
    });
  }

  updateAudioPlayedMs(ms: number): void {
    this.audioPlayedMs = ms;
  }

  clearAudioQueue(): void {
    runInAction(() => {
      this.audioQueue = [];
      this.isPlayingAudio = false;
      this.audioPlayedMs = 0;
    });
  }

  // ============== State Machine Actions ==============

  setState(newState: BobiState): void {
    runInAction(() => {
      const oldState = this.state;
      this.state = newState;
      
      if (newState === 'AWAKE_LISTEN' && oldState === 'DVR_IDLE') {
        this.awakeStartTime = Date.now();
        this.setMood('curious');
      } else if (newState === 'DVR_IDLE') {
        this.awakeStartTime = null;
        this.dialogStartTime = null;
        this.setMood('sleepy');
      } else if (newState === 'ACTIVE_DIALOG' && oldState !== 'ACTIVE_DIALOG') {
        this.dialogStartTime = Date.now();
        this.setMood('happy');
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

  // Number of expression variants per mood
  private readonly MOOD_VARIANT_COUNT: Record<string, number> = {
    happy: 3,
    sad: 3,
    curious: 3,
    surprised: 3,
    sleepy: 3,
    neutral: 3,
  };

  // Head pose variants per mood (matches MOOD_HEAD_POSES in BobiAvatar)
  private readonly MOOD_HEAD_POSES: Record<string, Array<{ yaw: number; pitch: number; roll: number }>> = {
    happy: [
      { yaw: 0, pitch: -5, roll: 0 },
      { yaw: 8, pitch: -3, roll: 5 },
      { yaw: -8, pitch: -3, roll: -5 },
    ],
    sad: [
      { yaw: 0, pitch: 10, roll: 0 },
      { yaw: -5, pitch: 8, roll: -3 },
      { yaw: 5, pitch: 12, roll: 3 },
    ],
    curious: [
      { yaw: 15, pitch: -5, roll: 8 },
      { yaw: -15, pitch: -5, roll: -8 },
      { yaw: 0, pitch: -10, roll: 12 },
    ],
    surprised: [
      { yaw: 0, pitch: -8, roll: 0 },
      { yaw: -5, pitch: -10, roll: -3 },
      { yaw: 5, pitch: -10, roll: 3 },
    ],
    sleepy: [
      { yaw: 0, pitch: 8, roll: 0 },
      { yaw: -3, pitch: 5, roll: -10 },
      { yaw: 3, pitch: 5, roll: 10 },
    ],
    neutral: [
      { yaw: 0, pitch: 0, roll: 0 },
      { yaw: 3, pitch: -2, roll: 0 },
      { yaw: -3, pitch: -2, roll: 0 },
    ]
  };

  /**
   * Set mood and randomly select expression variant + head pose
   */
  setMood(mood: DeviceState['mood']): void {
    const variantCount = this.MOOD_VARIANT_COUNT[mood] || 3;
    const randomExpressionVariant = Math.floor(Math.random() * variantCount);
    const expression = `${mood}_${randomExpressionVariant}`;
    
    // Also randomly select head pose for this mood
    const headPoses = this.MOOD_HEAD_POSES[mood] || this.MOOD_HEAD_POSES.neutral;
    const randomPoseIndex = Math.floor(Math.random() * headPoses.length);
    const headPose = headPoses[randomPoseIndex];
    
    runInAction(() => {
      this.deviceState.mood = mood;
      this.deviceState.expression = expression;
      this.deviceState.headPose = headPose;
    });
    
    this.log('INFO', 'Store', `Mood set to ${mood} (expr:${randomExpressionVariant}, pose:${randomPoseIndex})`);
  }

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

  private readonly LOG_STORAGE_KEY = 'bobi-logs';
  private readonly LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  };

  log(level: LogLevel, category: string, message: string, data?: unknown): void {
    const entry: LogEntry = {
      level,
      category,
      message,
      data,
      ts: Date.now(),
      timestamp: new Date(),
    };

    // Only store INFO+ logs in UI to prevent DEBUG spam from pushing out important logs
    if (this.LOG_LEVEL_PRIORITY[level] >= this.LOG_LEVEL_PRIORITY['INFO']) {
      runInAction(() => {
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
          this.logs = this.logs.slice(-this.maxLogs);
        }
      });

      // Save INFO+ logs to localStorage for debugging
      this.saveLogToStorage(entry);
    }

    // Always console log (including DEBUG)
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

  private saveLogToStorage(entry: LogEntry): void {
    // Skip audio-related logs to reduce noise
    const audioKeywords = ['audio', 'Audio', 'playback', 'Playback', 'microphone', 'Microphone', 'VAD'];
    if (audioKeywords.some(kw => entry.message.includes(kw) || entry.category.includes(kw))) {
      return;
    }

    try {
      const stored = localStorage.getItem(this.LOG_STORAGE_KEY);
      const logs: Array<{ ts: number; level: string; category: string; message: string; data?: unknown }> = 
        stored ? JSON.parse(stored) : [];
      
      logs.push({
        ts: entry.ts,
        level: entry.level,
        category: entry.category,
        message: entry.message,
        data: entry.data,
      });

      // Keep last 2000 logs in storage
      const trimmed = logs.slice(-2000);
      localStorage.setItem(this.LOG_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      // localStorage might be full or disabled
      console.warn('Failed to save log to storage:', e);
    }
  }

  // Export logs for debugging
  exportLogs(): string {
    try {
      const stored = localStorage.getItem(this.LOG_STORAGE_KEY);
      return stored || '[]';
    } catch {
      return '[]';
    }
  }

  // Download logs as file
  downloadLogs(): void {
    const logs = this.exportLogs();
    const blob = new Blob([logs], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bobi-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  clearStoredLogs(): void {
    localStorage.removeItem(this.LOG_STORAGE_KEY);
  }

  clearLogs(clearStorage = false): void {
    this.logs = [];
    if (clearStorage) {
      this.clearStoredLogs();
    }
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

  /**
   * Add a captured image to history (for debugging)
   */
  addCapturedImage(imageDataUrl: string, camera: string): void {
    runInAction(() => {
      this.capturedImages.push({
        imageDataUrl,
        camera,
        ts: Date.now(),
      });
      // Keep only last N images
      if (this.capturedImages.length > this.maxCapturedImages) {
        this.capturedImages = this.capturedImages.slice(-this.maxCapturedImages);
      }
    });
    this.log('INFO', 'Camera', `Captured image saved (${this.capturedImages.length}/${this.maxCapturedImages})`);
  }

  /**
   * Clear captured images history
   */
  clearCapturedImages(): void {
    runInAction(() => {
      this.capturedImages = [];
    });
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

  get moodEmoji(): string {
    switch (this.deviceState.mood) {
      case 'happy': return '😊';
      case 'curious': return '🤔';
      case 'sleepy': return '😴';
      case 'surprised': return '😮';
      case 'sad': return '😢';
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
