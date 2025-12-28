/**
 * Main App Component
 * No WebSocket needed - directly uses shared store with core
 */

import { observer } from 'mobx-react-lite';
import { StatePanel } from './components/StatePanel';
import { ControlPanel } from './components/ControlPanel';
import { CameraPanel } from './components/CameraPanel';
import { BobiAvatar } from './components/BobiAvatar';
import { ConversationPanel } from './components/ConversationPanel';
import { LogPanel } from './components/LogPanel';
import { useAudioPlayback } from './hooks/useAudioPlayback';

import './App.css';

export const App = observer(function App() {
  // Initialize audio playback for Bobi's voice
  useAudioPlayback();

  return (
    <div className="app">
      <header className="app-header">
        <h1>🚗 Bobi - 车载 AI 伴侣</h1>
        <p className="subtitle">Local-First Architecture</p>
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
          💡 Core + UI 共享内存状态，无网络通信延迟
        </p>
      </footer>
    </div>
  );
});
