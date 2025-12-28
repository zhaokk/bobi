# Bobi - 车载 AI 伴侣 MVP

🚗 一个具备行车记录仪功能的车载 AI 伴侣系统。默认作为 DVR 运行，唤醒后进入 AI 对话模式。

## 🌟 特性

- **DVR 模式**：默认本地循环录制（前/后摄像头）
- **唤醒词**：说 "Hi Bobi" 进入 AI 对话模式
- **LLM 对话**：基于 OpenAI Realtime API 的实时语音对话
- **视觉能力**：支持摄像头抓帧，可以"看"路况
- **位置感知**：GPS 定位（仅在需要时上传）
- **安全监测**：IMU 事件检测（碰撞、急刹）
- **表情动作**：可爱的表情和云台动作反馈

## 🏗️ 架构 (v0.2 Local-First)

```
┌─────────────────────────────────────────────────────┐
│  local/  (设备端 - Core + UI 共享内存)               │
│  ├── src/core/     状态机、LLM、DVR、工具            │
│  └── src/ui/       React UI 组件                    │
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
├── package.json          # 工作区根配置
├── local/                # 🆕 设备端 (Core + UI)
│   ├── src/
│   │   ├── main.tsx              # 入口
│   │   ├── core/                 # 核心模块
│   │   │   ├── store.ts          # MobX 共享状态
│   │   │   ├── orchestrator/     # 协调器
│   │   │   ├── llm/              # OpenAI Realtime
│   │   │   ├── dvr/              # DVR 录制
│   │   │   ├── wakeword/         # 唤醒词
│   │   │   └── tools/            # LLM 工具函数
│   │   └── ui/                   # React 组件
│   │       ├── App.tsx
│   │       ├── App.css
│   │       └── components/
│   └── package.json
├── cloud/                # 🆕 云服务
│   ├── src/
│   │   └── index.ts              # Token 签发等
│   └── package.json
├── server/               # (Legacy) 原后端
└── web/                  # (Legacy) 原前端
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
# Local: 使用浏览器直连时，需要在 local/.env 配置
cp local/.env.example local/.env
# 或通过 cloud 服务获取 token

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

- 后端 WebSocket: `ws://localhost:3001`
- 前端 WebUI: `http://localhost:5173`

**⚠️ 重要**：必须使用 `localhost` 访问，否则浏览器不允许访问摄像头/麦克风。

## 🎯 验证场景

### A) 未唤醒状态 - DVR 录制

1. 启动应用后，状态应显示 `DVR_IDLE`
2. LLM 连接应显示"断开"
3. DVR 录制应显示"录制中"
4. 日志面板显示 DVR 启动信息

### B) 唤醒 Bobi

1. 点击 **"Wake: Hi Bobi"** 按钮
2. 状态变为 `AWAKE_LISTEN`
3. LLM 连接变为"已连接"
4. 表情从 😴 变为 😊
5. 唤醒倒计时开始（默认 20 秒）

### C) 简单问答（不需要视觉）

1. 确保已唤醒
2. 在文本输入框输入：`太阳从哪边升起？`
3. 点击"发送"或按 Enter
4. 观察对话面板显示用户消息和 LLM 回复
5. 等待超时自动回到 DVR_IDLE

### D) 视觉请求 - 两阶段响应

1. 唤醒 Bobi
2. 点击"启动摄像头"按钮
3. 发送：`后面有没有车？`
4. 观察：
   - 摄像头面板显示"正在请求 rear 摄像头帧..."
   - 表情变为 🤔 (curious)
   - LLM 先回复确认看到了图片
   - 然后给出基于图像的回答

### E) 多意图请求

1. 唤醒 Bobi 并启动摄像头
2. 发送：`看看前面路况，同时把音量调小点，我现在在哪？`
3. 观察：
   - 触发 `capture_frame(front)`
   - 触发 `set_device_state(volume)`
   - 触发 `get_location()`
   - 音量滑条数值减小
   - LLM 综合回答所有问题

### F) 对话超时

1. 唤醒 Bobi 并开始对话
2. 持续对话直到对话时长接近 3 分钟
3. 观察 LLM 主动引导结束对话
4. 状态回到 DVR_IDLE

### G) IMU 事件 - L1 中等

1. 唤醒 Bobi 并进入对话
2. 点击 **"L1 中等"** 按钮
3. 观察：
   - 表情变为 😟 (concerned)
   - 本地反馈显示在日志
   - LLM 发出关心用户的回复

### H) 云台被拨弄

1. 唤醒 Bobi 并进入对话
2. 点击 **"Gimbal Touched"** 按钮
3. 观察：
   - 表情变为 😮 (surprised)
   - 头部姿态（yaw）变化
   - LLM 给出俏皮的回应
   - 头部返回中心位置

## ⚙️ 配置项

在 `.env` 文件中配置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OPENAI_API_KEY` | - | OpenAI API 密钥（必需） |
| `SERVER_PORT` | 3001 | WebSocket 服务端口 |
| `AWAKE_WINDOW_MS` | 20000 | 唤醒窗口时长（毫秒） |
| `MAX_DIALOG_DURATION_MS` | 180000 | 最大对话时长（毫秒） |
| `CAPTURE_COOLDOWN_MS` | 800 | 抓帧冷却时间（毫秒） |
| `CAPTURE_MAX_PER_10S` | 3 | 10秒内最大抓帧次数 |
| `LOCATION_CACHE_MS` | 1000 | GPS 缓存时间（毫秒） |
| `DEBUG` | true | 是否输出调试日志 |

## 🔧 技术架构

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

| 工具 | 说明 | 限流 |
|------|------|------|
| `capture_frame` | 抓取摄像头画面 | 800ms 冷却，10s 内最多 3 次 |
| `get_location` | 获取 GPS 位置 | 1s 缓存 |
| `get_imu_summary` | 获取运动状态 | 无限制 |
| `set_device_state` | 调节音量/亮度/表情 | 300ms 冷却，单次 ±15 |

### 数据上传策略

- **默认不上传**：DVR_IDLE 状态不连接 LLM，不上传任何数据
- **唤醒后可用**：只有 AWAKE_LISTEN/ACTIVE_DIALOG/VISION_CHECK 状态才允许数据上传
- **按需抓帧**：只在 LLM 请求时才抓取摄像头画面
- **位置隐私**：只在用户问位置相关问题时才提供 GPS

## 🛠️ 开发说明

### TODO：真实硬件对接

代码中标记了 `TODO` 的地方需要对接真实硬件：

1. **DVR 录制** (`server/src/dvr/recorder.ts`)
   - 对接真实摄像头（V4L2/GStreamer）
   - 实现视频编码和存储
   - 实现环形缓冲区文件轮转

2. **唤醒词引擎** (`server/src/wakeword/engine.ts`)
   - 集成 Porcupine/Snowboy 等离线唤醒词引擎
   - 处理实时麦克风音频流

3. **GPS 模块** (`server/src/tools/registry.ts`)
   - 对接真实 GPS 芯片
   - 实现位置更新订阅

4. **IMU 传感器** (`server/src/tools/registry.ts`)
   - 对接真实 IMU 硬件
   - 实现阈值检测逻辑

5. **云台电机** (`server/src/state/StateMachine.ts`)
   - 对接电机驱动
   - 实现位置反馈和"被拨弄"检测

### TODO：LLM 提供者扩展

当前仅实现了 OpenAI Realtime API。未来可扩展：

- Whisper + TTS + GPT-4o-mini（成本更低）
- 本地 LLM（完全离线）
- 其他云服务商

参见 `server/src/llm/LLMProvider.ts` 接口定义。

## 📝 与 Nomi 的区别

| 特性 | Bobi | Nomi |
|------|------|------|
| 行车记录仪 | ✅ 内置 DVR | ❌ 无 |
| 硬件集成 | ✅ 一体化设计 | ❌ 共享车载硬件 |
| 摄像头 | ✅ 独立前/后摄像头 | ❌ 使用车载摄像头 |
| 麦克风 | ✅ 独立麦克风 | ❌ 使用车载麦克风 |
| 离线能力 | ✅ DVR 纯本地运行 | - |

## 📄 许可证

MIT

---

🚗 **Bobi** - 你的智能车载伴侣


TODO:
hi bobi之后的指令依然保留执行