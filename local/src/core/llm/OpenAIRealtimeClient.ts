/**
 * OpenAI Realtime API Client for Browser
 * Uses native WebSocket API and connects directly from local device
 * 
 * API Reference: https://platform.openai.com/docs/guides/realtime
 */

import { bobiStore } from '../store';
import { ENV } from '../config';
import type { LLMProvider, LLMProviderEvents } from './LLMProvider';
import { BOBI_SYSTEM_INSTRUCTIONS, BOBI_TOOLS } from './LLMProvider';
import type { ToolCall, ToolResult } from '../types';

// Simple event emitter for browser
type EventHandler = (...args: unknown[]) => void;

class SimpleEventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  protected emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach(h => h(...args));
  }
}

// Generate unique IDs
function generateId(prefix: string = 'evt'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface RealtimeEvent {
  type: string;
  event_id?: string;
  [key: string]: unknown;
}

export class OpenAIRealtimeClient extends SimpleEventEmitter implements LLMProvider {
  readonly name = 'OpenAI Realtime';
  
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private currentTurnId: string = '';
  private pendingToolCalls: Map<string, ToolCall> = new Map();
  private responseText: string = '';

  async connect(ephemeralToken?: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      bobiStore.log('WARN', 'RealtimeClient', 'Already connected');
      return;
    }

    if (!ephemeralToken) {
      throw new Error('Ephemeral token required for connection');
    }

    const url = `${ENV.OPENAI_REALTIME_URL}?model=${ENV.OPENAI_REALTIME_MODEL}`;
    bobiStore.log('INFO', 'RealtimeClient', `Connecting to OpenAI Realtime API...`);

    return new Promise((resolve, reject) => {
      // Browser WebSocket with subprotocols for auth
      this.ws = new WebSocket(url, [
        'realtime',
        `openai-insecure-api-key.${ephemeralToken}`,
        'openai-beta.realtime-v1',
      ]);

      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error('Connection timeout'));
      }, 15000);

      this.ws.onopen = () => {
        bobiStore.log('INFO', 'RealtimeClient', 'WebSocket connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as RealtimeEvent;
          this.handleEvent(data);
          
          // Resolve on session created
          if (data.type === 'session.created') {
            clearTimeout(timeout);
            resolve();
          }
        } catch (err) {
          bobiStore.log('ERROR', 'RealtimeClient', 'Failed to parse message', err);
        }
      };

      this.ws.onerror = (err) => {
        clearTimeout(timeout);
        bobiStore.log('ERROR', 'RealtimeClient', 'WebSocket error', err);
        this.emit('error', new Error('WebSocket connection failed'));
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = (event) => {
        bobiStore.log('INFO', 'RealtimeClient', `WebSocket closed: ${event.code}`);
        this.sessionId = null;
        this.emit('disconnected');
      };
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.sessionId = null;
      bobiStore.log('INFO', 'RealtimeClient', 'Disconnected');
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.sessionId !== null;
  }

  private send(event: RealtimeEvent): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      bobiStore.log('WARN', 'RealtimeClient', 'Cannot send - not connected');
      return;
    }

    const eventWithId = {
      ...event,
      event_id: event.event_id || generateId('evt'),
    };

    bobiStore.log('DEBUG', 'RealtimeClient', `>>> ${event.type}`);
    this.ws.send(JSON.stringify(eventWithId));
  }

  private configureSession(): void {
    this.send({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: BOBI_SYSTEM_INSTRUCTIONS,
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 800,
        },
        tools: BOBI_TOOLS,
        tool_choice: 'auto',
      },
    });
  }

  private handleEvent(event: RealtimeEvent): void {
    bobiStore.log('DEBUG', 'RealtimeClient', `<<< ${event.type}`);

    switch (event.type) {
      case 'session.created': {
        const session = event.session as { id: string; model: string };
        this.sessionId = session.id;
        bobiStore.log('INFO', 'RealtimeClient', `Session created: ${this.sessionId}`);
        this.configureSession();
        this.emit('connected', this.sessionId);
        break;
      }

      case 'session.updated':
        bobiStore.log('DEBUG', 'RealtimeClient', 'Session updated');
        break;

      case 'response.created':
        this.currentTurnId = generateId('turn');
        this.responseText = '';
        break;

      // GA API event names
      case 'response.output_text.delta': {
        const delta = event.delta as string;
        this.responseText += delta;
        this.emit('textDelta', delta, this.currentTurnId);
        break;
      }

      case 'response.output_text.done': {
        // Don't emit textDone here - wait for response.done to avoid duplicates
        break;
      }

      case 'response.output_audio.delta': {
        const delta = event.delta as string;
        this.emit('audioDelta', delta, this.currentTurnId);
        break;
      }

      case 'response.output_audio.done': {
        this.emit('audioDone', this.currentTurnId);
        break;
      }

      case 'response.output_audio_transcript.delta': {
        const delta = event.delta as string;
        this.responseText += delta;
        this.emit('textDelta', delta, this.currentTurnId);
        break;
      }

      case 'response.output_audio_transcript.done': {
        // Don't emit textDone here - wait for response.done to avoid duplicates
        break;
      }

      // Legacy beta event names (keep for compatibility)
      case 'response.text.delta': {
        const delta = event.delta as string;
        this.responseText += delta;
        this.emit('textDelta', delta, this.currentTurnId);
        break;
      }

      case 'response.audio.delta': {
        const delta = event.delta as string;
        this.emit('audioDelta', delta, this.currentTurnId);
        break;
      }

      case 'response.audio_transcript.delta': {
        const delta = event.delta as string;
        this.responseText += delta;
        this.emit('textDelta', delta, this.currentTurnId);
        break;
      }

      case 'response.function_call_arguments.done': {
        try {
          const callId = event.call_id as string;
          const name = event.name as string;
          const args = JSON.parse(event.arguments as string);
          const toolCall: ToolCall = { name, arguments: args, callId };
          this.pendingToolCalls.set(callId, toolCall);
          bobiStore.log('INFO', 'RealtimeClient', `Tool call: ${name}`, args);
          this.emit('toolCall', toolCall);
        } catch (err) {
          bobiStore.log('ERROR', 'RealtimeClient', 'Failed to parse tool arguments', err);
        }
        break;
      }

      case 'response.done': {
        bobiStore.log('DEBUG', 'RealtimeClient', 'Response complete');
        // Always emit textDone with collected response text
        if (this.responseText) {
          this.emit('textDone', this.responseText, this.currentTurnId);
        }
        // Reset for next response
        this.responseText = '';
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = event.transcript as string;
        bobiStore.log('INFO', 'RealtimeClient', `User said: "${transcript}"`);
        this.emit('inputAudioTranscript', transcript);
        break;
      }

      // VAD events - log for debugging
      case 'input_audio_buffer.speech_started': {
        bobiStore.log('INFO', 'RealtimeClient', '🎤 Speech detected - user is speaking');
        break;
      }

      case 'input_audio_buffer.speech_stopped': {
        bobiStore.log('INFO', 'RealtimeClient', '🎤 Speech stopped - user stopped speaking');
        break;
      }

      case 'input_audio_buffer.committed': {
        bobiStore.log('DEBUG', 'RealtimeClient', 'Audio buffer committed');
        break;
      }

      case 'conversation.item.created': {
        const item = event.item as { type: string; role?: string };
        bobiStore.log('DEBUG', 'RealtimeClient', `Conversation item created: ${item.type} (${item.role || 'system'})`);
        break;
      }

      case 'rate_limits.updated': {
        // Ignore rate limit updates
        break;
      }

      case 'error': {
        const error = event.error as { message: string };
        bobiStore.log('ERROR', 'RealtimeClient', `API Error: ${error.message}`, error);
        this.emit('error', new Error(error.message));
        break;
      }

      default: {
        // Log unknown events for debugging
        if (!event.type.startsWith('response.')) {
          bobiStore.log('DEBUG', 'RealtimeClient', `Unhandled event: ${event.type}`);
        }
        break;
      }
    }
  }

  sendText(text: string): void {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    this.send({ type: 'response.create' });
  }

  sendAudio(audioBase64: string): void {
    this.send({
      type: 'input_audio_buffer.append',
      audio: audioBase64,
    });
  }

  commitAudio(): void {
    this.send({ type: 'input_audio_buffer.commit' });
  }

  sendImage(imageBase64: string, prompt?: string): void {
    const content: Array<{ type: string; [key: string]: unknown }> = [];
    
    if (prompt) {
      content.push({ type: 'input_text', text: prompt });
    }
    
    // Remove data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    content.push({ type: 'input_image', image: base64Data });

    this.send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content },
    });
    this.send({ type: 'response.create' });
  }

  submitToolResult(result: ToolResult): void {
    const toolCall = this.pendingToolCalls.get(result.callId);
    if (!toolCall) {
      bobiStore.log('WARN', 'RealtimeClient', `Unknown tool call ID: ${result.callId}`);
      return;
    }

    this.pendingToolCalls.delete(result.callId);

    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: result.callId,
        output: JSON.stringify(result.error ? { error: result.error } : result.result),
      },
    });
    this.send({ type: 'response.create' });
  }

  cancelResponse(): void {
    this.send({ type: 'response.cancel' });
  }

  // Type-safe event methods
  on<K extends keyof LLMProviderEvents>(event: K, handler: LLMProviderEvents[K]): void {
    super.on(event, handler as EventHandler);
  }

  off<K extends keyof LLMProviderEvents>(event: K, handler: LLMProviderEvents[K]): void {
    super.off(event, handler as EventHandler);
  }
}

// Factory function
export function createLLMProvider(): LLMProvider {
  return new OpenAIRealtimeClient();
}
