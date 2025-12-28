/**
 * Bobi Orchestrator
 * Central coordinator for state machine, LLM, tools, and client communication
 */

import { EventEmitter } from 'events';
import { logger, addLogListener } from '../utils/logger.js';
import { stateMachine } from '../state/StateMachine.js';
import { wakewordEngine } from '../wakeword/engine.js';
import { dvrRecorder } from '../dvr/recorder.js';
import { createLLMProvider } from '../llm/OpenAIRealtimeClient.js';
import type { LLMProvider } from '../llm/LLMProvider.js';
import { executeTool, triggerIMUEvent, updateMockLocation, setDeviceState } from '../tools/registry.js';
import type { 
  BobiState, 
  DeviceState, 
  ServerMessage, 
  CameraType, 
  CapturedFrame,
  GPSLocation,
  IMUEventLevel,
} from '../types/index.js';

export interface OrchestratorEvents {
  broadcast: (message: ServerMessage) => void;
  requestFrame: (requestId: string, camera: CameraType, maxWidth: number, quality: number) => void;
}

type FrameResolver = (frame: CapturedFrame | null) => void;

class Orchestrator extends EventEmitter {
  private llm: LLMProvider | null = null;
  private pendingFrameRequests: Map<string, FrameResolver> = new Map();
  private frameRequestId = 0;

  constructor() {
    super();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // State machine events
    stateMachine.on('stateChange', (newState: BobiState, _oldState: BobiState) => {
      this.broadcast({
        type: 'state_change',
        payload: {
          state: newState,
          awakeRemainingMs: stateMachine.getAwakeRemainingMs(),
          dialogDurationMs: stateMachine.getDialogDurationMs(),
          deviceState: stateMachine.getDeviceState(),
        },
        ts: Date.now(),
      });
    });

    stateMachine.on('deviceStateChange', (deviceState: DeviceState) => {
      this.broadcast({
        type: 'device_update',
        payload: deviceState,
        ts: Date.now(),
      });
    });

    stateMachine.on('requestLLMConnect', () => {
      this.connectLLM();
    });

    stateMachine.on('requestLLMDisconnect', () => {
      this.disconnectLLM();
    });

    stateMachine.on('dialogTimeout', () => {
      // Send a message to LLM to wrap up
      if (this.llm?.isConnected()) {
        this.llm.sendText('[System: 对话时间已到3分钟上限，请礼貌地结束对话并说再见]');
      }
      // Delay returning to DVR mode to allow LLM to respond
      setTimeout(() => {
        stateMachine.enterDVRIdle();
      }, 5000);
    });

    // Wakeword events
    wakewordEngine.onWakeword(() => {
      logger.info('Orchestrator', 'Wake word detected!');
      stateMachine.wake();
    });

    // Forward logs to clients
    addLogListener((entry) => {
      this.broadcast({
        type: 'log',
        payload: entry,
        ts: entry.ts,
      });
    });
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    logger.info('Orchestrator', 'Initializing Bobi Orchestrator');
    
    // Start DVR recording
    dvrRecorder.startRecording();
    
    // Start wakeword detection
    wakewordEngine.start();
    
    logger.info('Orchestrator', 'Orchestrator initialized - Bobi is in DVR_IDLE mode');
  }

  /**
   * Shutdown the orchestrator
   */
  shutdown(): void {
    logger.info('Orchestrator', 'Shutting down');
    this.disconnectLLM();
    dvrRecorder.stopRecording();
    wakewordEngine.stop();
  }

  // ============== LLM Connection ==============

  private async connectLLM(): Promise<void> {
    if (this.llm?.isConnected()) {
      logger.warn('Orchestrator', 'LLM already connected');
      return;
    }

    // Broadcast connecting status
    this.broadcast({
      type: 'state_change',
      payload: {
        realtimeStatus: 'connecting',
      },
      ts: Date.now(),
    });

    try {
      this.llm = createLLMProvider();
      this.setupLLMHandlers();
      await this.llm!.connect();
      logger.info('Orchestrator', `LLM connected: ${this.llm!.name}`);
    } catch (err) {
      logger.error('Orchestrator', 'Failed to connect LLM', err);
      this.broadcast({
        type: 'state_change',
        payload: {
          realtimeStatus: 'error',
        },
        ts: Date.now(),
      });
      this.broadcast({
        type: 'error',
        payload: { message: 'Failed to connect to AI service' },
        ts: Date.now(),
      });
    }
  }

  private disconnectLLM(): void {
    if (this.llm) {
      this.llm.disconnect();
      this.llm = null;
      logger.info('Orchestrator', 'LLM disconnected');
      this.broadcast({
        type: 'state_change',
        payload: {
          realtimeStatus: 'disconnected',
          realtimeModel: null,
        },
        ts: Date.now(),
      });
    }
  }

  private setupLLMHandlers(): void {
    if (!this.llm) return;

    this.llm.on('connected', (sessionId) => {
      stateMachine.setSessionId(sessionId);
      this.broadcast({
        type: 'state_change',
        payload: {
          state: stateMachine.getState(),
          llmConnected: true,
          sessionId,
          realtimeStatus: 'connected',
          realtimeModel: this.llm?.name || 'OpenAI Realtime',
        },
        ts: Date.now(),
      });
    });

    this.llm.on('disconnected', () => {
      this.broadcast({
        type: 'state_change',
        payload: {
          state: stateMachine.getState(),
          llmConnected: false,
          realtimeStatus: 'disconnected',
          realtimeModel: null,
        },
        ts: Date.now(),
      });
    });

    this.llm.on('textDelta', (text, turnId) => {
      this.broadcast({
        type: 'llm_text_delta',
        payload: { text },
        ts: Date.now(),
        turnId,
      });
    });

    this.llm.on('textDone', (text, turnId) => {
      this.broadcast({
        type: 'llm_text_done',
        payload: { text },
        ts: Date.now(),
        turnId,
      });
    });

    this.llm.on('audioDelta', (audioBase64, turnId) => {
      this.broadcast({
        type: 'llm_audio_delta',
        payload: { audio: audioBase64 },
        ts: Date.now(),
        turnId,
      });
    });

    this.llm.on('audioDone', (turnId) => {
      this.broadcast({
        type: 'llm_audio_done',
        payload: {},
        ts: Date.now(),
        turnId,
      });
    });

    this.llm.on('toolCall', async (toolCall) => {
      logger.info('Orchestrator', `Tool call received: ${toolCall.name}`, toolCall.arguments);

      // For vision tools, enter vision check state
      if (toolCall.name === 'capture_frame') {
        stateMachine.enterVisionCheck();
      }

      // Execute the tool
      const result = await executeTool(
        toolCall.name,
        toolCall.arguments,
        (camera, maxWidth, quality) => this.requestFrameFromClient(camera, maxWidth, quality)
      );

      result.callId = toolCall.callId;

      // Exit vision check if applicable
      if (toolCall.name === 'capture_frame') {
        stateMachine.exitVisionCheck();
      }

      // Submit result back to LLM
      if (this.llm?.isConnected()) {
        this.llm.submitToolResult(result);
      }
    });

    this.llm.on('inputAudioTranscript', (text) => {
      // Start dialog when user speaks
      stateMachine.startDialog();
      stateMachine.recordInteraction();
      
      this.broadcast({
        type: 'llm_text_delta',
        payload: { text: `[User]: ${text}`, role: 'user' },
        ts: Date.now(),
      });
    });

    this.llm.on('error', (error) => {
      logger.error('Orchestrator', 'LLM error', error);
      this.broadcast({
        type: 'error',
        payload: { message: error.message },
        ts: Date.now(),
      });
    });
  }

  // ============== Client Message Handling ==============

  /**
   * Handle message from WebUI client
   */
  async handleClientMessage(message: { type: string; payload: unknown }): Promise<void> {
    logger.debug('Orchestrator', `Client message: ${message.type}`, message.payload);

    switch (message.type) {
      case 'wake':
        wakewordEngine.triggerWake();
        break;

      case 'text_input': {
        const { text } = message.payload as { text: string };
        if (!text) break;
        
        stateMachine.startDialog();
        stateMachine.recordInteraction();
        
        if (this.llm?.isConnected()) {
          this.llm.sendText(text);
        } else {
          logger.warn('Orchestrator', 'LLM not connected - cannot send text');
          this.broadcast({
            type: 'error',
            payload: { message: 'AI not connected. Please say "Hi Bobi" first.' },
            ts: Date.now(),
          });
        }
        break;
      }

      case 'audio_chunk': {
        const { audio } = message.payload as { audio: string };
        if (!audio || !this.llm?.isConnected()) break;
        
        stateMachine.recordInteraction();
        this.llm.sendAudio(audio);
        break;
      }

      case 'audio_commit': {
        if (!this.llm?.isConnected()) break;
        this.llm.commitAudio();
        break;
      }

      case 'frame_captured': {
        const frame = message.payload as CapturedFrame & { requestId?: string; error?: string };
        if (frame.requestId) {
          const resolver = this.pendingFrameRequests.get(frame.requestId);
          if (resolver) {
            this.pendingFrameRequests.delete(frame.requestId);
            // If there's an error or no image data, resolve with null
            if (frame.error || !frame.imageDataUrl) {
              logger.warn('Orchestrator', `Frame capture failed: ${frame.error || 'No image data'}`);
              resolver(null);
            } else {
              resolver(frame as CapturedFrame);
            }
          }
        }
        break;
      }

      case 'imu_event': {
        const { level } = message.payload as { level: IMUEventLevel };
        this.handleIMUEvent(level);
        break;
      }

      case 'gimbal_touched': {
        this.handleGimbalTouched();
        break;
      }

      case 'gps_update': {
        const location = message.payload as Partial<GPSLocation>;
        updateMockLocation(location);
        break;
      }

      default:
        logger.warn('Orchestrator', `Unknown message type: ${message.type}`);
    }
  }

  // ============== Event Handlers ==============

  private handleIMUEvent(level: IMUEventLevel): void {
    logger.info('Orchestrator', `IMU event: ${level}`);
    triggerIMUEvent(level);

    // Local feedback based on level
    switch (level) {
      case 'L0':
        // Light - just local expression/sound
        setDeviceState({ expression: 'surprised' });
        this.broadcast({
          type: 'local_feedback',
          payload: { expression: 'surprised', sound: 'bump_light' },
          ts: Date.now(),
        });
        // Reset expression after a moment
        setTimeout(() => {
          setDeviceState({ expression: stateMachine.isAwake() ? 'happy' : 'sleepy' });
        }, 2000);
        break;

      case 'L1':
        // Medium - expression + notify LLM if in dialog
        setDeviceState({ expression: 'concerned' });
        this.broadcast({
          type: 'local_feedback',
          payload: { expression: 'concerned', sound: 'bump_medium' },
          ts: Date.now(),
        });
        
        if (stateMachine.getState() === 'ACTIVE_DIALOG' && this.llm?.isConnected()) {
          this.llm.sendText('[系统事件: 检测到中等程度的车辆晃动/急刹车，请关心一下用户是否安全]');
        }
        break;

      case 'L2':
        // Severe - potential collision
        setDeviceState({ expression: 'concerned' });
        this.broadcast({
          type: 'local_feedback',
          payload: { expression: 'concerned', sound: 'collision_warning' },
          ts: Date.now(),
        });

        // Save DVR clip
        const clipPaths = dvrRecorder.saveEventClips(`collision_${Date.now()}`);
        logger.info('Orchestrator', 'Collision clip saved', clipPaths);

        if (this.llm?.isConnected()) {
          this.llm.sendText('[系统事件: 检测到严重碰撞事件！请立即安抚用户，询问是否需要帮助，并提醒保持冷静]');
        }
        break;
    }
  }

  private handleGimbalTouched(): void {
    logger.info('Orchestrator', 'Gimbal touched!');

    // Immediate local reaction
    const currentPose = stateMachine.getDeviceState().headPose;
    
    // Wiggle motion
    setDeviceState({ 
      expression: 'surprised',
      headPose: { 
        yaw: currentPose.yaw + (Math.random() > 0.5 ? 15 : -15), 
        pitch: currentPose.pitch 
      }
    });

    this.broadcast({
      type: 'local_feedback',
      payload: { 
        expression: 'surprised', 
        sound: 'touched',
        motion: 'wiggle'
      },
      ts: Date.now(),
    });

    // Return to center after a moment
    setTimeout(() => {
      setDeviceState({ 
        expression: stateMachine.isAwake() ? 'happy' : 'neutral',
        headPose: { yaw: 0, pitch: 0 }
      });
    }, 1500);

    // If in dialog, let LLM respond
    if (stateMachine.getState() === 'ACTIVE_DIALOG' && this.llm?.isConnected()) {
      this.llm.sendText('[系统事件: 有人碰了我的头/云台！请用俏皮的方式回应这个互动]');
    }
  }

  // ============== Frame Request ==============

  private requestFrameFromClient(camera: CameraType, maxWidth: number, quality: number): Promise<CapturedFrame | null> {
    return new Promise((resolve) => {
      const requestId = `frame_${++this.frameRequestId}`;
      this.pendingFrameRequests.set(requestId, resolve);

      // Request frame from client
      this.emit('requestFrame', requestId, camera, maxWidth, quality);
      this.broadcast({
        type: 'request_frame',
        payload: { requestId, camera, maxWidth, quality },
        ts: Date.now(),
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingFrameRequests.has(requestId)) {
          this.pendingFrameRequests.delete(requestId);
          resolve(null);
        }
      }, 5000);
    });
  }

  // ============== Broadcast ==============

  private broadcast(message: ServerMessage): void {
    this.emit('broadcast', message);
  }

  // ============== Status ==============

  getStatus(): {
    state: BobiState;
    llmConnected: boolean;
    dvrRecording: boolean;
    awakeRemainingMs: number;
    dialogDurationMs: number;
    deviceState: DeviceState;
  } {
    return {
      state: stateMachine.getState(),
      llmConnected: this.llm?.isConnected() ?? false,
      dvrRecording: dvrRecorder.isRecording(),
      awakeRemainingMs: stateMachine.getAwakeRemainingMs(),
      dialogDurationMs: stateMachine.getDialogDurationMs(),
      deviceState: stateMachine.getDeviceState(),
    };
  }
}

// Singleton instance
export const orchestrator = new Orchestrator();
