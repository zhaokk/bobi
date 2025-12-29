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

// ============== Fuzzy Wake Word Detection ==============

// Target wake words to match against
const WAKE_WORDS = [
  // English variants
  'hi bobi', 'hey bobi', 'hello bobi', 'yo bobi', 'ok bobi',
  'bobi', 'bobby', 'boby', 'bobe', 'bobi',
  // Common misrecognitions
  'hi bobby', 'hey bobby', 'hello bobby', 'high bobi', 'hi baby',
  'bobbi', 'babi', 'pobi', 'popi', 'poppy', 'hobby',
  // Chinese variants
  '嗨波比', '嘿波比', '你好波比', '喂波比', '波比',
  '嗨博比', '嘿博比', '你好博比', '博比',
  '嗨伯比', '嘿伯比', '你好伯比', '伯比',
  '播比', '拨比', '泊比',
  // Mixed language
  'hi波比', 'hey波比', '嗨bobi', '嘿bobi',
];

// Regex patterns for quick matching (faster than Dice)
const WAKE_PATTERNS = [
  // English patterns
  /h[aei]+\s*bob+[iy]+e?/i,
  /hello\s*bob+[iy]+e?/i,
  /yo\s*bob+[iy]+e?/i,
  /ok\s*bob+[iy]+e?/i,
  /wake\s*up\s*bob+[iy]+e?/i,
  /bobi/i,
  /bob+[iy]/i,
  // Relaxed patterns for misrecognitions
  /[bp][ao][bp]+[iy]/i,           // bobi/babi/popi/poppy
  /h[aio]+\s*[bp][ao][bp]+/i,     // hi/hey/high + bob/pop/bab
  // Chinese patterns
  /[嗨嘿哈嘻喂].{0,2}[波博伯播拨泊]/,  // Allow noise between
  /你好.{0,2}[波博伯播拨泊]/,
  /[波博伯播拨泊].?比/,
  // Mixed language
  /(hi|hey|hello).{0,3}(波比|博比|伯比)/i,
  /[嗨嘿喂].{0,2}(bobi|bobby)/i,
];

/**
 * Normalize text by replacing common misrecognized characters
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    // Chinese character normalization
    .replace(/[播拨泊]/g, '波')
    .replace(/[鼻逼币必]/g, '比')
    // English normalization
    .replace(/baby|bobby|babi|poppy/gi, 'bobi')
    .replace(/high\s+/gi, 'hi ');
}

/**
 * Dice coefficient for string similarity (O(n) complexity)
 * Returns 0-1, where 1 is exact match
 */
function diceCoefficient(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const getBigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bigram = s.substring(i, i + 2);
      map.set(bigram, (map.get(bigram) || 0) + 1);
    }
    return map;
  };

  const bigrams1 = getBigrams(s1);
  const bigrams2 = getBigrams(s2);

  let intersectionSize = 0;
  for (const [bigram, count] of bigrams1) {
    intersectionSize += Math.min(count, bigrams2.get(bigram) || 0);
  }

  return (2 * intersectionSize) / (s1.length - 1 + s2.length - 1);
}

/**
 * Check if text matches wake word using multiple strategies:
 * 1. Regex patterns (fast, handles variations)
 * 2. Dice coefficient similarity (fuzzy matching)
 */
function matchesWakeWord(text: string): boolean {
  const normalized = normalizeText(text);
  
  // Strategy 1: Regex patterns (fast path)
  if (WAKE_PATTERNS.some(pattern => pattern.test(normalized))) {
    return true;
  }
  
  // Strategy 2: Dice coefficient similarity
  // Check against each wake word variant
  const SIMILARITY_THRESHOLD = 0.35; // 35% similarity required (lowered for better detection)
  
  for (const wakeWord of WAKE_WORDS) {
    // Check full text
    if (diceCoefficient(normalized, wakeWord) >= SIMILARITY_THRESHOLD) {
      return true;
    }
    
    // Check each word in the text (for longer utterances)
    const words = normalized.split(' ');
    for (let i = 0; i < words.length; i++) {
      // Check single word
      if (diceCoefficient(words[i], wakeWord) >= SIMILARITY_THRESHOLD) {
        return true;
      }
      // Check word pairs (e.g., "hi bobi")
      if (i < words.length - 1) {
        const pair = words[i] + ' ' + words[i + 1];
        if (diceCoefficient(pair, wakeWord) >= SIMILARITY_THRESHOLD) {
          return true;
        }
      }
    }
  }
  
  return false;
}

export const ControlPanel = observer(function ControlPanel() {
  const [powerState, setPowerState] = useState<PowerState>('off');
  const [micError, setMicError] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState<string>('');
  const [wakeConfidence, setWakeConfidence] = useState(0);
  const [textInput, setTextInput] = useState('');
  const [gpsLat, setGpsLat] = useState('39.9042');
  const [gpsLng, setGpsLng] = useState('116.4074');

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const powerStateRef = useRef<PowerState>('off');
  const wakeDetectionCountRef = useRef(0);

  useEffect(() => {
    powerStateRef.current = powerState;
  }, [powerState]);

  useEffect(() => {
    return () => stopEverything();
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

  const startWakeWordListening = useCallback(async () => {
    console.log('👂 startWakeWordListening called...');
    
    // Clean up any existing recognition first
    if (recognitionRef.current) {
      console.log('🧹 Cleaning up existing recognition...');
      try {
        recognitionRef.current.stop();
      } catch (_e) { /* ignore */ }
      recognitionRef.current = null;
    }
    
    try {
      setMicError(null);
      wakeDetectionCountRef.current = 0;
      setWakeConfidence(0);

      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionAPI) {
        setMicError('浏览器不支持语音识别，请使用手动唤醒');
        return;
      }

      await navigator.mediaDevices.getUserMedia({ audio: true });

      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      // Use English as primary language for better "Hi Bobi" recognition
      // Chinese variants will still be matched via fuzzy matching
      recognition.lang = 'en-US';

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
          
          // Trigger on first detection (lowered threshold for better responsiveness)
          if (isFinal || wakeDetectionCountRef.current >= 1) {
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
              try { recognitionRef.current.start(); } catch (_e) { /* ignore */ }
            }
          }, 500);
        }
      };

      recognition.onend = () => {
        console.log(`🔚 Recognition ended. powerState=${powerStateRef.current}, hasRef=${!!recognitionRef.current}`);
        if (powerStateRef.current === 'listening' && recognitionRef.current) {
          // Reset detection count on session end
          wakeDetectionCountRef.current = 0;
          setWakeConfidence(0);
          console.log('🔁 Auto-restarting recognition...');
          try { recognitionRef.current.start(); } catch (_e) { /* ignore */ }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setPowerState('listening');
      console.log('👂 ✅ Wake word listening started successfully!');

    } catch (err) {
      console.error('❌ Failed to start wake word listening:', err);
      setMicError(err instanceof Error ? err.message : '无法访问麦克风');
    }
  }, [handleWakeUp]);

  // Sync with bobiStore state
  useEffect(() => {
    const state = bobiStore.state;
    const isConnected = bobiStore.realtimeStatus === 'connected';
    
    console.log(`📊 State sync: state=${state}, isConnected=${isConnected}, recognitionRef=${!!recognitionRef.current}`);
    
    if (state === 'ACTIVE_DIALOG' || state === 'VISION_CHECK' || (state === 'AWAKE_LISTEN' && isConnected)) {
      // Active conversation or connected to LLM
      setPowerState('awake');
    } else if (state === 'AWAKE_LISTEN' && !isConnected) {
      // Standby mode - listening for wake word but not connected to LLM
      setPowerState('listening');
      // Restart wake word listening if not already active
      // Use a small delay to ensure state is fully updated
      if (!recognitionRef.current) {
        console.log('🔄 Scheduling wake word listening restart...');
        setTimeout(() => {
          if (bobiStore.state === 'AWAKE_LISTEN' && bobiStore.realtimeStatus !== 'connected' && !recognitionRef.current) {
            console.log('🔄 Restarting wake word listening after standby...');
            startWakeWordListening();
          }
        }, 300);
      }
    } else if (state === 'DVR_IDLE') {
      // Fully off
      setPowerState('off');
    }
  }, [bobiStore.state, bobiStore.realtimeStatus, startWakeWordListening]);

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
              {wakeConfidence > 0 && (
                <span className="wake-confidence">({wakeConfidence}%)</span>
              )}
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
