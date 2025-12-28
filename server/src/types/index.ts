/**
 * Shared Types for Bobi
 */

// ============== State Machine ==============

export type BobiState = 
  | 'DVR_IDLE'       // Default: DVR recording, no LLM connection
  | 'AWAKE_LISTEN'   // Woken up, waiting for user input (15-30s window)
  | 'ACTIVE_DIALOG'  // In active conversation with LLM
  | 'VISION_CHECK';  // Processing vision request (transient)

export interface StateContext {
  state: BobiState;
  awakeStartTime: number | null;      // Timestamp when woken up
  dialogStartTime: number | null;     // Timestamp when dialog started
  lastInteractionTime: number | null; // Last user interaction
  sessionId: string | null;           // Current LLM session ID
}

// ============== Device State ==============

export type Expression = 'neutral' | 'happy' | 'curious' | 'sleepy' | 'surprised' | 'concerned';

export interface HeadPose {
  yaw: number;   // -45 to 45 degrees (left/right)
  pitch: number; // -30 to 30 degrees (up/down)
}

export interface DeviceState {
  volume: number;      // 0-100
  brightness: number;  // 0-100
  expression: Expression;
  headPose: HeadPose;
}

// ============== GPS ==============

export interface GPSLocation {
  lat: number;
  lng: number;
  speed_kmh: number;
  heading: number;    // 0-360 degrees
  accuracy: number;   // meters
  ts: number;         // timestamp
}

// ============== IMU ==============

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

// ============== Events ==============

export type EventType =
  // Client -> Server
  | 'wake'                // Wake word detected
  | 'text_input'          // User text input
  | 'audio_chunk'         // User audio chunk (base64 PCM)
  | 'audio_commit'        // End of user speech
  | 'frame_captured'      // Camera frame captured
  | 'imu_event'           // IMU event triggered
  | 'gimbal_touched'      // Gimbal was touched/moved by user
  | 'gps_update'          // GPS location update
  // Server -> Client
  | 'state_change'        // State machine state changed
  | 'device_update'       // Device state updated (volume, expression, etc.)
  | 'llm_text_delta'      // LLM text response delta
  | 'llm_text_done'       // LLM text response complete
  | 'llm_audio_delta'     // LLM audio response delta (base64)
  | 'llm_audio_done'      // LLM audio response complete
  | 'request_frame'       // Request client to capture frame
  | 'local_feedback'      // Local feedback (expression, sound, motion)
  | 'log'                 // Debug log message
  | 'error';              // Error message

export interface BobiEvent {
  type: EventType;
  payload: unknown;
  ts: number;
  turnId?: string;
}

// ============== WebSocket Messages ==============

// Client -> Server
export interface ClientMessage {
  type: EventType;
  payload: unknown;
}

// Server -> Client
export interface ServerMessage {
  type: EventType;
  payload: unknown;
  ts: number;
  turnId?: string;
}

// ============== Tool Calls ==============

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  callId: string;
}

export interface ToolResult {
  callId: string;
  result: unknown;
  error?: string;
}
