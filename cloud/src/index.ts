/**
 * Bobi Cloud Service
 * 
 * Lightweight cloud service for:
 * 1. Ephemeral token generation (OpenAI Realtime API)
 * 2. Long-term memory storage (future)
 * 3. OTA updates (future)
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env from cloud folder
dotenv.config({ path: resolve(__dirname, '../.env') });

// ============== Configuration ==============
// Single source of truth for defaults
const DEFAULT_MODEL = 'gpt-4o-mini-realtime-preview-2024-12-17';
const DEFAULT_VOICE = 'alloy';

const CONFIG = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL || DEFAULT_MODEL,
  OPENAI_REALTIME_VOICE: process.env.OPENAI_REALTIME_VOICE || DEFAULT_VOICE,
};

const app = express();
const PORT = process.env.CLOUD_PORT || 3001;

console.log(`📋 Config: model=${CONFIG.OPENAI_REALTIME_MODEL}, voice=${CONFIG.OPENAI_REALTIME_VOICE}`);

app.use(cors());
app.use(express.json());

/**
 * Health check
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bobi-cloud' });
});

/**
 * Generate ephemeral token for OpenAI Realtime API
 * 
 * The local device calls this to get a short-lived token
 * without exposing the main API key.
 */
app.post('/api/token/realtime', async (_req, res) => {
  const apiKey = CONFIG.OPENAI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'Server configuration error',
      message: 'OPENAI_API_KEY not configured' 
    });
  }

  try {
    // Request ephemeral token from OpenAI
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CONFIG.OPENAI_REALTIME_MODEL,
        voice: CONFIG.OPENAI_REALTIME_VOICE,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return res.status(response.status).json({ 
        error: 'Failed to get ephemeral token',
        details: error 
      });
    }

    const data = await response.json();
    
    // Return the ephemeral token to the client
    res.json({
      token: data.client_secret?.value,
      expiresAt: data.client_secret?.expires_at,
      model: data.model,
    });

  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Future: Long-term memory endpoints
 */
// app.post('/api/memory/save', ...)
// app.get('/api/memory/recall', ...)

/**
 * Future: User preferences sync
 */
// app.get('/api/preferences/:deviceId', ...)
// app.put('/api/preferences/:deviceId', ...)

app.listen(PORT, () => {
  console.log(`🌩️  Bobi Cloud Service running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Token:  POST http://localhost:${PORT}/api/token/realtime`);
});
