/**
 * Bobi Configuration
 * Load from environment variables with defaults
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
config({ path: resolve(__dirname, '../../../.env') });

export const ENV = {
  // OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-mini-realtime-preview-2024-12-17',
  OPENAI_REALTIME_URL: 'wss://api.openai.com/v1/realtime',

  // Server
  SERVER_PORT: parseInt(process.env.SERVER_PORT || '3001', 10),
  WS_PORT: parseInt(process.env.WS_PORT || '3001', 10),

  // Bobi Timing
  AWAKE_WINDOW_MS: parseInt(process.env.AWAKE_WINDOW_MS || '20000', 10), // 20s
  MAX_DIALOG_DURATION_MS: parseInt(process.env.MAX_DIALOG_DURATION_MS || '180000', 10), // 3 min

  // Rate Limiting
  CAPTURE_COOLDOWN_MS: parseInt(process.env.CAPTURE_COOLDOWN_MS || '800', 10),
  CAPTURE_MAX_PER_10S: parseInt(process.env.CAPTURE_MAX_PER_10S || '3', 10),
  LOCATION_CACHE_MS: parseInt(process.env.LOCATION_CACHE_MS || '1000', 10),
  VOLUME_BRIGHTNESS_COOLDOWN_MS: parseInt(process.env.VOLUME_BRIGHTNESS_COOLDOWN_MS || '300', 10),
  VOLUME_BRIGHTNESS_MAX_DELTA: parseInt(process.env.VOLUME_BRIGHTNESS_MAX_DELTA || '15', 10),

  // DVR
  DVR_SEGMENT_DURATION_MS: parseInt(process.env.DVR_SEGMENT_DURATION_MS || '60000', 10), // 1 min
  DVR_MAX_SEGMENTS: parseInt(process.env.DVR_MAX_SEGMENTS || '60', 10), // 1 hour total

  // Debug
  DEBUG: process.env.DEBUG === 'true',
};

export function validateConfig(): void {
  if (!ENV.OPENAI_API_KEY) {
    console.warn('[Config] WARNING: OPENAI_API_KEY not set. LLM features will not work.');
  }
}
