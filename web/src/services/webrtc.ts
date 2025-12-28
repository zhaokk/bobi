/**
 * WebRTC Service for Bobi
 * Direct connection to OpenAI Realtime API using WebRTC
 * 
 * Based on OpenAI official documentation:
 * https://platform.openai.com/docs/guides/realtime-webrtc
 */

import { bobiStore } from '../store/bobiStore';

type DataChannelMessage = {
  type: string;
  [key: string]: unknown;
};

class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private localStream: MediaStream | null = null;

  private serverUrl = `http://${window.location.hostname || 'localhost'}:3001`;

  async connect(): Promise<void> {
    if (this.pc) {
      console.log('WebRTC already connected');
      return;
    }

    console.log('🔌 Starting WebRTC connection...');

    try {
      // Create peer connection
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      // Set up audio element for playback
      this.audioElement = document.createElement('audio');
      this.audioElement.autoplay = true;
      
      this.pc.ontrack = (e) => {
        console.log('🔊 Received audio track from OpenAI');
        if (this.audioElement) {
          this.audioElement.srcObject = e.streams[0];
        }
      };

      // Add local audio track (microphone)
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });
      
      this.localStream.getTracks().forEach((track) => {
        this.pc!.addTrack(track, this.localStream!);
      });
      console.log('🎤 Microphone connected');

      // Set up data channel for events
      this.dc = this.pc.createDataChannel('oai-events');
      
      this.dc.onopen = () => {
        console.log('📡 Data channel opened');
        bobiStore.updateFromServer({ llmConnected: true });
      };

      this.dc.onclose = () => {
        console.log('📡 Data channel closed');
        bobiStore.updateFromServer({ llmConnected: false });
      };

      this.dc.onmessage = (e) => {
        this.handleServerEvent(JSON.parse(e.data));
      };

      // Create and send offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await this.waitForIceGathering();

      // Send SDP to server, get answer
      console.log('📤 Sending SDP offer to server...');
      const response = await fetch(`${this.serverUrl}/api/session`, {
        method: 'POST',
        body: this.pc.localDescription?.sdp,
        headers: {
          'Content-Type': 'application/sdp',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const answerSdp = await response.text();
      console.log('📥 Received SDP answer from server');

      // Set remote description
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      console.log('✅ WebRTC connection established!');
      bobiStore.setWsConnected(true);

    } catch (error) {
      console.error('❌ WebRTC connection failed:', error);
      this.disconnect();
      throw error;
    }
  }

  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (this.pc?.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (this.pc?.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };

      this.pc?.addEventListener('icegatheringstatechange', checkState);

      // Timeout after 5 seconds
      setTimeout(() => {
        this.pc?.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }, 5000);
    });
  }

  disconnect(): void {
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    if (this.audioElement) {
      this.audioElement.srcObject = null;
      this.audioElement = null;
    }

    bobiStore.setWsConnected(false);
    bobiStore.updateFromServer({ llmConnected: false });
    console.log('🔌 WebRTC disconnected');
  }

  private handleServerEvent(event: DataChannelMessage): void {
    const eventType = event.type as string;
    
    // Log all events (simplified)
    if (!eventType.includes('audio')) {
      console.log('📨 Event:', eventType, event);
    }

    switch (eventType) {
      case 'session.created':
        console.log('✅ Session created:', event.session);
        bobiStore.updateFromServer({ 
          sessionId: (event.session as { id: string })?.id,
          llmConnected: true,
        });
        break;

      case 'session.updated':
        console.log('📝 Session updated');
        break;

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = (event as { transcript?: string }).transcript;
        if (transcript) {
          console.log('🗣️ User said:', transcript);
          bobiStore.addUserMessage(transcript);
        }
        break;
      }

      case 'response.audio_transcript.delta': {
        const delta = (event as { delta?: string }).delta;
        if (delta) {
          bobiStore.appendTextDelta(delta);
        }
        break;
      }

      case 'response.audio_transcript.done': {
        const transcript = (event as { transcript?: string }).transcript;
        if (transcript) {
          bobiStore.completeText(transcript);
        }
        break;
      }

      case 'response.function_call_arguments.done': {
        const funcEvent = event as unknown as {
          name: string;
          arguments: string;
          call_id: string;
        };
        const { name, arguments: args, call_id } = funcEvent;
        console.log('🔧 Tool call:', name, args);
        this.handleToolCall(name, args, call_id);
        break;
      }

      case 'input_audio_buffer.speech_started':
        console.log('🎤 Speech started');
        bobiStore.updateFromServer({ state: 'ACTIVE_DIALOG' });
        break;

      case 'input_audio_buffer.speech_stopped':
        console.log('🎤 Speech stopped');
        break;

      case 'response.done':
        console.log('✅ Response complete');
        break;

      case 'error': {
        const error = (event as { error?: { message: string } }).error;
        console.error('❌ Error:', error?.message);
        bobiStore.addLog({
          level: 'ERROR',
          category: 'WebRTC',
          message: error?.message || 'Unknown error',
          ts: Date.now(),
        });
        break;
      }
    }
  }

  private async handleToolCall(name: string, argsJson: string, callId: string): Promise<void> {
    try {
      const args = JSON.parse(argsJson);
      let result: unknown = { success: true };

      switch (name) {
        case 'get_location':
          result = {
            lat: bobiStore.gpsLocation.lat,
            lng: bobiStore.gpsLocation.lng,
            speed_kmh: bobiStore.gpsLocation.speed_kmh,
            heading: bobiStore.gpsLocation.heading,
            ts: Date.now(),
          };
          break;

        case 'set_device_state':
          if (args.volume !== undefined) {
            bobiStore.updateDeviceState({ volume: args.volume });
          }
          if (args.brightness !== undefined) {
            bobiStore.updateDeviceState({ brightness: args.brightness });
          }
          if (args.expression !== undefined) {
            bobiStore.updateDeviceState({ expression: args.expression });
          }
          result = { success: true, newState: bobiStore.deviceState };
          break;

        case 'get_imu_summary':
          result = {
            recentEvents: [],
            summary: 'No significant events in the last minute',
          };
          break;

        case 'capture_frame':
          // For now, just return a placeholder
          result = {
            camera: args.camera || 'front',
            description: 'Camera capture not implemented in WebRTC mode',
          };
          break;

        default:
          result = { error: `Unknown tool: ${name}` };
      }

      // Send tool result back
      this.sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify(result),
        },
      });

      // Trigger response
      this.sendEvent({ type: 'response.create' });

    } catch (error) {
      console.error('Tool call error:', error);
    }
  }

  sendEvent(event: DataChannelMessage): void {
    if (!this.dc || this.dc.readyState !== 'open') {
      console.warn('Data channel not open');
      return;
    }

    this.dc.send(JSON.stringify(event));
  }

  sendText(text: string): void {
    this.sendEvent({
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
    this.sendEvent({ type: 'response.create' });
  }

  isConnected(): boolean {
    return this.pc?.connectionState === 'connected' && this.dc?.readyState === 'open';
  }
}

export const webrtcService = new WebRTCService();
