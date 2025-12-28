/**
 * Tool Registry and Implementations
 * Handles all LLM function calls with rate limiting
 */

import { bobiStore } from '../store';
import { ENV } from '../config';
import { Cooldown, SlidingWindowCounter, Cache } from '../utils/rateLimiter';
import type { 
  CameraType, 
  CapturedFrame, 
  GPSLocation, 
  IMUSummary, 
  DeviceState,
  ToolResult,
  FrameRequest,
} from '../types';

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

// ============== Tool Argument Types ==============

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

// ============== Tool Implementations ==============

let frameRequestId = 0;

/**
 * Capture frame from camera
 * Uses the store's requestFrame method to get frame from UI
 */
async function captureFrame(args: CaptureFrameArgs): Promise<CapturedFrame | null> {
  const camera = args.camera || 'front';
  const maxWidth = args.maxWidth ?? 640;
  const quality = args.quality ?? 0.7;
  const limiter = captureRateLimiters[camera];

  // Check rate limits
  if (!limiter.cooldown.canAct()) {
    bobiStore.log('WARN', 'Tools', `Capture rate limited: ${limiter.cooldown.remaining()}ms remaining`);
    return null;
  }
  if (!limiter.counter.canAct()) {
    bobiStore.log('WARN', 'Tools', `Capture rate limited: max ${ENV.CAPTURE_MAX_PER_10S} per 10s`);
    return null;
  }

  // Check if awake
  if (!bobiStore.isAwake) {
    bobiStore.log('WARN', 'Tools', 'Cannot capture: Bobi is in DVR_IDLE mode');
    return null;
  }

  // Apply rate limit
  limiter.cooldown.act();
  limiter.counter.act();

  // Request frame from UI via store
  const request: FrameRequest = {
    requestId: `frame_${++frameRequestId}`,
    camera,
    maxWidth,
    quality,
  };

  bobiStore.log('INFO', 'Tools', `Requesting frame from ${camera} camera`);
  const frame = await bobiStore.requestFrame(request);

  if (!frame) {
    bobiStore.log('WARN', 'Tools', 'Frame capture failed or timed out');
    return null;
  }

  bobiStore.log('INFO', 'Tools', `Frame captured from ${camera} camera`);
  return frame;
}

/**
 * Get GPS location
 */
function getLocation(args: GetLocationArgs = {}): GPSLocation | { error: string } {
  if (!bobiStore.isAwake) {
    return { error: 'Cannot get location: Bobi is in DVR_IDLE mode' };
  }

  const freshnessMs = args.freshnessMs ?? ENV.LOCATION_CACHE_MS;
  
  // Check cache
  const cached = locationCache.get();
  if (cached && Date.now() - cached.ts < freshnessMs) {
    bobiStore.log('DEBUG', 'Tools', 'Returning cached location');
    return cached;
  }

  // Return current GPS location from store
  const location = { ...bobiStore.gpsLocation, ts: Date.now() };
  locationCache.set(location);
  
  bobiStore.log('INFO', 'Tools', 'Location retrieved', location);
  return location;
}

/**
 * Get IMU summary
 */
function getIMUSummary(_args: GetIMUSummaryArgs = {}): IMUSummary {
  // Mock IMU data - in real device, read from hardware
  const imu: IMUSummary = {
    ax: 0, ay: 0, az: 9.8,
    gx: 0, gy: 0, gz: 0,
    eventLevel: null,
    ts: Date.now(),
  };
  bobiStore.log('DEBUG', 'Tools', 'IMU summary retrieved', imu);
  return imu;
}

/**
 * Set device state (volume, brightness, expression, headPose)
 */
function setDeviceState(args: SetDeviceStateArgs): { ok: boolean; error?: string; state: DeviceState } {
  const currentState = bobiStore.deviceState;
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
      roll: Math.max(-30, Math.min(30, args.headPose.roll ?? currentState.headPose.roll ?? 0)),
    };
  }

  // Apply updates
  if (Object.keys(updates).length > 0) {
    if (args.volume !== undefined || args.brightness !== undefined) {
      deviceStateCooldown.act();
    }
    bobiStore.updateDeviceState(updates);
    bobiStore.log('INFO', 'Tools', 'Device state updated', updates);
  }

  return {
    ok: errors.length === 0,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    state: bobiStore.deviceState,
  };
}

// ============== Tool Dispatcher ==============

export async function executeTool(
  name: string, 
  args: Record<string, unknown>,
  callId: string
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'capture_frame': {
        const frameArgs: CaptureFrameArgs = {
          camera: (args.camera as CameraType) || 'front',
        };
        const frame = await captureFrame(frameArgs);
        if (!frame) {
          return { callId, result: null, error: 'Failed to capture frame' };
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
    bobiStore.log('ERROR', 'Tools', `Tool execution failed: ${name}`, err);
    return { callId, result: null, error: String(err) };
  }
}
