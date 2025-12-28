/**
 * Shared Types for Bobi Local
 * Used by both core and UI
 */

// ============== State Machine ==============

export type BobiState = 
  | 'DVR_IDLE'       // Default: DVR recording, no LLM connection
  | 'AWAKE_LISTEN'   // Woken up, waiting for user input (15-30s window)
  | 'ACTIVE_DIALOG'  // In active conversation with LLM
  | 'VISION_CHECK';  // Processing vision request (transient)

// ============== Device State ==============

export type Expression = 'neutral' | 'happy' | 'curious' | 'sleepy' | 'surprised' | 'concerned';

export interface HeadPose {
  yaw: number;   // -45 to 45 degrees (left/right)
  pitch: number; // -30 to 30 degrees (up/down)
  roll: number;  // -30 to 30 degrees (tilt)
}

export interface DeviceState {
  volume: number;      // 0-100
  brightness: number;  // 0-100
  expression: Expression;
  headPose: HeadPose;
}

// ============== Sensors ==============

export interface GPSLocation {
  lat: number;
  lng: number;
  speed_kmh: number;
  heading: number;    // 0-360 degrees
  accuracy: number;   // meters
  ts: number;         // timestamp
}

export type IMUEventLevel = 'L0' | 'L1' | 'L2';

export interface IMUSummary {
  ax: number; ay: number; az: number;  // Acceleration (m/s²)
  gx: number; gy: number; gz: number;  // Gyroscope (deg/s)
  eventLevel: IMUEventLevel | null;
  ts: number;
}

// ============== Camera ==============

export type CameraType = 'front' | 'rear';

export interface CapturedFrame {
  imageDataUrl: string;  // base64 JPEG data URL
  camera: CameraType;
  ts: number;
}

// ============== Conversation ==============

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
  turnId?: string;
}

// ============== Logs ==============

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
  ts: number;
  timestamp: Date;  // For UI display
}

// ============== LLM ==============

export type RealtimeSessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ToolCall {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  result: unknown;
  error?: string;
}

// ============== Frame Request ==============

export interface FrameRequest {
  requestId: string;
  camera: CameraType;
  maxWidth: number;
  quality: number;
}
