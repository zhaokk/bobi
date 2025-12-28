/**
 * OpenAI Realtime API Client
 * Implements LLMProvider interface for real-time voice conversations
 * 
 * API Reference: https://platform.openai.com/docs/guides/realtime
 * 
 * TODO: Verify event schemas against official documentation as API evolves
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { ENV } from '../config/env.js';
import type { LLMProvider, LLMProviderEvents } from './LLMProvider.js';
import { BOBI_SYSTEM_INSTRUCTIONS, BOBI_TOOLS } from './LLMProvider.js';
import type { ToolCall, ToolResult } from '../types/index.js';

// Generate unique IDs
function generateId(prefix: string = 'evt'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * OpenAI Realtime API event types
 * TODO: Update these types as the API schema is finalized
 */
interface RealtimeEvent {
  type: string;
  event_id?: string;
  [key: string]: unknown;
}

interface SessionCreatedEvent extends RealtimeEvent {
  type: 'session.created';
  session: {
    id: string;
    model: string;
    modalities: string[];
  };
}

interface ResponseTextDeltaEvent extends RealtimeEvent {
  type: 'response.text.delta';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

interface ResponseTextDoneEvent extends RealtimeEvent {
  type: 'response.text.done';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  text: string;
}

interface ResponseAudioDeltaEvent extends RealtimeEvent {
  type: 'response.audio.delta';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string; // base64 audio
}

interface ResponseAudioDoneEvent extends RealtimeEvent {
  type: 'response.audio.done';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
}

interface ResponseAudioTranscriptDeltaEvent extends RealtimeEvent {
  type: 'response.audio_transcript.delta';
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

interface ResponseFunctionCallArgumentsDoneEvent extends RealtimeEvent {
  type: 'response.function_call_arguments.done';
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
  name: string;
  arguments: string; // JSON string
}

interface InputAudioBufferSpeechStartedEvent extends RealtimeEvent {
  type: 'input_audio_buffer.speech_started';
  audio_start_ms: number;
  item_id: string;
}

interface InputAudioBufferSpeechStoppedEvent extends RealtimeEvent {
  type: 'input_audio_buffer.speech_stopped';
  audio_end_ms: number;
  item_id: string;
}

interface ConversationItemInputAudioTranscriptionCompletedEvent extends RealtimeEvent {
  type: 'conversation.item.input_audio_transcription.completed';
  item_id: string;
  content_index: number;
  transcript: string;
}

interface ErrorEvent extends RealtimeEvent {
  type: 'error';
  error: {
    type: string;
    code: string;
    message: string;
    param?: string;
  };
}

export class OpenAIRealtimeClient extends EventEmitter implements LLMProvider {
  readonly name = 'OpenAI Realtime';
  
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private currentTurnId: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private pendingToolCalls: Map<string, ToolCall> = new Map();
  private responseText: string = '';

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      logger.warn('RealtimeClient', 'Already connected');
      return;
    }

    if (!ENV.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const url = `${ENV.OPENAI_REALTIME_URL}?model=${ENV.OPENAI_REALTIME_MODEL}`;
    logger.info('RealtimeClient', `Connecting to ${url}`);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${ENV.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error('Connection timeout'));
      }, 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        logger.info('RealtimeClient', 'WebSocket connected');
        this.reconnectAttempts = 0;
        this.configureSession();
      });

      this.ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString()) as RealtimeEvent;
          this.handleEvent(event);
          
          // Resolve on session created
          if (event.type === 'session.created') {
            resolve();
          }
        } catch (err) {
          logger.error('RealtimeClient', 'Failed to parse message', err);
        }
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        logger.error('RealtimeClient', 'WebSocket error', err);
        this.emit('error', err as Error);
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        logger.info('RealtimeClient', `WebSocket closed: ${code} ${reason}`);
        this.sessionId = null;
        this.emit('disconnected');
      });
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.sessionId = null;
      logger.info('RealtimeClient', 'Disconnected');
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.sessionId !== null;
  }

  private send(event: RealtimeEvent): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('RealtimeClient', 'Cannot send - not connected');
      return;
    }

    const eventWithId = {
      ...event,
      event_id: event.event_id || generateId('evt'),
    };

    logger.debug('RealtimeClient', `>>> ${event.type}`, { event_id: eventWithId.event_id });
    this.ws.send(JSON.stringify(eventWithId));
  }

  private configureSession(): void {
    // Configure session with tools and instructions
    this.send({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: BOBI_SYSTEM_INSTRUCTIONS,
        voice: 'shimmer', // Options: alloy, ash, coral, echo, sage, shimmer, verse
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
      },
    });
  }

  private handleEvent(event: RealtimeEvent): void {
    logger.debug('RealtimeClient', `<<< ${event.type}`, { event_id: event.event_id });

    switch (event.type) {
      case 'session.created': {
        const e = event as SessionCreatedEvent;
        this.sessionId = e.session.id;
        logger.info('RealtimeClient', `Session created: ${this.sessionId}`);
        this.emit('connected', this.sessionId);
        break;
      }

      case 'session.updated':
        logger.debug('RealtimeClient', 'Session updated');
        break;

      case 'response.created':
        this.currentTurnId = generateId('turn');
        this.responseText = '';
        break;

      case 'response.text.delta': {
        const e = event as ResponseTextDeltaEvent;
        this.responseText += e.delta;
        this.emit('textDelta', e.delta, this.currentTurnId);
        break;
      }

      case 'response.text.done': {
        const e = event as ResponseTextDoneEvent;
        this.emit('textDone', e.text, this.currentTurnId);
        break;
      }

      case 'response.audio.delta': {
        const e = event as ResponseAudioDeltaEvent;
        this.emit('audioDelta', e.delta, this.currentTurnId);
        break;
      }

      case 'response.audio.done': {
        this.emit('audioDone', this.currentTurnId);
        break;
      }

      case 'response.audio_transcript.delta': {
        const e = event as ResponseAudioTranscriptDeltaEvent;
        this.responseText += e.delta;
        this.emit('textDelta', e.delta, this.currentTurnId);
        break;
      }

      case 'response.audio_transcript.done': {
        this.emit('textDone', this.responseText, this.currentTurnId);
        break;
      }

      case 'response.function_call_arguments.done': {
        const e = event as ResponseFunctionCallArgumentsDoneEvent;
        try {
          const args = JSON.parse(e.arguments);
          const toolCall: ToolCall = {
            name: e.name,
            arguments: args,
            callId: e.call_id,
          };
          this.pendingToolCalls.set(e.call_id, toolCall);
          logger.info('RealtimeClient', `Tool call: ${e.name}`, args);
          this.emit('toolCall', toolCall);
        } catch (err) {
          logger.error('RealtimeClient', 'Failed to parse tool arguments', err);
        }
        break;
      }

      case 'response.done':
        logger.debug('RealtimeClient', 'Response complete');
        break;

      case 'input_audio_buffer.speech_started':
        logger.debug('RealtimeClient', 'Speech started');
        break;

      case 'input_audio_buffer.speech_stopped':
        logger.debug('RealtimeClient', 'Speech stopped');
        break;

      case 'conversation.item.input_audio_transcription.completed': {
        const e = event as ConversationItemInputAudioTranscriptionCompletedEvent;
        logger.info('RealtimeClient', `User said: "${e.transcript}"`);
        this.emit('inputAudioTranscript', e.transcript);
        break;
      }

      case 'error': {
        const e = event as ErrorEvent;
        logger.error('RealtimeClient', `API Error: ${e.error.message}`, e.error);
        this.emit('error', new Error(e.error.message));
        break;
      }

      default:
        // Log other events at debug level
        if (event.type.startsWith('rate_limits')) {
          // Ignore rate limit events
        } else {
          logger.debug('RealtimeClient', `Unhandled event: ${event.type}`);
        }
    }
  }

  sendText(text: string): void {
    // Create a conversation item with user message
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text,
          },
        ],
      },
    });

    // Request response
    this.send({
      type: 'response.create',
    });
  }

  sendAudio(audioBase64: string): void {
    this.send({
      type: 'input_audio_buffer.append',
      audio: audioBase64,
    });
  }

  commitAudio(): void {
    this.send({
      type: 'input_audio_buffer.commit',
    });
    // With server VAD, response is auto-triggered
  }

  sendImage(imageBase64: string, prompt?: string): void {
    // Create conversation item with image
    const content: Array<{ type: string; [key: string]: unknown }> = [];
    
    if (prompt) {
      content.push({
        type: 'input_text',
        text: prompt,
      });
    }
    
    content.push({
      type: 'input_image',
      image: imageBase64, // base64 without data URL prefix
    });

    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content,
      },
    });

    // Request response
    this.send({
      type: 'response.create',
    });
  }

  submitToolResult(result: ToolResult): void {
    const toolCall = this.pendingToolCalls.get(result.callId);
    if (!toolCall) {
      logger.warn('RealtimeClient', `Unknown tool call ID: ${result.callId}`);
      return;
    }

    this.pendingToolCalls.delete(result.callId);

    // Submit the function call output
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: result.callId,
        output: JSON.stringify(result.error ? { error: result.error } : result.result),
      },
    });

    // Continue the response
    this.send({
      type: 'response.create',
    });
  }

  cancelResponse(): void {
    this.send({
      type: 'response.cancel',
    });
  }

  // EventEmitter type overrides
  on<K extends keyof LLMProviderEvents>(event: K, handler: LLMProviderEvents[K]): this {
    return super.on(event, handler as (...args: unknown[]) => void);
  }

  off<K extends keyof LLMProviderEvents>(event: K, handler: LLMProviderEvents[K]): this {
    return super.off(event, handler as (...args: unknown[]) => void);
  }
}

// Factory function
export function createLLMProvider(): LLMProvider {
  // TODO: Add support for other providers (e.g., cheaper Whisper + TTS + GPT-4o-mini)
  return new OpenAIRealtimeClient();
}
