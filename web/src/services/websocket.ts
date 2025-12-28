/**
 * WebSocket Service for Bobi WebUI
 */

import { bobiStore } from '../store/bobiStore';

type MessageHandler = (message: ServerMessage) => void;

interface ServerMessage {
  type: string;
  payload: unknown;
  ts: number;
  turnId?: string;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private handlers: Set<MessageHandler> = new Set();

  constructor() {
    // Connect to same host, different port
    const host = window.location.hostname || 'localhost';
    this.url = `ws://${host}:3001`;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    console.log(`Connecting to ${this.url}...`);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      bobiStore.setWsConnected(true);
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        this.handleMessage(message);
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      bobiStore.setWsConnected(false);
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage(message: ServerMessage): void {
    // Update store based on message type
    switch (message.type) {
      case 'state_change':
        bobiStore.updateFromServer(message.payload as Parameters<typeof bobiStore.updateFromServer>[0]);
        break;

      case 'device_update':
        bobiStore.updateDeviceState(message.payload as Parameters<typeof bobiStore.updateDeviceState>[0]);
        break;

      case 'llm_text_delta': {
        const { text, role } = message.payload as { text: string; role?: 'user' | 'assistant' };
        if (role === 'user') {
          // User speech transcription
          const cleanText = text.replace(/^\[User\]:\s*/, '');
          bobiStore.addUserMessage(cleanText);
        } else {
          bobiStore.appendTextDelta(text, message.turnId);
        }
        break;
      }

      case 'llm_text_done': {
        const { text } = message.payload as { text: string };
        bobiStore.completeText(text, message.turnId);
        break;
      }

      case 'llm_audio_delta': {
        const { audio } = message.payload as { audio: string };
        bobiStore.enqueueAudio(audio);
        break;
      }

      case 'request_frame': {
        const req = message.payload as {
          requestId: string;
          camera: 'front' | 'rear';
          maxWidth: number;
          quality: number;
        };
        bobiStore.setFrameRequest(req);
        break;
      }

      case 'local_feedback': {
        const { expression } = message.payload as { expression?: string };
        if (expression) {
          bobiStore.updateDeviceState({ expression: expression as never });
        }
        break;
      }

      case 'log': {
        bobiStore.addLog(message.payload as Parameters<typeof bobiStore.addLog>[0]);
        break;
      }

      case 'error': {
        const { message: errMsg } = message.payload as { message: string };
        console.error('Server error:', errMsg);
        bobiStore.addLog({
          level: 'ERROR',
          category: 'Server',
          message: errMsg,
          ts: message.ts,
        });
        break;
      }
    }

    // Notify handlers
    this.handlers.forEach((h) => h(message));
  }

  send(type: string, payload: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }

    this.ws.send(JSON.stringify({ type, payload }));
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // ============== Convenience Methods ==============

  wake(): void {
    this.send('wake', {});
  }

  sendText(text: string): void {
    bobiStore.addUserMessage(text);
    this.send('text_input', { text });
  }

  sendAudio(audioBase64: string): void {
    this.send('audio_chunk', { audio: audioBase64 });
  }

  commitAudio(): void {
    this.send('audio_commit', {});
  }

  sendFrame(requestId: string, camera: string, imageDataUrl: string): void {
    this.send('frame_captured', {
      requestId,
      camera,
      imageDataUrl,
      ts: Date.now(),
    });
    bobiStore.setFrameRequest(null);
  }

  sendFrameError(requestId: string, camera: string, error: string): void {
    this.send('frame_captured', {
      requestId,
      camera,
      imageDataUrl: null,
      error,
      ts: Date.now(),
    });
    bobiStore.setFrameRequest(null);
  }

  triggerIMU(level: 'L0' | 'L1' | 'L2'): void {
    this.send('imu_event', { level });
  }

  triggerGimbalTouched(): void {
    this.send('gimbal_touched', {});
  }

  updateGPS(lat: number, lng: number, speed_kmh?: number): void {
    const update = { lat, lng, speed_kmh: speed_kmh ?? 0 };
    bobiStore.updateGPS(update);
    this.send('gps_update', update);
  }
}

export const wsService = new WebSocketService();
