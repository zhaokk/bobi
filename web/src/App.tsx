/**
 * Main App Component
 */

import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { wsService } from './services/websocket';
import { StatePanel } from './components/StatePanel';
import { ControlPanel } from './components/ControlPanel';
import { CameraPanel } from './components/CameraPanel';
import { BobiAvatar } from './components/BobiAvatar';
import { ConversationPanel } from './components/ConversationPanel';
import { LogPanel } from './components/LogPanel';

import './App.css';

export const App = observer(function App() {
  // Connect to WebSocket on mount
  useEffect(() => {
    wsService.connect();

    return () => {
      wsService.disconnect();
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🚗 Bobi - 车载 AI 伴侣模拟器</h1>
        <p className="subtitle">WebUI for Development & Testing</p>
      </header>

      <main className="app-main">
        <div className="layout">
          {/* Left Column */}
          <div className="column column-left">
            <StatePanel />
            <ControlPanel />
          </div>

          {/* Center Column */}
          <div className="column column-center">
            <BobiAvatar />
            <ConversationPanel />
          </div>

          {/* Right Column */}
          <div className="column column-right">
            <CameraPanel />
            <LogPanel />
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>
          💡 提示: 必须在 <code>localhost</code> 运行才能访问摄像头/麦克风
        </p>
      </footer>
    </div>
  );
});
