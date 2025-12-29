/**
 * Bobi Avatar Component
 * SVG face with mood-based expressions (multiple variants per mood)
 * LLM sets the mood, code randomly selects expression variant
 */

import { observer } from 'mobx-react-lite';
import { bobiStore } from '../../core/store';
import type { Mood } from '../../core/types';

// Expression variants for each mood - more obvious/exaggerated facial features
const MOOD_EXPRESSIONS: Record<Mood, Array<{ eyes: string; mouth: string; blush?: boolean }>> = {
  happy: [
    { // Big smile, curved happy eyes
      eyes: 'M 25,42 Q 35,28 45,42 M 55,42 Q 65,28 75,42',
      mouth: 'M 25,58 Q 50,80 75,58',
      blush: true
    },
    { // Cheerful, slightly tilted eyes
      eyes: 'M 26,40 Q 35,30 44,38 M 56,38 Q 65,30 74,40',
      mouth: 'M 28,55 Q 50,78 72,55',
      blush: true
    },
    { // Excited, wide smile
      eyes: 'M 24,44 Q 35,32 46,44 M 54,44 Q 65,32 76,44',
      mouth: 'M 22,55 Q 50,82 78,55',
      blush: true
    }
  ],
  sad: [
    { // Droopy eyes, frown
      eyes: 'M 28,36 Q 35,42 42,40 M 58,40 Q 65,42 72,36',
      mouth: 'M 32,68 Q 50,55 68,68'
    },
    { // Worried, slight frown
      eyes: 'M 26,35 Q 35,40 44,38 M 56,38 Q 65,40 74,35',
      mouth: 'M 35,66 Q 50,56 65,66'
    },
    { // Concerned, asymmetric
      eyes: 'M 28,34 Q 34,42 42,38 M 58,40 Q 66,44 72,36',
      mouth: 'M 30,68 Q 50,54 70,68'
    }
  ],
  curious: [
    { // One eyebrow raised, small o mouth
      eyes: 'M 26,38 Q 35,30 44,38 M 56,42 Q 65,50 74,42',
      mouth: 'M 42,62 Q 50,70 58,62 Q 50,75 42,62'
    },
    { // Wide eyes, slight smile
      eyes: 'M 25,40 Q 35,32 45,40 M 55,40 Q 65,32 75,40',
      mouth: 'M 38,60 Q 50,68 62,60'
    },
    { // Tilted head look, inquisitive
      eyes: 'M 24,36 Q 35,28 46,36 M 54,42 Q 65,46 76,42',
      mouth: 'M 40,62 A 12,12 0 0 0 60,62'
    }
  ],
  surprised: [
    { // Wide open eyes and mouth
      eyes: 'M 28,38 A 10,10 0 1 1 42,38 A 10,10 0 1 1 28,38 M 58,38 A 10,10 0 1 1 72,38 A 10,10 0 1 1 58,38',
      mouth: 'M 40,62 A 12,12 0 1 1 60,62 A 12,12 0 1 1 40,62'
    },
    { // Shocked, eyebrows up
      eyes: 'M 26,35 A 9,9 0 1 1 44,35 A 9,9 0 1 1 26,35 M 56,35 A 9,9 0 1 1 74,35 A 9,9 0 1 1 56,35',
      mouth: 'M 38,60 A 14,14 0 1 1 62,60 A 14,14 0 1 1 38,60'
    },
    { // Startled
      eyes: 'M 27,36 A 8,10 0 1 1 43,36 A 8,10 0 1 1 27,36 M 57,36 A 8,10 0 1 1 73,36 A 8,10 0 1 1 57,36',
      mouth: 'M 42,64 A 10,10 0 1 1 58,64 A 10,10 0 1 1 42,64'
    }
  ],
  sleepy: [
    { // Half closed eyes, yawning
      eyes: 'M 26,42 Q 35,40 44,42 M 56,42 Q 65,40 74,42',
      mouth: 'M 38,58 Q 50,52 62,58'
    },
    { // Droopy, relaxed
      eyes: 'M 28,44 Q 35,42 42,44 M 58,44 Q 65,42 72,44',
      mouth: 'M 40,60 Q 50,56 60,60'
    },
    { // Almost asleep, tiny smile
      eyes: 'M 27,43 Q 35,41 43,43 M 57,43 Q 65,41 73,43',
      mouth: 'M 42,58 Q 50,62 58,58'
    }
  ],
  neutral: [
    { // Standard calm face
      eyes: 'M 28,40 Q 35,36 42,40 M 58,40 Q 65,36 72,40',
      mouth: 'M 35,60 Q 50,66 65,60'
    },
    { // Slightly content
      eyes: 'M 27,40 Q 35,35 43,40 M 57,40 Q 65,35 73,40',
      mouth: 'M 36,60 Q 50,65 64,60'
    },
    { // Attentive
      eyes: 'M 26,39 Q 35,34 44,39 M 56,39 Q 65,34 74,39',
      mouth: 'M 38,60 Q 50,64 62,60'
    }
  ]
};

// Error expression (special case)
const ERROR_EXPRESSION = {
  eyes: 'M 26,34 L 44,48 M 26,48 L 44,34 M 56,34 L 74,48 M 56,48 L 74,34',
  mouth: 'M 32,68 Q 50,55 68,68'
};

// Head pose variants for each mood (yaw, pitch, roll in degrees)
// Randomly selected when mood changes
export const MOOD_HEAD_POSES: Record<Mood, Array<{ yaw: number; pitch: number; roll: number }>> = {
  happy: [
    { yaw: 0, pitch: -5, roll: 0 },      // Slightly looking up
    { yaw: 8, pitch: -3, roll: 5 },      // Tilted right, cheerful
    { yaw: -8, pitch: -3, roll: -5 },    // Tilted left, playful
  ],
  sad: [
    { yaw: 0, pitch: 10, roll: 0 },      // Looking down
    { yaw: -5, pitch: 8, roll: -3 },     // Down and slightly left
    { yaw: 5, pitch: 12, roll: 3 },      // Down and slightly right
  ],
  curious: [
    { yaw: 15, pitch: -5, roll: 8 },     // Tilted, looking right
    { yaw: -15, pitch: -5, roll: -8 },   // Tilted, looking left
    { yaw: 0, pitch: -10, roll: 12 },    // Head tilt, inquisitive
  ],
  surprised: [
    { yaw: 0, pitch: -8, roll: 0 },      // Looking up, startled
    { yaw: -5, pitch: -10, roll: -3 },   // Slight recoil left
    { yaw: 5, pitch: -10, roll: 3 },     // Slight recoil right
  ],
  sleepy: [
    { yaw: 0, pitch: 8, roll: 0 },       // Drooping forward
    { yaw: -3, pitch: 5, roll: -10 },    // Nodding off left
    { yaw: 3, pitch: 5, roll: 10 },      // Nodding off right
  ],
  neutral: [
    { yaw: 0, pitch: 0, roll: 0 },       // Centered
    { yaw: 3, pitch: -2, roll: 0 },      // Slightly attentive
    { yaw: -3, pitch: -2, roll: 0 },     // Slightly attentive other way
  ]
};

// Get current expression based on mood and expression variant
function getExpression(): { eyes: string; mouth: string; blush?: boolean } {
  const { mood, expression } = bobiStore.deviceState;
  
  // Check for error state first
  if (bobiStore.state === 'ERROR') {
    return ERROR_EXPRESSION;
  }
  
  // Get expressions for current mood
  const moodExpressions = MOOD_EXPRESSIONS[mood] || MOOD_EXPRESSIONS.neutral;
  
  // Try to use the stored expression variant index
  const variantIndex = parseInt(expression?.split('_')[1] || '0', 10);
  const safeIndex = variantIndex % moodExpressions.length;
  
  return moodExpressions[safeIndex];
}

export const BobiAvatar = observer(function BobiAvatar() {
  const expression = getExpression();
  const { pitch, yaw, roll } = bobiStore.headPose;
  const { volume, brightness, mood } = bobiStore.deviceState;
  
  const transform = `
    perspective(200px)
    rotateX(${pitch}deg)
    rotateY(${yaw}deg)
    rotateZ(${roll}deg)
  `;

  // Brightness controls face opacity/brightness (30% at 0, 100% at 100)
  const faceOpacity = 0.3 + (brightness / 100) * 0.7;

  return (
    <div className="bobi-avatar-container">
      {/* Volume indicator on left */}
      <div className="device-indicator volume-indicator">
        <span className="indicator-icon">🔊</span>
        <div className="indicator-bar-container">
          <div 
            className="indicator-bar" 
            style={{ height: `${volume}%` }}
          />
        </div>
        <span className="indicator-value">{volume}</span>
      </div>

      {/* Bobi Face */}
      <div className="bobi-avatar" style={{ transform, opacity: faceOpacity }}>
        <svg viewBox="0 0 100 100" className="bobi-face">
          {/* Face circle */}
          <circle cx="50" cy="50" r="45" className="face-bg" />
          
          {/* Eyes - with CSS transition for animation */}
          <path d={expression.eyes} className="face-feature eyes" />
          
          {/* Mouth - with CSS transition for animation */}
          <path d={expression.mouth} className="face-feature mouth" />
          
          {/* Blush when happy */}
          {expression.blush && (
            <>
              <circle cx="22" cy="55" r="7" className="blush" />
              <circle cx="78" cy="55" r="7" className="blush" />
            </>
          )}
          
          {/* Mood indicator text */}
          <text x="50" y="95" textAnchor="middle" className="mood-label">{mood}</text>
        </svg>
      </div>

      {/* Brightness indicator on right */}
      <div className="device-indicator brightness-indicator">
        <span className="indicator-icon">☀️</span>
        <div className="indicator-bar-container">
          <div 
            className="indicator-bar" 
            style={{ height: `${brightness}%` }}
          />
        </div>
        <span className="indicator-value">{brightness}</span>
      </div>
    </div>
  );
});
