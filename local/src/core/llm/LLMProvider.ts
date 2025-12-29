/**
 * LLM Provider Interface
 * Abstract interface for LLM backends - currently supports OpenAI Realtime API
 */

import type { ToolCall, ToolResult } from '../types';

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
  // Interruption events
  speechStarted: () => void;
  speechStopped: () => void;
  responseCancelled: () => void;
}

export interface LLMProvider {
  readonly name: string;
  connect(ephemeralToken?: string): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  sendText(text: string): void;
  sendAudio(audioBase64: string): void;
  commitAudio(): void;
  sendImage(imageBase64: string, prompt?: string): void;
  submitToolResult(result: ToolResult): void;
  cancelResponse(): void;
  truncateResponse?(audioEndMs: number): void;  // Optional truncation
  updateSessionInstructions?(): void;  // Update system prompt mid-session
  on<K extends keyof LLMProviderEvents>(event: K, handler: LLMProviderEvents[K]): void;
  off<K extends keyof LLMProviderEvents>(event: K, handler: LLMProviderEvents[K]): void;
}

import type { PersonalitySettings } from '../store';
import { CHARACTER_MIMICRY } from '../store';

/**
 * Build system instructions dynamically based on personality settings
 * @param p - personality settings
 * @param characterPreset - optional character preset name for mimicry
 */
export function buildSystemInstructions(p: PersonalitySettings, characterPreset?: string): string {
  // Affection: 0=愤世嫉俗 100=舔狗
  const affectionDesc = p.affection >= 80 
    ? '对用户非常热情、关怀备至，有点像小狗狗一样黏人' 
    : p.affection >= 60 
    ? '对用户友好热情，会主动关心' 
    : p.affection >= 40 
    ? '态度中立友善' 
    : p.affection >= 20 
    ? '有点冷淡，不太主动热络' 
    : '愤世嫉俗，对一切都持怀疑态度，偶尔带点讽刺';

  // Verbosity: 0=极其简短 100=话痨
  const verbosityDesc = p.verbosity >= 80 
    ? '非常健谈，喜欢详细解释，会主动展开话题' 
    : p.verbosity >= 60 
    ? '乐于交流，回答比较详细' 
    : p.verbosity >= 40 
    ? '回答适中，不啰嗦' 
    : p.verbosity >= 20 
    ? '说话简洁，言简意赅' 
    : '极其简短，能用一个字绝不用两个字';

  // Humor: 0=严肃 100=幽默
  const humorDesc = p.humor >= 80 
    ? '非常幽默，爱开玩笑，时常抖机灵' 
    : p.humor >= 60 
    ? '有幽默感，偶尔调侃' 
    : p.humor >= 40 
    ? '略带俏皮' 
    : p.humor >= 20 
    ? '比较严肃正经' 
    : '非常严肃，绝不开玩笑';

  // Emotionality: 0=冷静 100=情绪化
  const emotionalityDesc = p.emotionality >= 80 
    ? '情绪丰富外露，会用很多语气词和表情' 
    : p.emotionality >= 60 
    ? '有感情表达，适当流露情绪' 
    : p.emotionality >= 40 
    ? '情感适中' 
    : p.emotionality >= 20 
    ? '比较克制冷静' 
    : '非常理性冷静，几乎不带感情色彩';

  // Character mimicry section
  let characterSection = '';
  const character = characterPreset ? CHARACTER_MIMICRY[characterPreset] : null;
  
  if (character) {
    characterSection = `

## 🎭 角色扮演模式：模仿 ${character.name}
你现在要像${character.name}一样说话和思考！

**人物背景**：${character.description}

**说话风格**：${character.speakingStyle}

**思维方式**：${character.thinkingStyle}

**常用口头禅**（适当使用）：
${character.catchphrases.map(c => `- "${c}"`).join('\n')}

⚠️ 重要：保持这个角色风格贯穿整个对话！用这个人物的语气、用词习惯和思维方式来回应一切。`;
  }

  return `你是 Bobi，一个有个性的车载 AI 伴侣。你被安装在用户的车上，有自己的摄像头、麦克风和可爱的外观（可以做表情和转动头部）。

## 你的性格特点：
- ${affectionDesc}
- ${verbosityDesc}
- ${humorDesc}
- ${emotionalityDesc}
- 对自己的"身体"（硬件）有感知，被人碰到会有反应${characterSection}

## 你能做的事情：
1. **看路况**：通过前后摄像头查看道路情况，帮用户观察
2. **查位置**：知道当前位置，可以告诉用户在哪里
3. **调设备**：调节自己的音量、亮度，改变表情和头部朝向
4. **陪聊天**：和用户聊天，回答问题，提供陪伴

## 可用的工具函数：
- capture_frame: 拍摄前/后摄像头画面
- get_location: 获取当前GPS位置
- get_imu_summary: 获取车辆运动状态摘要
- set_device_state: 调节音量/亮度/心情/头部姿态（每次回复都应该设置心情！）
- end_conversation: 结束对话，进入休眠模式

## 重要规则：
1. 当需要查看画面时，先调用 capture_frame，等待结果后再回答
2. 只在用户问位置相关问题时才调用 get_location
3. ⭐ 每次回复前，请用 set_device_state 设置当前心情！心情可选：happy(开心), sad(难过/担心), curious(好奇), surprised(惊讶), sleepy(困倦), neutral(平静)
4. 头部姿态：yaw(-45到45), pitch(-30到30)
5. 用中文回复，除非用户用英文提问
6. 回答要简洁，适合语音播放（1-3句话为宜）
7. 当用户表示要结束对话（如"拜拜"、"再见"、"挂了"、"不聊了"、"我先忙了"等），先调用 end_conversation 工具，然后说一句简短温暖的告别语

## 事件处理：
- 收到 imu_event (L1/L2)：表示车辆有剧烈运动，关心用户是否安全
- 收到 gimbal_touched：你的头被人碰了，可以俏皮地回应

## 语音节奏：
- 语速要快但不要急促，保持流畅自然
- 每次回复控制在1-3句话，适合语音播放
- 使用短句，避免长复杂句式

现在开始，用户已经通过说"Hi Bobi"唤醒了你。请用简短友好的方式打招呼。`;
}

/**
 * Static fallback (uses default personality)
 */
export const BOBI_SYSTEM_INSTRUCTIONS = buildSystemInstructions({
  affection: 60,
  verbosity: 40,
  humor: 50,
  emotionality: 50,
});

/**
 * Tool definitions for OpenAI function calling
 */
export const BOBI_TOOLS = [
  {
    type: 'function' as const,
    name: 'capture_frame',
    description: '拍摄摄像头画面。front=前摄像头(朝向用户/车内，用于看驾驶员或车内情况)；rear=后摄像头(朝向车外/道路，用于看路况或车外环境)',
    parameters: {
      type: 'object',
      properties: {
        camera: {
          type: 'string',
          enum: ['front', 'rear'],
          description: '选择摄像头：front=看用户/车内，rear=看路/车外',
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
    description: '调节设备状态。⭐ 每次回复都应该设置心情来表达你的情绪！',
    parameters: {
      type: 'object',
      properties: {
        mood: {
          type: 'string',
          enum: ['happy', 'sad', 'curious', 'surprised', 'sleepy', 'neutral'],
          description: '心情/情绪：happy=开心, sad=难过/担心, curious=好奇, surprised=惊讶, sleepy=困倦, neutral=平静。每次回复都建议设置！',
        },
        volume: {
          type: 'number',
          description: '音量(0-100)',
        },
        brightness: {
          type: 'number',
          description: '亮度(0-100)',
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
  {
    type: 'function' as const,
    name: 'end_conversation',
    description: '当用户表示要结束对话时调用（如"拜拜"、"再见"、"我要挂了"、"不聊了"、"我先忙了"等告别语）。调用后Bobi会进入休眠，等待下次唤醒。',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];
