/**
 * Control Panel Component
 * Power on → Listen for "Hi Bobi" → Start real-time conversation
 * 
 * Wake word detection strategy:
 * 1. Primary: Web Speech API with fuzzy matching
 * 2. Fallback: Manual wake button
 * 3. Future: Picovoice Porcupine (requires Access Key)
 */

import { observer } from 'mobx-react-lite';
import { useState, useCallback, useRef, useEffect } from 'react';
import { wsService } from '../services/websocket';
import { webrtcService } from '../services/webrtc';
import { bobiStore } from '../store/bobiStore';

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
  // English variations
  /h[aie]+\s*bob+[iy]/i,
  /hey\s*bob+[iy]/i,
  /hi\s*bob+[iy]/i,
  /hello\s*bob+[iy]/i,
  // Chinese variations  
  /嗨\s*波比/,
  /嘿\s*波比/,
  /你好\s*波比/,
  /嗨\s*bobi/i,
  /嘿\s*bobi/i,
  // Phonetic mistakes
  /h[aie]+\s*bob+e/i,
  /h[aie]+\s*pop+[iy]/i,
  /h[aie]+\s*bab+[iy]/i,
];

function matchesWakeWord(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return WAKE_PATTERNS.some(pattern => pattern.test(normalized));
}

export const ControlPanel = observer(function ControlPanel() {
  const [powerState, setPowerState] = useState<PowerState>('off');
  const [micError, setMicError] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState<string>('');
  const [wakeConfidence, setWakeConfidence] = useState(0);
  const [gpsLat, setGpsLat] = useState('39.9042');
  const [gpsLng, setGpsLng] = useState('116.4074');

  // Refs for audio streaming
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const powerStateRef = useRef<PowerState>('off');
  const wakeDetectionCountRef = useRef(0);

  // Keep powerStateRef in sync
  useEffect(() => {
    powerStateRef.current = powerState;
  }, [powerState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopEverything();
    };
  }, []);

  // Start listening for wake word using Web Speech API
  const startWakeWordListening = useCallback(async () => {
    try {
      setMicError(null);
      wakeDetectionCountRef.current = 0;
      setWakeConfidence(0);

      // Check for Speech Recognition support
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionAPI) {
        setMicError('浏览器不支持语音识别，请使用 Chrome 或点击手动唤醒');
        return;
      }

      // Request microphone permission first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Create speech recognition
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US'; // Better for "Hi Bobi"

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        let isFinal = false;
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            isFinal = true;
          }
        }
        
        setLastHeard(transcript);

        // Check for wake word with fuzzy matching
        if (matchesWakeWord(transcript)) {
          wakeDetectionCountRef.current++;
          setWakeConfidence(Math.min(100, wakeDetectionCountRef.current * 50));
          
          console.log(`🎤 Wake word candidate: "${transcript}" (count: ${wakeDetectionCountRef.current})`);
          
          // Require confirmation: either final result or detected twice
          if (isFinal || wakeDetectionCountRef.current >= 2) {
            console.log('✅ Wake word confirmed!');
            handleWakeUp();
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setMicError('麦克风权限被拒绝');
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          // Restart on other errors
          setTimeout(() => {
            if (powerStateRef.current === 'listening' && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {
                // Already started
              }
            }
          }, 500);
        }
      };

      recognition.onend = () => {
        // Restart if still in listening mode
        if (powerStateRef.current === 'listening' && recognitionRef.current) {
          // Reset detection count on session end
          wakeDetectionCountRef.current = 0;
          setWakeConfidence(0);
          try {
            recognitionRef.current.start();
          } catch (e) {
            // Already started
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setPowerState('listening');
      console.log('👂 Listening for "Hi Bobi"...');


    } catch (err) {
      console.error('Failed to start wake word listening:', err);
      setMicError(err instanceof Error ? err.message : '无法访问麦克风');
    }
  }, []);

  // Handle wake up - connect via WebRTC directly to OpenAI
  const handleWakeUp = useCallback(async () => {
    try {
      // Stop speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }

      // Stop media stream (WebRTC will create its own)
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }

      setPowerState('awake');

      // Connect via WebRTC
      console.log('🔌 Connecting via WebRTC...');
      await webrtcService.connect();

      console.log('🎤 Bobi awake! WebRTC connected');

    } catch (err) {
      console.error('Failed to connect via WebRTC:', err);
      setMicError(err instanceof Error ? err.message : '无法连接');
      setPowerState('off');
    }
  }, []);

  // Stop everything
  const stopEverything = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Disconnect WebRTC
    webrtcService.disconnect();

    setPowerState('off');
    setLastHeard('');
    console.log('🔌 Power off');
  }, []);

  const handleIMU = useCallback((level: 'L0' | 'L1' | 'L2') => {
    wsService.triggerIMU(level);
  }, []);

  const handleGimbalTouched = useCallback(() => {
    wsService.triggerGimbalTouched();
  }, []);

  const handleGPSUpdate = useCallback(() => {
    const lat = parseFloat(gpsLat);
    const lng = parseFloat(gpsLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      wsService.updateGPS(lat, lng);
    }
  }, [gpsLat, gpsLng]);

  const handleRandomGPS = useCallback(() => {
    const lat = 39.9 + (Math.random() - 0.5) * 0.2;
    const lng = 116.4 + (Math.random() - 0.5) * 0.2;
    setGpsLat(lat.toFixed(4));
    setGpsLng(lng.toFixed(4));
    wsService.updateGPS(lat, lng, Math.random() * 60);
  }, []);

  return (
    <div className="control-panel">
      <h3>🎮 控制面板</h3>

      {/* Power Control */}
      <div className="control-section power-section">
        {powerState === 'off' && (
          <>
            <button 
              className="btn btn-power-on"
              onClick={startWakeWordListening}
            >
              ⚡ 通电启动
            </button>
            <div className="power-hint">
              点击通电后，说 "Hi Bobi" 唤醒
            </div>
          </>
        )}

        {powerState === 'listening' && (
          <>
            <div className="listening-status">
              <span className="listening-icon">👂</span>
              <span>等待唤醒词...</span>
            </div>
            <div className="wake-hint">
              说 <strong>"Hi Bobi"</strong> 开始对话
            </div>
            {lastHeard && (
              <div className="last-heard">
                听到: "{lastHeard}"
                {wakeConfidence > 0 && (
                  <span className="confidence"> (匹配度: {wakeConfidence}%)</span>
                )}
              </div>
            )}
            {/* Manual wake button as fallback */}
            <button 
              className="btn btn-manual-wake"
              onClick={handleWakeUp}
            >
              🎤 手动唤醒 (语音识别不准时使用)
            </button>
            <button 
              className="btn btn-power-off"
              onClick={stopEverything}
            >
              🔌 关闭
            </button>
          </>
        )}

        {powerState === 'awake' && (
          <>
            <div className="awake-status">
              <span className="recording-dot"></span>
              <span>Bobi 已唤醒 - 正在对话...</span>
            </div>
            <div className="streaming-hint">
              直接说话，Bobi 会实时回应
            </div>
            <button 
              className="btn btn-power-off"
              onClick={stopEverything}
            >
              🔌 结束对话
            </button>
          </>
        )}

        {micError && (
          <div className="mic-error">
            ❌ {micError}
            {/* Show manual wake if speech recognition fails */}
            {powerState === 'off' && (
              <button 
                className="btn btn-manual-wake"
                onClick={handleWakeUp}
                style={{ marginTop: '0.5rem' }}
              >
                🎤 直接开始对话
              </button>
            )}
          </div>
        )}
      </div>

      {/* IMU Events */}
      <div className="control-section">
        <label>🎢 IMU 事件</label>
        <div className="btn-group">
          <button className="btn btn-imu-l0" onClick={() => handleIMU('L0')}>
            L0 轻微
          </button>
          <button className="btn btn-imu-l1" onClick={() => handleIMU('L1')}>
            L1 中等
          </button>
          <button className="btn btn-imu-l2" onClick={() => handleIMU('L2')}>
            L2 严重
          </button>
        </div>
      </div>

      {/* Gimbal */}
      <div className="control-section">
        <label>🤖 云台</label>
        <button className="btn btn-gimbal" onClick={handleGimbalTouched}>
          👆 Gimbal Touched (被拨弄)
        </button>
      </div>

      {/* GPS */}
      <div className="control-section">
        <label>📍 GPS 位置</label>
        <div className="gps-inputs">
          <input
            type="text"
            value={gpsLat}
            onChange={(e) => setGpsLat(e.target.value)}
            placeholder="纬度"
          />
          <input
            type="text"
            value={gpsLng}
            onChange={(e) => setGpsLng(e.target.value)}
            placeholder="经度"
          />
          <button className="btn" onClick={handleGPSUpdate}>更新</button>
          <button className="btn" onClick={handleRandomGPS}>随机</button>
        </div>
        <div className="gps-current">
          当前: {bobiStore.gpsLocation.lat.toFixed(4)}, {bobiStore.gpsLocation.lng.toFixed(4)}
          {bobiStore.gpsLocation.speed_kmh > 0 && ` @ ${bobiStore.gpsLocation.speed_kmh.toFixed(0)} km/h`}
        </div>
      </div>
    </div>
  );
});
