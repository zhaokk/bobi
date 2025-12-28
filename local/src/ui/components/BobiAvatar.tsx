/**
 * Bobi Avatar Component
 * SVG face with expressions and head rotation
 */

import { observer } from 'mobx-react-lite';
import { bobiStore } from '../../core/store';

const expressions: Record<string, { eyes: string; mouth: string }> = {
  neutral: {
    eyes: 'M 30,40 Q 35,35 40,40 M 60,40 Q 65,35 70,40',
    mouth: 'M 35,60 Q 50,65 65,60'
  },
  happy: {
    eyes: 'M 28,40 Q 35,30 42,40 M 58,40 Q 65,30 72,40',
    mouth: 'M 30,55 Q 50,75 70,55'
  },
  curious: {
    eyes: 'M 28,38 Q 35,32 42,38 M 58,42 Q 65,48 72,42',
    mouth: 'M 40,62 A 10,10 0 0 0 60,62'
  },
  surprised: {
    eyes: 'M 30,35 A 8,8 0 1 1 30,36 M 60,35 A 8,8 0 1 1 60,36',
    mouth: 'M 45,58 A 8,8 0 1 1 55,58'
  },
  thinking: {
    eyes: 'M 28,40 L 42,40 M 58,38 Q 65,34 72,38',
    mouth: 'M 38,62 Q 45,60 55,65'
  },
  sleepy: {
    eyes: 'M 28,42 Q 35,40 42,42 M 58,42 Q 65,40 72,42',
    mouth: 'M 40,60 Q 50,55 60,60'
  },
  error: {
    eyes: 'M 28,35 L 42,45 M 28,45 L 42,35 M 58,35 L 72,45 M 58,45 L 72,35',
    mouth: 'M 35,65 Q 50,55 65,65'
  }
};

function getExpression(state: string): { eyes: string; mouth: string } {
  switch (state) {
    case 'OFF':
    case 'SLEEPING':
      return expressions.sleepy;
    case 'AWAKE':
    case 'LISTENING':
      return expressions.curious;
    case 'SPEAKING':
      return expressions.happy;
    case 'PROCESSING':
      return expressions.thinking;
    case 'ERROR':
      return expressions.error;
    default:
      return expressions.neutral;
  }
}

export const BobiAvatar = observer(function BobiAvatar() {
  const expression = getExpression(bobiStore.state);
  const { pitch, yaw, roll } = bobiStore.headPose;
  
  const transform = `
    perspective(200px)
    rotateX(${pitch}deg)
    rotateY(${yaw}deg)
    rotateZ(${roll}deg)
  `;

  return (
    <div className="bobi-avatar" style={{ transform }}>
      <svg viewBox="0 0 100 100" className="bobi-face">
        {/* Face circle */}
        <circle cx="50" cy="50" r="45" className="face-bg" />
        
        {/* Eyes */}
        <path d={expression.eyes} className="face-feature eyes" />
        
        {/* Mouth */}
        <path d={expression.mouth} className="face-feature mouth" />
        
        {/* Blush when happy */}
        {bobiStore.state === 'ACTIVE_DIALOG' && (
          <>
            <circle cx="25" cy="55" r="6" className="blush" />
            <circle cx="75" cy="55" r="6" className="blush" />
          </>
        )}
      </svg>
    </div>
  );
});
