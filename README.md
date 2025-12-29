# Bobi - 车载 AI 伴侣 MVP

🚗 一个具备行车记录仪功能的车载 AI 伴侣系统。默认作为 DVR 运行，唤醒后进入 AI 对话模式。

## 🌟 特性

- **DVR 模式**：默认本地循环录制（前/后摄像头）
- **唤醒词**：说 "Hi Bobi" 进入 AI 对话模式（Web Speech API + 模糊匹配）
- **实时语音对话**：基于 OpenAI Realtime API 的低延迟语音对话
- **视觉能力**：支持摄像头抓帧，可以"看"路况（前/后摄像头）
- **位置感知**：GPS 定位（仅在需要时获取）
- **3D 头像**：可爱的 3D 头部 + 2D 表情系统，支持鼠标拖拽互动
- **心情系统**：6 种心情 × 3 种表情变体 + 随机头部姿态
- **性格定制**：可调节的性格参数和角色预设

## 🎭 心情与表情

Bobi 拥有完整的情感表达系统：

| 心情 | 触发场景 | 表情特征 |
|------|----------|----------|
| 😊 happy | 开心聊天、被夸奖 | 弯眼微笑、腮红 |
| 😢 sad | 听到坏消息 | 下垂眼角、撇嘴 |
| 🤔 curious | 收到提问、看到新事物 | 歪头、微张嘴 |
| 😮 surprised | 突发事件、被拨弄 | 圆眼、O嘴 |
| 😴 sleepy | DVR 空闲模式 | 眯眼、平嘴 |
| 😐 neutral | 普通对话 | 正常表情 |

每种心情有 3 种随机表情变体和 3 种头部姿态，由 LLM 设置心情后自动随机选择。

## 🏗️ 架构 (v0.2 Local-First)

```
┌─────────────────────────────────────────────────────┐
│  local/  (设备端 - Core + UI 共享内存)               │
│  ├── src/core/     状态机、LLM、DVR、工具            │
│  └── src/ui/       React UI + Three.js 3D头像       │
│                                                     │
│  ↓ 直接引用 bobiStore (无网络延迟)                   │
│                                                     │
│  [OpenAI Realtime API] ←── 浏览器直连 WebSocket      │
└─────────────────────────────────────────────────────┘
         │
         │ HTTPS (仅获取 ephemeral token)
         ↓
┌─────────────────────────────────────────────────────┐
│  cloud/  (云服务 - 轻量级)                           │
│  └── Token 签发、长期记忆存储 (future)               │
└─────────────────────────────────────────────────────┘
```

**为什么选择 Local-First?**
- ⚡ 更低延迟：浏览器直连 OpenAI Realtime API
- 🔒 更好隐私：敏感数据不经过中间服务器
- 💾 共享内存：Core 和 UI 共用 MobX store，无序列化开销

## 📦 项目结构

```
bobi/
├── package.json              # npm 工作区根配置
├── tsconfig.base.json        # TypeScript 基础配置
├── local/                    # 🖥️ 设备端 (Core + UI)
│   ├── src/
│   │   ├── main.tsx          # 入口
│   │   ├── core/             # 核心模块
│   │   │   ├── index.ts      # 核心导出
│   │   │   ├── config.ts     # 配置常量
│   │   │   ├── store.ts      # MobX 共享状态
│   │   │   ├── types.ts      # 类型定义
│   │   │   ├── orchestrator/ # 状态协调器
│   │   │   ├── llm/          # OpenAI Realtime
│   │   │   │   ├── LLMProvider.ts          # 会话配置
│   │   │   │   └── OpenAIRealtimeClient.ts # WebSocket客户端
│   │   │   ├── dvr/          # DVR 录制
│   │   │   │   └── recorder.ts
│   │   │   ├── wakeword/     # 唤醒词检测
│   │   │   │   └── engine.ts # Web Speech API
│   │   │   ├── tools/        # LLM 工具函数
│   │   │   │   └── registry.ts
│   │   │   ├── presets/      # 性格预设
│   │   │   │   └── personality.ts
│   │   │   └── utils/        # 工具函数
│   │   │       └── rateLimiter.ts
│   │   └── ui/               # React 组件
│   │       ├── App.tsx       # 主应用
│   │       ├── App.css       # 样式
│   │       └── components/
│   │           ├── BobiAvatar.tsx      # 3D头像 (Three.js)
│   │           ├── CameraPanel.tsx     # 摄像头面板
│   │           ├── ControlPanel.tsx    # 控制面板
│   │           ├── ConversationPanel.tsx # 对话面板
│   │           ├── LogPanel.tsx        # 日志面板
│   │           ├── PersonalityPanel.tsx # 性格设置
│   │           └── StatePanel.tsx      # 状态面板
│   │       └── hooks/
│   │           ├── useAudioInput.ts    # 麦克风输入
│   │           ├── useAudioPlayback.ts # 音频播放
│   │           └── useMicrophoneLevel.ts
│   └── package.json
├── cloud/                    # ☁️ 云服务
│   ├── src/
│   │   └── index.ts          # Token 签发等
│   └── package.json
└── logs/                     # 日志目录
```

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 9+
- 支持 WebRTC 的现代浏览器（Chrome/Edge/Firefox）

### 安装

```bash
# 克隆仓库
git clone <repo-url>
cd bobi

# 安装依赖
npm install
```

### 配置

```bash
# Local: 在 local/src/core/config.ts 配置 API Key
# 或设置环境变量 VITE_OPENAI_API_KEY

# Cloud: 配置 API key
cp cloud/.env.example cloud/.env
# 编辑 cloud/.env，填入 OPENAI_API_KEY
```

### 运行

```bash
# 运行设备端 (推荐)
npm run dev

# 或同时运行设备端和云服务
npm run dev:all

# 只运行云服务
npm run dev:cloud
```

- 前端 WebUI: `http://localhost:5173`

**⚠️ 重要**：必须使用 `localhost` 或 HTTPS 访问，否则浏览器不允许访问摄像头/麦克风。

## 🎮 互动方式

### 唤醒 Bobi
- 点击 **"Wake: Hi Bobi"** 按钮
- 或对着麦克风说 "Hi Bobi"（需要启动麦克风）

### 与 Bobi 对话
- 语音：直接说话（麦克风自动检测）
- 文字：在文本框输入消息

### 拨弄 Bobi
- 鼠标拖拽 3D 头像可以转动头部
- 松开后 2 秒自动恢复到心情姿态

### 调节设备状态
- 对 Bobi 说："把音量调大一点" / "亮度调低"
- 或在控制面板手动调节

## 🎯 验证场景

### A) 未唤醒状态 - DVR 录制

1. 启动应用后，状态应显示 `DVR_IDLE`
2. LLM 连接应显示"断开"
3. DVR 录制应显示"录制中"
4. 表情显示 😴 sleepy

### B) 唤醒 Bobi

1. 点击 **"Wake: Hi Bobi"** 按钮
2. 状态变为 `AWAKE_LISTEN`
3. LLM 连接变为"已连接"
4. 表情变为 🤔 curious，头部歪向一边
5. 唤醒倒计时开始（默认 20 秒）

### C) 简单问答

1. 确保已唤醒
2. 发送：`太阳从哪边升起？`
3. 观察 Bobi 的心情变化和语音回复
4. 等待超时自动回到 DVR_IDLE

### D) 视觉请求

1. 唤醒 Bobi 并启动摄像头
2. 发送：`后面有没有车？` 或 `前面路况怎么样？`
3. 观察：
   - 摄像头面板显示"正在请求帧..."
   - 表情变为 🤔 curious
   - LLM 基于图像给出回答

### E) 多意图请求

1. 发送：`看看前面路况，同时把音量调小点，我现在在哪？`
2. 观察：
   - 触发 `capture_frame(front)`
   - 触发 `set_device_state(volume, mood)`
   - 触发 `get_location()`
   - 音量数值减小
   - LLM 综合回答所有问题

### F) 拨弄 Bobi

1. 用鼠标拖拽 3D 头像
2. 观察头部跟随旋转
3. 松开后等待 2 秒，头部恢复到心情姿态

## ⚙️ 配置项

在 `local/src/core/config.ts` 中配置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OPENAI_API_KEY` | - | OpenAI API 密钥（必需） |
| `AWAKE_WINDOW_MS` | 20000 | 唤醒窗口时长（毫秒） |
| `MAX_DIALOG_DURATION_MS` | 180000 | 最大对话时长（毫秒） |
| `CAPTURE_COOLDOWN_MS` | 800 | 抓帧冷却时间（毫秒） |
| `CAPTURE_MAX_PER_10S` | 3 | 10秒内最大抓帧次数 |

## 🔧 技术栈

### 前端
- **React 18** + TypeScript
- **MobX** - 状态管理
- **Three.js** + React Three Fiber - 3D 头像渲染
- **Vite** - 构建工具

### 核心
- **OpenAI Realtime API** - 实时语音对话
- **Web Speech API** - 唤醒词检测
- **MediaDevices API** - 摄像头/麦克风

### 状态机

```
DVR_IDLE ─── wake ───> AWAKE_LISTEN
    ^                       │
    │                       │ user input
    │                       v
    └─── timeout ─── ACTIVE_DIALOG ←─┐
                           │         │
                           │ vision  │
                           v         │
                     VISION_CHECK ───┘
```

### LLM 工具函数

| 工具 | 说明 | 参数 |
|------|------|------|
| `capture_frame` | 抓取摄像头画面 | camera: front/rear |
| `get_location` | 获取 GPS 位置 | - |
| `set_device_state` | 调节设备状态 | volume, brightness, mood |

### 心情系统

LLM 通过 `set_device_state` 工具设置心情，代码自动：
1. 从该心情的 3 种表情变体中随机选择一个
2. 从该心情的 3 种头部姿态中随机选择一个
3. 平滑动画过渡到新表情和姿态

## 🛠️ 开发说明

### 核心模块

| 模块 | 文件 | 说明 |
|------|------|------|
| 状态管理 | `store.ts` | MobX store，共享 Core 和 UI |
| LLM 配置 | `LLMProvider.ts` | 系统提示词、工具定义、性格设置 |
| WebSocket | `OpenAIRealtimeClient.ts` | OpenAI Realtime API 连接 |
| 工具注册 | `registry.ts` | capture_frame, get_location 等实现 |
| 唤醒词 | `engine.ts` | Web Speech API + 模糊匹配 |
| 性格预设 | `personality.ts` | 可调节的性格参数 |

### UI 组件

| 组件 | 说明 |
|------|------|
| `BobiAvatar` | 3D 球形头部 + 2D SVG 表情，支持拖拽 |
| `CameraPanel` | 摄像头预览、抓帧历史 |
| `ConversationPanel` | 对话历史显示 |
| `ControlPanel` | 唤醒按钮、状态控制 |
| `PersonalityPanel` | 性格参数调节 |
| `StatePanel` | 状态信息、设备状态 JSON |
| `LogPanel` | 日志显示（可过滤级别） |

## 📝 与 Nomi 的区别

| 特性 | Bobi | Nomi |
|------|------|------|
| 行车记录仪 | ✅ 内置 DVR | ❌ 无 |
| 硬件集成 | ✅ 一体化设计 | ❌ 共享车载硬件 |
| 摄像头 | ✅ 独立前/后摄像头 | ❌ 使用车载摄像头 |
| 3D 头像 | ✅ Three.js 渲染 | ✅ 实体头部 |
| 触摸互动 | ✅ 鼠标拖拽旋转 | ✅ 物理触摸 |
| 离线能力 | ✅ DVR 纯本地运行 | - |

## � TODO

### 高优先级
- [ ] 语音唤醒后的指令保留执行（hi bobi 之后的指令不丢失）
- [ ] 真实硬件 DVR 录制对接（V4L2/GStreamer）
- [ ] 离线唤醒词引擎集成（Porcupine/Snowboy）

### 中优先级
- [ ] GPS 模块对接（真实 GPS 芯片）
- [ ] IMU 传感器对接（碰撞检测、急刹检测）
- [ ] 云台电机控制（物理头部转动）
- [ ] 触摸传感器（检测"被拨弄"）

### 低优先级
- [ ] 本地 LLM 支持（完全离线对话）
- [ ] Whisper + TTS + GPT-4o-mini（降低成本）
- [ ] 多语言支持
- [ ] 更多性格预设

### 已完成
- [x] 3D 头像渲染（Three.js）
- [x] 心情系统（6 种心情 × 3 种变体）
- [x] 鼠标拖拽旋转头部
- [x] OpenAI Realtime API 集成
- [x] 摄像头抓帧 + 视觉分析
- [x] 音量/亮度控制
- [x] 性格参数调节面板

## �📄 许可证

MIT

---

🚗 **Bobi** - 你的智能车载伴侣