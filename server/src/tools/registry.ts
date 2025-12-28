/**
 * Tool Registry and Implementations
 * Handles all LLM function calls with rate limiting
 */

import { logger } from '../utils/logger.js';
import { ENV } from '../config/env.js';
import { Cooldown, SlidingWindowCounter, Cache } from '../utils/rateLimiter.js';
import { stateMachine } from '../state/StateMachine.js';
import type { 
  CameraType, 
  CapturedFrame, 
  GPSLocation, 
  IMUSummary, 
  DeviceState,
  ToolResult 
} from '../types/index.js';

// ============== Rate Limiters ==============

const captureRateLimiters = {
  front: {
    cooldown: new Cooldown(ENV.CAPTURE_COOLDOWN_MS),
    counter: new SlidingWindowCounter(ENV.CAPTURE_MAX_PER_10S, 10000),
  },
  rear: {
    cooldown: new Cooldown(ENV.CAPTURE_COOLDOWN_MS),
    counter: new SlidingWindowCounter(ENV.CAPTURE_MAX_PER_10S, 10000),
  },
};

const locationCache = new Cache<GPSLocation>(ENV.LOCATION_CACHE_MS);
const deviceStateCooldown = new Cooldown(ENV.VOLUME_BRIGHTNESS_COOLDOWN_MS);

// ============== Pending Capture Requests ==============

type CaptureCallback = (frame: CapturedFrame | null, error?: string) => void;
const pendingCaptures: Map<string, CaptureCallback> = new Map();
let captureRequestId = 0;

// ============== Mock Hardware State ==============

// Mock GPS location (can be updated by WebUI)
let mockLocation: GPSLocation = {
  lat: 39.9042,
  lng: 116.4074, // Beijing
  speed_kmh: 0,
  heading: 0,
  accuracy: 10,
  ts: Date.now(),
};

// Mock IMU state
let mockIMU: IMUSummary = {
  ax: 0, ay: 0, az: 9.8,
  gx: 0, gy: 0, gz: 0,
  eventLevel: null,
  ts: Date.now(),
};

// ============== Tool Implementations ==============

export interface CaptureFrameArgs {
  camera: CameraType;
  maxWidth?: number;
  quality?: number;
}

export interface GetLocationArgs {
  freshnessMs?: number;
}

export interface GetIMUSummaryArgs {
  windowMs?: number;
}

export interface SetDeviceStateArgs {
  volume?: number;
  brightness?: number;
  expression?: DeviceState['expression'];
  headPose?: DeviceState['headPose'];
}

/**
 * Request frame capture from WebUI
 * Returns a request ID that will be fulfilled when WebUI sends the frame
 */
export function requestFrameCapture(
  args: CaptureFrameArgs,
  callback: CaptureCallback
): { requestId: string; error?: string } {
  const camera = args.camera || 'front';
  const limiter = captureRateLimiters[camera];

  // Check rate limits
  if (!limiter.cooldown.canAct()) {
    const remaining = limiter.cooldown.remaining();
    return { 
      requestId: '', 
      error: `Rate limited: cooldown ${remaining}ms remaining` 
    };
  }

  if (!limiter.counter.canAct()) {
    return { 
      requestId: '', 
      error: `Rate limited: max ${ENV.CAPTURE_MAX_PER_10S} captures per 10s` 
    };
  }

  // Check if awake
  if (!stateMachine.canUploadData()) {
    return { 
      requestId: '', 
      error: 'Cannot capture: Bobi is in DVR_IDLE mode' 
    };
  }

  // Apply rate limit
  limiter.cooldown.act();
  limiter.counter.act();

  // Generate request ID and store callback
  const requestId = `capture_${camera}_${++captureRequestId}`;
  pendingCaptures.set(requestId, callback);

  // Set timeout to clean up stale requests
  setTimeout(() => {
    if (pendingCaptures.has(requestId)) {
      const cb = pendingCaptures.get(requestId);
      pendingCaptures.delete(requestId);
      cb?.(null, 'Capture timeout');
    }
  }, 10000);

  logger.info('Tools', `Frame capture requested: ${camera}`, { requestId, args });

  return { requestId };
}

/**
 * Called by WebSocket handler when WebUI sends captured frame
 */
export function fulfillFrameCapture(requestId: string, frame: CapturedFrame): boolean {
  const callback = pendingCaptures.get(requestId);
  if (!callback) {
    logger.warn('Tools', `No pending capture for request: ${requestId}`);
    return false;
  }

  pendingCaptures.delete(requestId);
  callback(frame);
  logger.info('Tools', `Frame capture fulfilled: ${requestId}`);
  return true;
}

/**
 * Get GPS location
 */
export function getLocation(args: GetLocationArgs = {}): GPSLocation | { error: string } {
  // Check if awake
  if (!stateMachine.canUploadData()) {
    return { error: 'Cannot get location: Bobi is in DVR_IDLE mode' };
  }

  const freshnessMs = args.freshnessMs ?? ENV.LOCATION_CACHE_MS;
  
  // Check cache
  const cached = locationCache.get();
  if (cached && Date.now() - cached.ts < freshnessMs) {
    logger.debug('Tools', 'Returning cached location');
    return cached;
  }

  // Return mock location (in real implementation, query GPS hardware)
  mockLocation.ts = Date.now();
  locationCache.set(mockLocation);
  
  logger.info('Tools', 'Location retrieved', mockLocation);
  return mockLocation;
}

/**
 * Get IMU summary
 */
export function getIMUSummary(args: GetIMUSummaryArgs = {}): IMUSummary {
  // IMU summary is available even in DVR mode (for local safety features)
  const _windowMs = args.windowMs ?? 1000;
  
  mockIMU.ts = Date.now();
  logger.debug('Tools', 'IMU summary retrieved', mockIMU);
  return mockIMU;
}

/**
 * Set device state (volume, brightness, expression, headPose)
 */
export function setDeviceState(args: SetDeviceStateArgs): { ok: boolean; error?: string; state: DeviceState } {
  const currentState = stateMachine.getDeviceState();
  const updates: Partial<DeviceState> = {};
  const errors: string[] = [];

  // Volume change with limits
  if (args.volume !== undefined) {
    if (!deviceStateCooldown.canAct() && currentState.volume !== args.volume) {
      errors.push(`Volume change rate limited`);
    } else {
      const delta = args.volume - currentState.volume;
      const clampedDelta = Math.max(-ENV.VOLUME_BRIGHTNESS_MAX_DELTA, Math.min(ENV.VOLUME_BRIGHTNESS_MAX_DELTA, delta));
      updates.volume = Math.max(0, Math.min(100, currentState.volume + clampedDelta));
      if (Math.abs(delta) > ENV.VOLUME_BRIGHTNESS_MAX_DELTA) {
        logger.warn('Tools', `Volume change clamped from ${delta} to ${clampedDelta}`);
      }
    }
  }

  // Brightness change with limits
  if (args.brightness !== undefined) {
    if (!deviceStateCooldown.canAct() && currentState.brightness !== args.brightness) {
      errors.push(`Brightness change rate limited`);
    } else {
      const delta = args.brightness - currentState.brightness;
      const clampedDelta = Math.max(-ENV.VOLUME_BRIGHTNESS_MAX_DELTA, Math.min(ENV.VOLUME_BRIGHTNESS_MAX_DELTA, delta));
      updates.brightness = Math.max(0, Math.min(100, currentState.brightness + clampedDelta));
    }
  }

  // Expression (no rate limit)
  if (args.expression !== undefined) {
    updates.expression = args.expression;
  }

  // Head pose (no rate limit, but clamp values)
  if (args.headPose !== undefined) {
    updates.headPose = {
      yaw: Math.max(-45, Math.min(45, args.headPose.yaw ?? currentState.headPose.yaw)),
      pitch: Math.max(-30, Math.min(30, args.headPose.pitch ?? currentState.headPose.pitch)),
    };
  }

  // Apply updates
  if (Object.keys(updates).length > 0) {
    if (args.volume !== undefined || args.brightness !== undefined) {
      deviceStateCooldown.act();
    }
    stateMachine.updateDeviceState(updates);
    logger.info('Tools', 'Device state updated', updates);
  }

  return {
    ok: errors.length === 0,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    state: stateMachine.getDeviceState(),
  };
}

// ============== Mock Hardware Updates ==============

/**
 * Update mock GPS location (called by WebUI)
 */
export function updateMockLocation(location: Partial<GPSLocation>): void {
  mockLocation = {
    ...mockLocation,
    ...location,
    ts: Date.now(),
  };
  locationCache.invalidate();
  logger.debug('Tools', 'Mock location updated', mockLocation);
}

/**
 * Update mock IMU state (called by WebUI)
 */
export function updateMockIMU(imu: Partial<IMUSummary>): void {
  mockIMU = {
    ...mockIMU,
    ...imu,
    ts: Date.now(),
  };
  logger.debug('Tools', 'Mock IMU updated', mockIMU);
}

/**
 * Trigger IMU event (L0/L1/L2)
 */
export function triggerIMUEvent(level: IMUSummary['eventLevel']): void {
  mockIMU.eventLevel = level;
  mockIMU.ts = Date.now();
  logger.info('Tools', `IMU event triggered: ${level}`);
}

// ============== Tool Dispatcher ==============

export async function executeTool(
  name: string, 
  args: Record<string, unknown>,
  requestFrameFromClient: (camera: CameraType, maxWidth: number, quality: number) => Promise<CapturedFrame | null>
): Promise<ToolResult> {
  const callId = `tool_${Date.now()}`;
  
  try {
    switch (name) {
      case 'capture_frame': {
        const captureArgs = args as unknown as CaptureFrameArgs;
        const camera = captureArgs.camera || 'front';
        const maxWidth = captureArgs.maxWidth ?? 640;
        const quality = captureArgs.quality ?? 0.7;

        // Check rate limits first
        const limiter = captureRateLimiters[camera];
        if (!limiter.cooldown.canAct()) {
          return {
            callId,
            result: null,
            error: `Rate limited: cooldown ${limiter.cooldown.remaining()}ms remaining`,
          };
        }
        if (!limiter.counter.canAct()) {
          return {
            callId,
            result: null,
            error: `Rate limited: max ${ENV.CAPTURE_MAX_PER_10S} captures per 10s`,
          };
        }
        if (!stateMachine.canUploadData()) {
          return {
            callId,
            result: null,
            error: 'Cannot capture: Bobi is in DVR_IDLE mode',
          };
        }

        // Apply rate limit
        limiter.cooldown.act();
        limiter.counter.act();

        // Request frame from client
        const frame = await requestFrameFromClient(camera, maxWidth, quality);
        if (!frame) {
          return {
            callId,
            result: null,
            error: 'Failed to capture frame',
          };
        }

        return {
          callId,
          result: {
            imageDataUrl: frame.imageDataUrl,
            camera: frame.camera,
            ts: frame.ts,
          },
        };
      }

      case 'get_location': {
        const result = getLocation(args as GetLocationArgs);
        if ('error' in result) {
          return { callId, result: null, error: result.error };
        }
        return { callId, result };
      }

      case 'get_imu_summary': {
        const result = getIMUSummary(args as GetIMUSummaryArgs);
        return { callId, result };
      }

      case 'set_device_state': {
        const result = setDeviceState(args as SetDeviceStateArgs);
        return { callId, result };
      }

      default:
        return { callId, result: null, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    logger.error('Tools', `Tool execution failed: ${name}`, err);
    return { callId, result: null, error: String(err) };
  }
}
