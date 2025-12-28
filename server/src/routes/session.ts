/**
 * Session Route
 * Creates ephemeral tokens or handles SDP for WebRTC connections
 * 
 * Based on OpenAI Realtime WebRTC documentation:
 * https://platform.openai.com/docs/guides/realtime-webrtc
 */

import express from 'express';
import { ENV } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { BOBI_SYSTEM_INSTRUCTIONS, BOBI_TOOLS } from '../llm/LLMProvider.js';

const router = express.Router();

/**
 * POST /session
 * Unified interface: receives SDP offer, returns SDP answer
 * Uses the /v1/realtime endpoint with model query parameter
 */
router.post('/session', express.text({ type: ['application/sdp', 'text/plain'] }), async (req, res) => {
  try {
    const sdpOffer = req.body;
    
    if (!sdpOffer || typeof sdpOffer !== 'string') {
      return res.status(400).json({ error: 'SDP offer required' });
    }

    logger.info('Session', 'Creating WebRTC session with ephemeral token approach');

    // First, get an ephemeral token
    const tokenResponse = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENV.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ENV.OPENAI_REALTIME_MODEL,
        voice: 'shimmer',
        instructions: BOBI_SYSTEM_INSTRUCTIONS,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: BOBI_TOOLS,
        tool_choice: 'auto',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error('Session', `Failed to get ephemeral token: ${tokenResponse.status}`, errorText);
      return res.status(tokenResponse.status).json({ error: errorText });
    }

    const tokenData = await tokenResponse.json() as { client_secret?: { value: string } };
    const ephemeralKey = tokenData.client_secret?.value;

    if (!ephemeralKey) {
      logger.error('Session', 'No ephemeral key in response', tokenData);
      return res.status(500).json({ error: 'No ephemeral key in response' });
    }

    logger.info('Session', 'Got ephemeral token, connecting to OpenAI WebRTC');

    // Now use the ephemeral key to connect via WebRTC
    const baseUrl = 'https://api.openai.com/v1/realtime';
    const model = ENV.OPENAI_REALTIME_MODEL;
    
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
      body: sdpOffer,
    });

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text();
      logger.error('Session', `OpenAI WebRTC error: ${sdpResponse.status}`, errorText);
      return res.status(sdpResponse.status).json({ error: errorText });
    }

    const sdpAnswer = await sdpResponse.text();
    logger.info('Session', 'WebRTC session created successfully');
    
    res.type('application/sdp').send(sdpAnswer);
  } catch (error) {
    logger.error('Session', 'Failed to create session', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * GET /token
 * Ephemeral token interface: returns a short-lived API key for client-side use
 */
router.get('/token', async (req, res) => {
  try {
    logger.info('Session', 'Creating ephemeral token');

    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENV.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ENV.OPENAI_REALTIME_MODEL,
        voice: 'shimmer',
        instructions: BOBI_SYSTEM_INSTRUCTIONS,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: BOBI_TOOLS,
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Session', `OpenAI API error: ${response.status}`, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    logger.info('Session', 'Ephemeral token created successfully');
    
    res.json(data);
  } catch (error) {
    logger.error('Session', 'Failed to create token', error);
    res.status(500).json({ error: 'Failed to create token' });
  }
});

export default router;
