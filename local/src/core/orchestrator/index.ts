/**
 * Bobi Orchestrator
 * Central coordinator for state machine, LLM, tools, and device control
 * 
 * In the local-first architecture, this runs entirely on the device.
 * No WebSocket communication - everything uses the shared store directly.
 */

import { bobiStore } from '../store';
import { ENV } from '../config';
import { wakewordEngine } from '../wakeword/engine';
import { dvrRecorder } from '../dvr/recorder';
import { createLLMProvider } from '../llm/OpenAIRealtimeClient';
import type { LLMProvider } from '../llm/LLMProvider';
import { executeTool } from '../tools/registry';
import type { IMUEventLevel } from '../types';

class Orchestrator {
  private llm: LLMProvider | null = null;
  private awakeTimer: ReturnType<typeof setTimeout> | null = null;
  private dialogTimer: ReturnType<typeof setTimeout> | null = null;
  private ephemeralToken: string | null = null;

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    bobiStore.log('INFO', 'Orchestrator', 'Initializing Bobi...');
    
    // Start DVR recording
    dvrRecorder.startRecording();
    
    // Start wakeword detection
    wakewordEngine.start();
    wakewordEngine.onWakeword(() => {
      bobiStore.log('INFO', 'Orchestrator', 'Wake word detected!');
      this.wake();
    });
    
    bobiStore.log('INFO', 'Orchestrator', 'Bobi initialized - DVR mode active');
  }

  /**
   * Shutdown the orchestrator
   */
  shutdown(): void {
    bobiStore.log('INFO', 'Orchestrator', 'Shutting down...');
    this.disconnectLLM();
    dvrRecorder.stopRecording();
    wakewordEngine.stop();
    this.clearTimers();
  }

  // ============== Wake / Sleep ==============

  /**
   * Wake up Bobi (triggered by wake word or UI)
   */
  async wake(): Promise<void> {
    // If already in active dialog with LLM connected, just reset timer
    if (bobiStore.state === 'ACTIVE_DIALOG' && this.llm?.isConnected()) {
      bobiStore.log('DEBUG', 'Orchestrator', 'Already in active dialog');
      this.resetAwakeTimer();
      return;
    }

    bobiStore.setState('AWAKE_LISTEN');
    bobiStore.log('INFO', 'Orchestrator', 'Bobi woke up!');

    // Connect to LLM (or reconnect if was in standby)
    await this.connectLLM();

    // Start awake timeout
    this.startAwakeTimer();

    // Trigger initial greeting after connection
    if (this.llm?.isConnected()) {
      // Wait a moment for session to be configured
      setTimeout(() => {
        if (this.llm?.isConnected()) {
          this.startDialog();
          this.llm.sendText('[系统: 用户刚刚唤醒了你，请用简短友好的方式打招呼]');
        }
      }, 500);
    }
  }

  /**
   * Return to DVR idle mode (full shutdown)
   */
  sleep(): void {
    bobiStore.setState('DVR_IDLE');
    this.disconnectLLM();
    this.clearTimers();
    bobiStore.log('INFO', 'Orchestrator', 'Bobi went to sleep (DVR mode)');
  }

  /**
   * End conversation but stay in listening mode (standby)
   * Called when user says goodbye - disconnects realtime API but keeps wake word detection active
   */
  standby(): void {
    bobiStore.setState('AWAKE_LISTEN');
    this.disconnectLLM();
    this.clearTimers();
    bobiStore.log('INFO', 'Orchestrator', 'Bobi on standby - listening for wake word');
  }

  // ============== Dialog ==============

  /**
   * Start active dialog (when user speaks)
   */
  startDialog(): void {
    if (bobiStore.state !== 'ACTIVE_DIALOG') {
      bobiStore.setState('ACTIVE_DIALOG');
      this.startDialogTimer();
    }
    this.resetAwakeTimer();
  }

  /**
   * Record user interaction (extends timeout)
   */
  recordInteraction(): void {
    bobiStore.recordInteraction();
    this.resetAwakeTimer();
  }

  // ============== LLM Connection ==============

  private async connectLLM(): Promise<void> {
    if (this.llm?.isConnected()) {
      bobiStore.log('WARN', 'Orchestrator', 'LLM already connected');
      return;
    }

    bobiStore.setRealtimeStatus('connecting');

    try {
      // Get ephemeral token from cloud service
      this.ephemeralToken = await this.fetchEphemeralToken();
      
      this.llm = createLLMProvider();
      this.setupLLMHandlers();
      await this.llm.connect(this.ephemeralToken);
      
      // Set up personality change callback for real-time updates
      bobiStore.setPersonalityChangeCallback(() => {
        this.llm?.updateSessionInstructions?.();
      });
      
      bobiStore.log('INFO', 'Orchestrator', `LLM connected: ${this.llm.name}`);
    } catch (err) {
      bobiStore.log('ERROR', 'Orchestrator', 'Failed to connect LLM', err);
      bobiStore.setRealtimeStatus('error');
    }
  }

  private disconnectLLM(): void {
    if (this.llm) {
      bobiStore.setPersonalityChangeCallback(null);  // Clear callback
      this.llm.disconnect();
      this.llm = null;
      this.ephemeralToken = null;
      bobiStore.setRealtimeStatus('disconnected');
      bobiStore.log('INFO', 'Orchestrator', 'LLM disconnected');
    }
  }

  private async fetchEphemeralToken(): Promise<string> {
    // TODO: In production, fetch from cloud service
    // For now, use environment variable for development
    const devApiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (devApiKey) {
      bobiStore.log('DEBUG', 'Orchestrator', 'Using dev API key directly');
      return devApiKey;
    }

    // Try to fetch from cloud API
    try {
      const response = await fetch(`${ENV.CLOUD_API_URL}/api/session/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'dev-device' }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get token: ${response.status}`);
      }
      
      const data = await response.json();
      return data.client_secret?.value || data.token;
    } catch (err) {
      bobiStore.log('ERROR', 'Orchestrator', 'Failed to fetch ephemeral token', err);
      throw new Error('No API key available. Set VITE_OPENAI_API_KEY in .env.local');
    }
  }

  private setupLLMHandlers(): void {
    if (!this.llm) return;

    this.llm.on('connected', (sessionId, model) => {
      bobiStore.setSessionId(sessionId);
      bobiStore.setRealtimeStatus('connected', model || this.llm?.name);
    });

    this.llm.on('disconnected', () => {
      bobiStore.setRealtimeStatus('disconnected');
    });

    this.llm.on('textDelta', (text, turnId) => {
      bobiStore.appendTextDelta(text, turnId);
    });

    this.llm.on('textDone', (text, turnId) => {
      bobiStore.completeText(text, turnId);
    });

    this.llm.on('audioDelta', (audioBase64) => {
      bobiStore.enqueueAudio(audioBase64);
    });

    this.llm.on('toolCall', async (toolCall) => {
      bobiStore.log('INFO', 'Orchestrator', `Tool call: ${toolCall.name}`, toolCall.arguments);

      // Handle end_conversation - schedule standby after response completes
      if (toolCall.name === 'end_conversation') {
        bobiStore.log('INFO', 'Orchestrator', 'User wants to end conversation');
        
        // Submit empty result so LLM can send farewell
        if (this.llm?.isConnected()) {
          this.llm.submitToolResult({ callId: toolCall.callId, result: { success: true } });
        }
        
        // Wait for farewell audio to play (give some time for LLM to respond)
        // Then go to standby - keeps listening for wake word but disconnects realtime API
        setTimeout(() => {
          bobiStore.log('INFO', 'Orchestrator', 'Ending conversation, going to standby');
          this.standby();
        }, 5000); // 5 seconds should be enough for a short goodbye
        
        return; // Don't execute as regular tool
      }

      // Enter vision check state if capturing frame
      if (toolCall.name === 'capture_frame') {
        bobiStore.setState('VISION_CHECK');
      }

      // Execute the tool
      const result = await executeTool(toolCall.name, toolCall.arguments, toolCall.callId);

      // Exit vision check
      if (toolCall.name === 'capture_frame') {
        bobiStore.setState('ACTIVE_DIALOG');
      }

      // Submit result back to LLM
      if (this.llm?.isConnected()) {
        // If it's an image result, send as image
        if (result.result && typeof result.result === 'object' && 'imageDataUrl' in result.result) {
          const imageResult = result.result as { imageDataUrl: string };
          this.llm.sendImage(imageResult.imageDataUrl, '这是摄像头拍到的画面，请描述你看到的内容。');
        } else {
          this.llm.submitToolResult(result);
        }
      }
    });

    this.llm.on('inputAudioTranscript', (text) => {
      this.startDialog();
      this.recordInteraction();
      bobiStore.addUserMessage(text);
    });

    // Handle interruption events per OpenAI Realtime API docs
    this.llm.on('speechStarted', () => {
      // User started speaking - clear audio queue for faster interruption
      bobiStore.log('DEBUG', 'Orchestrator', 'User interruption - clearing audio queue');
      bobiStore.clearAudioQueue();
    });

    this.llm.on('speechStopped', () => {
      // User stopped speaking
      bobiStore.log('DEBUG', 'Orchestrator', 'User speech ended');
    });

    this.llm.on('responseCancelled', () => {
      // Response was cancelled due to interruption
      bobiStore.log('DEBUG', 'Orchestrator', 'Response cancelled');
      bobiStore.clearAudioQueue();
    });

    this.llm.on('error', (error) => {
      bobiStore.log('ERROR', 'Orchestrator', 'LLM error', error);
    });
  }

  // ============== User Input ==============

  /**
   * Send text input to LLM
   */
  sendText(text: string): void {
    if (!text.trim()) return;

    this.startDialog();
    this.recordInteraction();
    bobiStore.addUserMessage(text);

    if (this.llm?.isConnected()) {
      this.llm.sendText(text);
    } else {
      bobiStore.log('WARN', 'Orchestrator', 'LLM not connected');
    }
  }

  /**
   * Send audio chunk to LLM
   */
  private audioChunkCount = 0;
  sendAudio(audioBase64: string): void {
    if (!this.llm?.isConnected()) {
      if (this.audioChunkCount === 0) {
        bobiStore.log('WARN', 'Orchestrator', 'Cannot send audio - LLM not connected');
      }
      return;
    }
    this.llm.sendAudio(audioBase64);
    this.audioChunkCount++;
    // Log periodically
    if (this.audioChunkCount % 200 === 0) {
      bobiStore.log('DEBUG', 'Orchestrator', `Audio chunks sent to LLM: ${this.audioChunkCount}`);
      this.recordInteraction();
    }
  }

  /**
   * Commit audio buffer
   */
  commitAudio(): void {
    if (!this.llm?.isConnected()) return;
    this.llm.commitAudio();
  }

  // ============== Events ==============

  /**
   * Handle IMU event
   */
  handleIMUEvent(level: IMUEventLevel): void {
    bobiStore.log('INFO', 'Orchestrator', `IMU event: ${level}`);

    switch (level) {
      case 'L0':
        bobiStore.updateDeviceState({ expression: 'surprised' });
        setTimeout(() => {
          bobiStore.updateDeviceState({ 
            expression: bobiStore.isAwake ? 'happy' : 'sleepy' 
          });
        }, 2000);
        break;

      case 'L1':
        bobiStore.updateDeviceState({ expression: 'concerned' });
        if (bobiStore.state === 'ACTIVE_DIALOG' && this.llm?.isConnected()) {
          this.llm.sendText('[系统事件: 检测到中等程度的车辆晃动/急刹车，请关心一下用户是否安全]');
        }
        break;

      case 'L2':
        bobiStore.updateDeviceState({ expression: 'concerned' });
        dvrRecorder.saveEventClips(`collision_${Date.now()}`);
        if (this.llm?.isConnected()) {
          this.llm.sendText('[系统事件: 检测到严重碰撞事件！请立即安抚用户，询问是否需要帮助]');
        }
        break;
    }
  }

  /**
   * Handle gimbal touched
   */
  handleGimbalTouched(): void {
    bobiStore.log('INFO', 'Orchestrator', 'Gimbal touched!');

    const currentYaw = bobiStore.deviceState.headPose.yaw;
    bobiStore.updateDeviceState({ 
      expression: 'surprised',
      headPose: { 
        yaw: currentYaw + (Math.random() > 0.5 ? 15 : -15), 
        pitch: bobiStore.deviceState.headPose.pitch,
        roll: 0
      }
    });

    setTimeout(() => {
      bobiStore.updateDeviceState({ 
        expression: bobiStore.isAwake ? 'happy' : 'neutral',
        headPose: { yaw: 0, pitch: 0, roll: 0 }
      });
    }, 1500);

    if (bobiStore.state === 'ACTIVE_DIALOG' && this.llm?.isConnected()) {
      this.llm.sendText('[系统事件: 有人碰了我的头/云台！请用俏皮的方式回应这个互动]');
    }
  }

  // ============== Timers ==============

  private startAwakeTimer(): void {
    this.clearAwakeTimer();
    this.awakeTimer = setTimeout(() => {
      if (bobiStore.state === 'AWAKE_LISTEN') {
        bobiStore.log('INFO', 'Orchestrator', 'Awake timeout - going back to sleep');
        this.sleep();
      }
    }, ENV.AWAKE_WINDOW_MS);
  }

  private resetAwakeTimer(): void {
    if (bobiStore.isAwake) {
      this.startAwakeTimer();
    }
  }

  private clearAwakeTimer(): void {
    if (this.awakeTimer) {
      clearTimeout(this.awakeTimer);
      this.awakeTimer = null;
    }
  }

  private startDialogTimer(): void {
    this.clearDialogTimer();
    this.dialogTimer = setTimeout(() => {
      bobiStore.log('INFO', 'Orchestrator', 'Dialog timeout - wrapping up');
      if (this.llm?.isConnected()) {
        this.llm.sendText('[系统: 对话时间已到3分钟上限，请礼貌地结束对话并说再见]');
      }
      setTimeout(() => this.sleep(), 5000);
    }, ENV.MAX_DIALOG_DURATION_MS);
  }

  private clearDialogTimer(): void {
    if (this.dialogTimer) {
      clearTimeout(this.dialogTimer);
      this.dialogTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearAwakeTimer();
    this.clearDialogTimer();
  }

  // ============== Trigger Wake (for UI) ==============

  triggerWake(): void {
    wakewordEngine.triggerWake();
  }
}

// Singleton instance
export const orchestrator = new Orchestrator();
