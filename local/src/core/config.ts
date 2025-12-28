/**
 * Bobi Configuration
 * For browser environment, we use import.meta.env (Vite)
 * For API keys, we'll fetch ephemeral token from cloud service
 */

export const ENV = {
  // Cloud API (for getting ephemeral tokens)
  CLOUD_API_URL: import.meta.env.VITE_CLOUD_API_URL || 'http://localhost:3002',
  
  // OpenAI Realtime (connected directly from local)
  OPENAI_REALTIME_MODEL: import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini-realtime-preview-2024-12-17',
  OPENAI_REALTIME_URL: 'wss://api.openai.com/v1/realtime',

  // Bobi Timing
  AWAKE_WINDOW_MS: 20000,        // 20s
  MAX_DIALOG_DURATION_MS: 180000, // 3 min

  // Rate Limiting
  CAPTURE_COOLDOWN_MS: 800,
  CAPTURE_MAX_PER_10S: 3,
  LOCATION_CACHE_MS: 1000,
  VOLUME_BRIGHTNESS_COOLDOWN_MS: 300,
  VOLUME_BRIGHTNESS_MAX_DELTA: 15,

  // DVR
  DVR_SEGMENT_DURATION_MS: 60000, // 1 min
  DVR_MAX_SEGMENTS: 60,           // 1 hour total

  // Debug
  DEBUG: import.meta.env.DEV,
};
