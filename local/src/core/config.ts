/**
 * Bobi Configuration
 * 
 * For browser environment, we use import.meta.env (Vite)
 * 
 * Configuration priority:
 * 1. VITE_* env variables from .env.local (browser/local)
 * 2. Root .env file (for server/cloud)
 * 
 * Key variables:
 * - VITE_OPENAI_API_KEY: API key for direct connection
 * - VITE_OPENAI_MODEL: Realtime model name (e.g., 'gpt-4o-mini-realtime-preview-2024-12-17')
 * - VITE_OPENAI_VOICE: Default voice (overridden by personality presets)
 */

// Default model - single source of truth
const DEFAULT_MODEL = 'gpt-realtime-mini';
const DEFAULT_VOICE = 'alloy';

export const ENV = {
  // Cloud API (for getting ephemeral tokens)
  CLOUD_API_URL: import.meta.env.VITE_CLOUD_URL || 'http://localhost:3001',
  
  // OpenAI Realtime (connected directly from local)
  OPENAI_REALTIME_MODEL: import.meta.env.VITE_OPENAI_MODEL || DEFAULT_MODEL,
  OPENAI_REALTIME_VOICE: import.meta.env.VITE_OPENAI_VOICE || DEFAULT_VOICE,
  OPENAI_REALTIME_URL: 'wss://api.openai.com/v1/realtime',

  // Bobi Timing
  AWAKE_WINDOW_MS: 20000,        // 20s
  MAX_DIALOG_DURATION_MS: 180000, // 3 min

  // Rate Limiting
  CAPTURE_COOLDOWN_MS: 800,
  CAPTURE_MAX_PER_10S: 3,
  LOCATION_CACHE_MS: 1000,
  VOLUME_BRIGHTNESS_COOLDOWN_MS: 300,
  VOLUME_BRIGHTNESS_MAX_DELTA: 30,

  // DVR
  DVR_SEGMENT_DURATION_MS: 60000, // 1 min
  DVR_MAX_SEGMENTS: 60,           // 1 hour total

  // Debug
  DEBUG: import.meta.env.DEV,
};
