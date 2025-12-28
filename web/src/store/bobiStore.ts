/**
 * MobX Store for Bobi WebUI
 */

import { makeAutoObservable, runInAction } from 'mobx';

// Types matching server
export type BobiState = 'DVR_IDLE' | 'AWAKE_LISTEN' | 'ACTIVE_DIALOG' | 'VISION_CHECK';
export type Expression = 'neutral' | 'happy' | 'curious' | 'sleepy' | 'surprised' | 'concerned';

export interface HeadPose {
  yaw: number;
  pitch: number;
}

export interface DeviceState {
  volume: number;
  brightness: number;
  expression: Expression;
  headPose: HeadPose;
}

export interface GPSLocation {
  lat: number;
  lng: number;
  speed_kmh: number;
  heading: number;
  accuracy: number;
  ts: number;
}

export interface LogEntry {
  level: string;
  category: string;
  message: string;
  data?: unknown;
  ts: number;
  turnId?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
  turnId?: string;
}

export type RealtimeSessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

class BobiStore {
  // Connection state
  wsConnected = false;
  llmConnected = false;
  sessionId: string | null = null;
  realtimeStatus: RealtimeSessionStatus = 'disconnected';
  realtimeModel: string | null = null;

  // Bobi state
  state: BobiState = 'DVR_IDLE';
  awakeRemainingMs = 0;
  dialogDurationMs = 0;
  dvrRecording = true;

  // Device state
  deviceState: DeviceState = {
    volume: 50,
    brightness: 70,
    expression: 'sleepy',
    headPose: { yaw: 0, pitch: 0 },
  };

  // Mock GPS
  gpsLocation: GPSLocation = {
    lat: 39.9042,
    lng: 116.4074,
    speed_kmh: 0,
    heading: 0,
    accuracy: 10,
    ts: Date.now(),
  };

  // Conversation
  conversation: ConversationMessage[] = [];
  currentResponse = '';

  // Logs
  logs: LogEntry[] = [];
  maxLogs = 200;

  // Pending frame request
  pendingFrameRequest: {
    requestId: string;
    camera: 'front' | 'rear';
    maxWidth: number;
    quality: number;
  } | null = null;

  // Audio
  audioQueue: string[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  // ============== Actions ==============

  setWsConnected(connected: boolean): void {
    this.wsConnected = connected;
  }

  updateFromServer(payload: {
    state?: BobiState;
    llmConnected?: boolean;
    sessionId?: string;
    awakeRemainingMs?: number;
    dialogDurationMs?: number;
    dvrRecording?: boolean;
    deviceState?: DeviceState;
    realtimeStatus?: RealtimeSessionStatus;
    realtimeModel?: string;
  }): void {
    runInAction(() => {
      if (payload.state !== undefined) this.state = payload.state;
      if (payload.llmConnected !== undefined) this.llmConnected = payload.llmConnected;
      if (payload.sessionId !== undefined) this.sessionId = payload.sessionId;
      if (payload.awakeRemainingMs !== undefined) this.awakeRemainingMs = payload.awakeRemainingMs;
      if (payload.dialogDurationMs !== undefined) this.dialogDurationMs = payload.dialogDurationMs;
      if (payload.dvrRecording !== undefined) this.dvrRecording = payload.dvrRecording;
      if (payload.deviceState) this.deviceState = { ...this.deviceState, ...payload.deviceState };
      if (payload.realtimeStatus !== undefined) this.realtimeStatus = payload.realtimeStatus;
      if (payload.realtimeModel !== undefined) this.realtimeModel = payload.realtimeModel;
    });
  }

  updateDeviceState(updates: Partial<DeviceState>): void {
    runInAction(() => {
      this.deviceState = { ...this.deviceState, ...updates };
    });
  }

  addLog(entry: LogEntry): void {
    runInAction(() => {
      this.logs.push(entry);
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(-this.maxLogs);
      }
    });
  }

  clearLogs(): void {
    this.logs = [];
  }

  appendTextDelta(text: string, _turnId?: string): void {
    runInAction(() => {
      this.currentResponse += text;
    });
  }

  completeText(text: string, turnId?: string): void {
    runInAction(() => {
      this.conversation.push({
        role: 'assistant',
        content: text || this.currentResponse,
        ts: Date.now(),
        turnId,
      });
      this.currentResponse = '';
    });
  }

  addUserMessage(text: string): void {
    runInAction(() => {
      this.conversation.push({
        role: 'user',
        content: text,
        ts: Date.now(),
      });
    });
  }

  setFrameRequest(request: typeof this.pendingFrameRequest): void {
    this.pendingFrameRequest = request;
  }

  enqueueAudio(audioBase64: string): void {
    this.audioQueue.push(audioBase64);
  }

  dequeueAudio(): string | undefined {
    return this.audioQueue.shift();
  }

  updateGPS(updates: Partial<GPSLocation>): void {
    runInAction(() => {
      this.gpsLocation = { ...this.gpsLocation, ...updates, ts: Date.now() };
    });
  }

  // ============== Computed ==============

  get isAwake(): boolean {
    return this.state !== 'DVR_IDLE';
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
}

export const bobiStore = new BobiStore();
