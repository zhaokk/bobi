/**
 * Bobi Avatar Component
 * Shows Bobi's expression and head pose
 */

import { observer } from 'mobx-react-lite';
import { bobiStore } from '../store/bobiStore';

// Expression to SVG face mapping
const ExpressionFace = observer(function ExpressionFace() {
  const { expression } = bobiStore.deviceState;
  
  // Eye and mouth paths based on expression
  const getEyeStyle = () => {
    switch (expression) {
      case 'sleepy':
        return { leftEye: 'M 28 40 L 42 40', rightEye: 'M 58 40 L 72 40', isLine: true };
      case 'surprised':
        return { leftRadius: 10, rightRadius: 10, leftY: 38, rightY: 38 };
      case 'concerned':
        return { leftRadius: 7, rightRadius: 7, leftY: 42, rightY: 42, leftBrowTilt: -10, rightBrowTilt: 10 };
      case 'curious':
        return { leftRadius: 8, rightRadius: 6, leftY: 40, rightY: 40 };
      default: // neutral, happy
        return { leftRadius: 8, rightRadius: 8, leftY: 40, rightY: 40 };
    }
  };

  const getMouthPath = () => {
    switch (expression) {
      case 'happy':
        return 'M 30 60 Q 50 80 70 60';
      case 'surprised':
        return 'M 40 65 Q 50 75 60 65 Q 50 80 40 65';
      case 'sleepy':
        return 'M 35 65 L 65 65';
      case 'concerned':
        return 'M 30 70 Q 50 60 70 70';
      case 'curious':
        return 'M 35 65 Q 50 70 65 65';
      default: // neutral
        return 'M 35 65 L 65 65';
    }
  };

  const eyeStyle = getEyeStyle();
  const mouthPath = getMouthPath();

  return (
    <svg viewBox="0 0 100 100" className="bobi-face">
      {/* Head */}
      <circle cx="50" cy="50" r="45" fill="#4A90D9" />
      
      {/* Blush for happy */}
      {expression === 'happy' && (
        <>
          <circle cx="25" cy="55" r="8" fill="#FF9999" opacity="0.5" />
          <circle cx="75" cy="55" r="8" fill="#FF9999" opacity="0.5" />
        </>
      )}

      {/* Eyes */}
      {'isLine' in eyeStyle && eyeStyle.isLine ? (
        <>
          <path d={eyeStyle.leftEye} stroke="white" strokeWidth="4" strokeLinecap="round" />
          <path d={eyeStyle.rightEye} stroke="white" strokeWidth="4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="35" cy={eyeStyle.leftY ?? 40} r={eyeStyle.leftRadius ?? 8} fill="white" />
          <circle cx="65" cy={eyeStyle.rightY ?? 40} r={eyeStyle.rightRadius ?? 8} fill="white" />
          <circle cx="35" cy={eyeStyle.leftY ?? 40} r={(eyeStyle.leftRadius ?? 8) / 2} fill="#333" />
          <circle cx="65" cy={eyeStyle.rightY ?? 40} r={(eyeStyle.rightRadius ?? 8) / 2} fill="#333" />
        </>
      )}

      {/* Eyebrows for concerned */}
      {expression === 'concerned' && (
        <>
          <path d="M 25 30 L 42 35" stroke="#333" strokeWidth="3" strokeLinecap="round" />
          <path d="M 75 30 L 58 35" stroke="#333" strokeWidth="3" strokeLinecap="round" />
        </>
      )}

      {/* Mouth */}
      <path d={mouthPath} stroke="#333" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
});

export const BobiAvatar = observer(function BobiAvatar() {
  const { headPose, volume, brightness, expression } = bobiStore.deviceState;

  // Calculate rotation transform
  const rotateStyle = {
    transform: `rotateY(${headPose.yaw}deg) rotateX(${-headPose.pitch}deg)`,
    transition: 'transform 0.3s ease-out',
  };

  return (
    <div className="bobi-avatar">
      <h3>🤖 Bobi</h3>

      <div className="avatar-container">
        <div className="avatar-head" style={rotateStyle}>
          <ExpressionFace />
        </div>
        
        {/* Gimbal base */}
        <div className="avatar-base">
          <div className="base-neck" />
          <div className="base-stand" />
        </div>
      </div>

      <div className="avatar-info">
        <div className="info-row">
          <span className="label">表情</span>
          <span className="value">{bobiStore.expressionEmoji} {expression}</span>
        </div>
        <div className="info-row">
          <span className="label">头部</span>
          <span className="value">
            Yaw: {headPose.yaw.toFixed(0)}° | Pitch: {headPose.pitch.toFixed(0)}°
          </span>
        </div>
      </div>

      <div className="avatar-sliders">
        <div className="slider-row">
          <span className="label">🔊 音量</span>
          <div className="slider-container">
            <div className="slider-bar">
              <div className="slider-fill" style={{ width: `${volume}%` }} />
            </div>
            <span className="slider-value">{volume}</span>
          </div>
        </div>
        <div className="slider-row">
          <span className="label">🔆 亮度</span>
          <div className="slider-container">
            <div className="slider-bar">
              <div className="slider-fill" style={{ width: `${brightness}%` }} />
            </div>
            <span className="slider-value">{brightness}</span>
          </div>
        </div>
      </div>
    </div>
  );
});
