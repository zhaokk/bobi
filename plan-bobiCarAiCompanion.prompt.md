## Plan: Bobi Car AI Companion MVP Implementation

Implement a complete TypeScript/Node.js backend with WebSocket state machine orchestrator, React/Vite WebUI simulator, and OpenAI Realtime API integration. The system operates as a DVR by default, only connecting to LLM when user says "Hi Bobi".

### Steps

1. **Set up monorepo structure** with npm workspaces: root `package.json`, `server/` for Node.js backend, `web/` for React/Vite frontend, shared `tsconfig.base.json`, and `.env.example` for `OPENAI_API_KEY`

2. **Implement server state machine** in `server/src/state/StateMachine.ts` with 4 states (DVR_IDLE → AWAKE_LISTEN → ACTIVE_DIALOG → VISION_CHECK), timeout handlers, and transition logic

3. **Create DVR recorder module** at `server/src/dvr/recorder.ts` with ring-buffer mock implementation, front/rear camera segment tracking, and TODO markers for real hardware

4. **Build wakeword engine interface** at `server/src/wakeword/engine.ts` with pluggable interface (`WakewordEngine`) and mock implementation that responds to WebUI button clicks

5. **Implement OpenAI Realtime client** at `server/src/realtime/RealtimeClient.ts` handling WebSocket connection to `wss://api.openai.com/v1/realtime?model=gpt-realtime-mini-2025-12-15`, session lifecycle, audio/text streaming, and function call dispatching

6. **Create 5 tool implementations** in `server/src/tools/`: `capture_frame()`, `get_location()`, `get_imu_summary()`, `set_device_state()` with rate limiting (800ms capture cooldown, 1s location cache)

7. **Build WebSocket client handler** at `server/src/websocket/ClientHandler.ts` to receive audio/text/events from WebUI, route to state machine, and push LLM output/state changes back

8. **Implement "two-stage response"** pattern: when LLM requests vision tool, immediately emit local "收到，我看一下…" to WebUI before capturing frame （其实不一定非要说一样的话，这个恢复可以用real time llm 回复）, then resume with final LLM answer

9. **Create React WebUI for debug and testing** with: state machine panel (state, awake timer, dialog duration, LLM connection), control buttons (Wake, IMU L1/L2, Gimbal Touched, GPS Move), camera preview with frame capture, Bobi expression/gimbal animation, and event log

10. **Wire frontend hooks**: `useWebSocket.ts` for server connection, `useCamera.ts` for getUserMedia video, `useMicrophone.ts` for audio capture, canvas-to-base64 for frame extraction

11. **Add npm scripts**: root `npm run dev` uses concurrently to launch both `server` and `web` packages

12. **Write README.md** with setup instructions, `.env` configuration, verification scenarios (A-H from requirements), and localhost requirement for browser permissions

### Further Considerations

1. **Audio vs Text-only MVP**: Start with text input only (simpler), add audio streaming with PCM16 24kHz later? *Recommendation: Text-first, mark audio with TODO*
- direcitly use gpt real time audio

2. **OpenAI Realtime API schema uncertainty**: Some event fields may change—wrap in `RealtimeClient` abstraction with `// TODO: Verify against official schema` comments?

3. **Concurrent tool execution**: When LLM requests multiple tools (e.g., capture + set_volume + get_location), execute in parallel with `Promise.all` and aggregate results?
-ok


more human commnents
1. for llm use a abstraction, and at this stage it only support realtime api, but in future we may want to support cheap audio chat approach to save money

硬件（真实设备）：前后两个摄像头、IMU（陀螺仪/加速度）、麦克风、扬声器、云台电机（左右上下）、GPS 芯片、4G 网络、Type-C 供电、本地存储（车载记录仪常规容量）。
定位：这是一个车载配件/车载伴侣。
核心原则：默认不调用 LLM 时，它就是一个行车记录仪（DVR），本地循环录制；只有用户唤醒后才进入 AI 对话模式，才允许调用 LLM/上传关键帧/上传定位等。

不确定的地方可以参考nomi，我们与nomi不同的点是，nomi 是不具备行车记录仪功能的，且硬件并没有集成在nomi本体上，而是共享车载的摄像头和麦克风，而我们的bobi是都继承在bobi本体上的
技术框架：
- 后端：TypeScript + Node.js
- 前端：React + mobx + Vite + WebSocket
- LLM 接口：OpenAI Realtime API（wss://api.openai.com/v1/realtime?model=gpt-realtime-mini-2025-12-15）
