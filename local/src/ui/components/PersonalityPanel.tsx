/**
 * Personality Panel - Adjust Bobi's language style in real-time
 */

import { observer } from 'mobx-react-lite';
import { bobiStore, type PersonalityPreset, type PersonalitySettings, PRESET_DISPLAY } from '../../core/store';
import './PersonalityPanel.css';

interface SliderConfig {
  key: keyof PersonalitySettings;
  label: string;
  leftLabel: string;
  rightLabel: string;
  emoji: string;
}

const SLIDERS: SliderConfig[] = [
  { key: 'affection', label: '态度', leftLabel: '愤世嫉俗', rightLabel: '超级热情', emoji: '💕' },
  { key: 'verbosity', label: '话量', leftLabel: '极其简短', rightLabel: '话痨', emoji: '💬' },
  { key: 'humor', label: '幽默', leftLabel: '严肃', rightLabel: '搞笑', emoji: '😄' },
  { key: 'emotionality', label: '情绪', leftLabel: '冷静', rightLabel: '情绪化', emoji: '🎭' },
];

// Build PRESETS from PRESET_DISPLAY
const PRESETS: { key: PersonalityPreset; label: string; emoji: string }[] = 
  (Object.keys(PRESET_DISPLAY) as PersonalityPreset[]).map(key => ({
    key,
    label: PRESET_DISPLAY[key].label,
    emoji: PRESET_DISPLAY[key].emoji,
  }));

export const PersonalityPanel = observer(function PersonalityPanel() {
  const { personality, personalityPreset, realtimeStatus } = bobiStore;
  const isConnected = realtimeStatus === 'connected';

  return (
    <div className="personality-panel">
      <div className="panel-header">
        <h3>🎭 个性调试</h3>
        {isConnected && <span className="live-badge">实时生效</span>}
      </div>

      {/* Presets */}
      <div className="presets-section">
        <label>快速预设</label>
        <div className="preset-buttons">
          {PRESETS.map(preset => (
            <button
              key={preset.key}
              className={`preset-btn ${personalityPreset === preset.key ? 'active' : ''}`}
              onClick={() => bobiStore.applyPersonalityPreset(preset.key)}
            >
              <span className="preset-emoji">{preset.emoji}</span>
              <span className="preset-label">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div className="sliders-section">
        {SLIDERS.map(slider => (
          <div key={slider.key} className="slider-row">
            <div className="slider-header">
              <span className="slider-emoji">{slider.emoji}</span>
              <span className="slider-label">{slider.label}</span>
              <span className="slider-value">{personality[slider.key]}</span>
            </div>
            <div className="slider-container">
              <span className="range-label left">{slider.leftLabel}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={personality[slider.key]}
                onChange={(e) => bobiStore.updatePersonality(slider.key, parseInt(e.target.value, 10))}
                className="personality-slider"
              />
              <span className="range-label right">{slider.rightLabel}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
