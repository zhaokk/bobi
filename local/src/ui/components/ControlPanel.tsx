/**
 * Control Panel Component
 * Simplified version - uses orchestrator directly, no WebSocket
 */

import { observer } from 'mobx-react-lite';
import { useState, useCallback, useRef, useEffect } from 'react';
import { bobiStore } from '../../core/store';
import { orchestrator } from '../../core/orchestrator';

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

type PowerState = 'off' | 'listening' | 'awake';

// Wake word variations (fuzzy matching)
const WAKE_PATTERNS = [
  /h[aie]+\s*bob+[iy]/i,
  /hey\s*bob+[iy]/i,
  /hi\s*bob+[iy]/i,
  /hello\s*bob+[iy]/i,
  /嗨\s*波比/,
  /嘿\s*波比/,
  /你好\s*波比/,
];

function matchesWakeWord(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return WAKE_PATTERNS.some(pattern => pattern.test(normalized));
}

export const ControlPanel = observer(function ControlPanel() {
  const [powerState, setPowerState] = useState<PowerState>('off');
  const [micError, setMicError] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState<string>('');
  const [textInput, setTextInput] = useState('');
  const [gpsLat, setGpsLat] = useState('39.9042');
  const [gpsLng, setGpsLng] = useState('116.4074');

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const powerStateRef = useRef<PowerState>('off');

  useEffect(() => {
    powerStateRef.current = powerState;
  }, [powerState]);

  useEffect(() => {
    return () => stopEverything();
  }, []);

  // Sync with bobiStore state
  useEffect(() => {
    if (bobiStore.isAwake && powerState !== 'awake') {
      setPowerState('awake');
    } else if (!bobiStore.isAwake && powerState === 'awake') {
      setPowerState('off');
    }
  }, [bobiStore.state]);

  const startWakeWordListening = useCallback(async () => {
    try {
      setMicError(null);

      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionAPI) {
        setMicError('浏览器不支持语音识别，请使用手动唤醒');
        return;
      }

      await navigator.mediaDevices.getUserMedia({ audio: true });

      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        let isFinal = false;
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
          if (event.results[i].isFinal) isFinal = true;
        }
        
        setLastHeard(transcript);

        if (matchesWakeWord(transcript) && isFinal) {
          handleWakeUp();
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'not-allowed') {
          setMicError('麦克风权限被拒绝');
        }
      };

      recognition.onend = () => {
        if (powerStateRef.current === 'listening' && recognitionRef.current) {
          try { recognitionRef.current.start(); } catch (_e) { /* ignore */ }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setPowerState('listening');

    } catch (err) {
      setMicError(err instanceof Error ? err.message : '无法访问麦克风');
    }
  }, []);

  const handleWakeUp = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setPowerState('awake');
    
    // Wake up via orchestrator (connects to LLM directly)
    await orchestrator.wake();
  }, []);

  const stopEverything = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (bobiStore.isAwake) {
      orchestrator.sleep();
    }

    setPowerState('off');
    setLastHeard('');
  }, []);

  const handleSendText = useCallback(() => {
    if (!textInput.trim()) return;
    orchestrator.sendText(textInput);
    setTextInput('');
  }, [textInput]);

  const handleIMU = useCallback((level: 'L0' | 'L1' | 'L2') => {
    orchestrator.handleIMUEvent(level);
  }, []);

  const handleGimbalTouched = useCallback(() => {
    orchestrator.handleGimbalTouched();
  }, []);

  const handleGPSUpdate = useCallback(() => {
    const lat = parseFloat(gpsLat);
    const lng = parseFloat(gpsLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      bobiStore.updateGPS({ lat, lng });
    }
  }, [gpsLat, gpsLng]);

  return (
    <div className="control-panel">
      <h3>🎮 控制面板</h3>

      {/* Power Control */}
      <div className="control-section power-section">
        {powerState === 'off' && (
          <>
            <button className="btn btn-power-on" onClick={startWakeWordListening}>
              ⚡ 通电启动
            </button>
            <div className="power-hint">点击通电后，说 "Hi Bobi" 唤醒</div>
          </>
        )}

        {powerState === 'listening' && (
          <>
            <div className="listening-status">
              <span className="listening-icon">👂</span>
              <span>等待唤醒词...</span>
            </div>
            {lastHeard && <div className="last-heard">听到: "{lastHeard}"</div>}
            <button className="btn btn-manual-wake" onClick={handleWakeUp}>
              🎤 手动唤醒
            </button>
            <button className="btn btn-power-off" onClick={stopEverything}>
              🔌 关闭
            </button>
          </>
        )}

        {powerState === 'awake' && (
          <>
            <div className="awake-status">
              <span className="recording-dot"></span>
              <span>Bobi 已唤醒</span>
            </div>
            
            {/* Text input for testing */}
            <div className="text-input-section">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                placeholder="输入消息..."
              />
              <button className="btn" onClick={handleSendText}>发送</button>
            </div>

            <button className="btn btn-power-off" onClick={stopEverything}>
              🔌 结束对话
            </button>
          </>
        )}

        {micError && <div className="mic-error">❌ {micError}</div>}
      </div>

      {/* IMU Events */}
      <div className="control-section">
        <label>🎢 IMU 事件</label>
        <div className="btn-group">
          <button className="btn btn-imu-l0" onClick={() => handleIMU('L0')}>L0</button>
          <button className="btn btn-imu-l1" onClick={() => handleIMU('L1')}>L1</button>
          <button className="btn btn-imu-l2" onClick={() => handleIMU('L2')}>L2</button>
        </div>
      </div>

      {/* Gimbal */}
      <div className="control-section">
        <label>🤖 云台</label>
        <button className="btn btn-gimbal" onClick={handleGimbalTouched}>
          👆 被拨弄
        </button>
      </div>

      {/* GPS */}
      <div className="control-section">
        <label>📍 GPS</label>
        <div className="gps-inputs">
          <input type="text" value={gpsLat} onChange={(e) => setGpsLat(e.target.value)} />
          <input type="text" value={gpsLng} onChange={(e) => setGpsLng(e.target.value)} />
          <button className="btn" onClick={handleGPSUpdate}>更新</button>
        </div>
      </div>
    </div>
  );
});
