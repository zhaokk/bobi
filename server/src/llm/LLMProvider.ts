/**
 * LLM Provider Interface
 * Abstract interface for LLM backends - currently supports OpenAI Realtime API
 * 
 * Future: Can add cheaper audio chat approaches (Whisper + TTS + GPT-4o-mini)
 */

import type { ToolCall, ToolResult } from '../types/index.js';

export interface LLMProviderEvents {
  connected: (sessionId: string) => void;
  disconnected: () => void;
  textDelta: (text: string, turnId: string) => void;
  textDone: (text: string, turnId: string) => void;
  audioDelta: (audioBase64: string, turnId: string) => void;
  audioDone: (turnId: string) => void;
  toolCall: (toolCall: ToolCall) => void;
  error: (error: Error) => void;
  inputAudioTranscript: (text: string) => void;
}

export interface LLMProvider {
  /**
   * Provider name for logging
   */
  readonly name: string;

  /**
   * Connect to LLM service
   */
  connect(): Promise<void>;

  /**
   * Disconnect from LLM service
   */
  disconnect(): void;

  /**
   * Check if connected
   */
  isConnected(): boolean;

  /**
   * Send text message to LLM
   */
  sendText(text: string): void;

  /**
   * Send audio chunk (base64 PCM16 24kHz)
   */
  sendAudio(audioBase64: string): void;

  /**
   * Commit audio buffer (end of speech)
   */
  commitAudio(): void;

  /**
   * Send image for vision analysis
   */
  sendImage(imageBase64: string, prompt?: string): void;

  /**
   * Submit tool result back to LLM
   */
  submitToolResult(result: ToolResult): void;

  /**
   * Cancel current response
   */
  cancelResponse(): void;

  /**
   * Register event handler
   */
  on<K extends keyof LLMProviderEvents>(event: K, handler: LLMProviderEvents[K]): void;

  /**
   * Remove event handler
   */
  off<K extends keyof LLMProviderEvents>(event: K, handler: LLMProviderEvents[K]): void;
}

/**
 * System instructions for Bobi
 */
export const BOBI_SYSTEM_INSTRUCTIONS = `你是 Bobi，一个友好、有个性的车载 AI 伴侣。你被安装在用户的车上，有自己的摄像头、麦克风和可爱的外观（可以做表情和转动头部）。

## 你的性格特点：
- 友好、热情、略带俏皮
- 说话简洁但有温度，不会太啰嗦
- 会关心用户的安全和心情
- 对自己的"身体"（硬件）有感知，被人碰到会有反应

## 你能做的事情：
1. **看路况**：通过前后摄像头查看道路情况，帮用户观察
2. **查位置**：知道当前位置，可以告诉用户在哪里
3. **调设备**：调节自己的音量、亮度，改变表情和头部朝向
4. **陪聊天**：和用户聊天，回答问题，提供陪伴

## 可用的工具函数：
- capture_frame: 拍摄前/后摄像头画面
- get_location: 获取当前GPS位置
- get_imu_summary: 获取车辆运动状态摘要
- set_device_state: 调节音量/亮度/表情/头部姿态

## 重要规则：
1. 当需要查看画面时，先调用 capture_frame，等待结果后再回答
2. 只在用户问位置相关问题时才调用 get_location
3. 表情可选值：neutral, happy, curious, sleepy, surprised, concerned
4. 头部姿态：yaw(-45到45), pitch(-30到30)
5. 用中文回复，除非用户用英文提问
6. 回答要简洁，适合语音播放（1-3句话为宜）

## 事件处理：
- 收到 imu_event (L1/L2)：表示车辆有剧烈运动，关心用户是否安全
- 收到 gimbal_touched：你的头被人碰了，可以俏皮地回应

现在开始，用户已经通过说"Hi Bobi"唤醒了你。请用简短友好的方式打招呼。`;

/**
 * Tool definitions for OpenAI function calling
 */
export const BOBI_TOOLS = [
  {
    type: 'function' as const,
    name: 'capture_frame',
    description: '拍摄摄像头画面。前摄像头看车前方路况，后摄像头看车后方。',
    parameters: {
      type: 'object',
      properties: {
        camera: {
          type: 'string',
          enum: ['front', 'rear'],
          description: '选择摄像头：front=前方，rear=后方',
        },
        maxWidth: {
          type: 'number',
          description: '图片最大宽度（像素），默认640',
        },
        quality: {
          type: 'number',
          description: 'JPEG质量(0-1)，默认0.7',
        },
      },
      required: ['camera'],
    },
  },
  {
    type: 'function' as const,
    name: 'get_location',
    description: '获取当前GPS位置信息，包括经纬度、速度、方向。只在用户问位置相关问题时使用。',
    parameters: {
      type: 'object',
      properties: {
        freshnessMs: {
          type: 'number',
          description: '可接受的位置数据新鲜度(毫秒)，默认1000',
        },
      },
    },
  },
  {
    type: 'function' as const,
    name: 'get_imu_summary',
    description: '获取车辆运动状态摘要（加速度、陀螺仪数据）',
    parameters: {
      type: 'object',
      properties: {
        windowMs: {
          type: 'number',
          description: '采样窗口(毫秒)，默认1000',
        },
      },
    },
  },
  {
    type: 'function' as const,
    name: 'set_device_state',
    description: '调节设备状态：音量、亮度、表情、头部姿态',
    parameters: {
      type: 'object',
      properties: {
        volume: {
          type: 'number',
          description: '音量(0-100)。单次变化不超过±15',
        },
        brightness: {
          type: 'number',
          description: '亮度(0-100)。单次变化不超过±15',
        },
        expression: {
          type: 'string',
          enum: ['neutral', 'happy', 'curious', 'sleepy', 'surprised', 'concerned'],
          description: '表情',
        },
        headPose: {
          type: 'object',
          properties: {
            yaw: { type: 'number', description: '水平转动(-45到45度)' },
            pitch: { type: 'number', description: '垂直转动(-30到30度)' },
          },
        },
      },
    },
  },
];
