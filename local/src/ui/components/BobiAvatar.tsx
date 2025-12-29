/**
 * Bobi Avatar Component - 3D Head with 2D Face (like Nomi)
 * 3D dark sphere that rotates, with flat 2D facial expressions on front
 * LLM sets the mood, code randomly selects expression variant + head pose
 * Falls back to pure SVG if WebGL is unavailable
 */

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { bobiStore } from '../../core/store';
import type { Mood } from '../../core/types';
import * as THREE from 'three';

// ============== SVG Expression Data ==============
// 2D SVG paths for facial expressions - displayed flat on the 3D sphere
const MOOD_EXPRESSIONS: Record<Mood, Array<{ eyes: string; mouth: string; blush?: boolean }>> = {
  happy: [
    { eyes: 'M 25,42 Q 35,28 45,42 M 55,42 Q 65,28 75,42', mouth: 'M 25,58 Q 50,80 75,58', blush: true },
    { eyes: 'M 26,40 Q 35,30 44,38 M 56,38 Q 65,30 74,40', mouth: 'M 28,55 Q 50,78 72,55', blush: true },
    { eyes: 'M 24,44 Q 35,32 46,44 M 54,44 Q 65,32 76,44', mouth: 'M 22,55 Q 50,82 78,55', blush: true }
  ],
  sad: [
    { eyes: 'M 28,36 Q 35,42 42,40 M 58,40 Q 65,42 72,36', mouth: 'M 32,68 Q 50,55 68,68' },
    { eyes: 'M 26,35 Q 35,40 44,38 M 56,38 Q 65,40 74,35', mouth: 'M 35,66 Q 50,56 65,66' },
    { eyes: 'M 28,34 Q 34,42 42,38 M 58,40 Q 66,44 72,36', mouth: 'M 30,68 Q 50,54 70,68' }
  ],
  curious: [
    { eyes: 'M 26,38 Q 35,30 44,38 M 56,42 Q 65,50 74,42', mouth: 'M 42,62 Q 50,70 58,62 Q 50,75 42,62' },
    { eyes: 'M 25,40 Q 35,32 45,40 M 55,40 Q 65,32 75,40', mouth: 'M 38,60 Q 50,68 62,60' },
    { eyes: 'M 24,36 Q 35,28 46,36 M 54,42 Q 65,46 76,42', mouth: 'M 40,62 A 12,12 0 0 0 60,62' }
  ],
  surprised: [
    { eyes: 'M 28,38 A 10,10 0 1 1 42,38 A 10,10 0 1 1 28,38 M 58,38 A 10,10 0 1 1 72,38 A 10,10 0 1 1 58,38', mouth: 'M 40,62 A 12,12 0 1 1 60,62 A 12,12 0 1 1 40,62' },
    { eyes: 'M 26,35 A 9,9 0 1 1 44,35 A 9,9 0 1 1 26,35 M 56,35 A 9,9 0 1 1 74,35 A 9,9 0 1 1 56,35', mouth: 'M 38,60 A 14,14 0 1 1 62,60 A 14,14 0 1 1 38,60' },
    { eyes: 'M 27,36 A 8,10 0 1 1 43,36 A 8,10 0 1 1 27,36 M 57,36 A 8,10 0 1 1 73,36 A 8,10 0 1 1 57,36', mouth: 'M 42,64 A 10,10 0 1 1 58,64 A 10,10 0 1 1 42,64' }
  ],
  sleepy: [
    { eyes: 'M 26,42 Q 35,40 44,42 M 56,42 Q 65,40 74,42', mouth: 'M 38,58 Q 50,52 62,58' },
    { eyes: 'M 28,44 Q 35,42 42,44 M 58,44 Q 65,42 72,44', mouth: 'M 40,60 Q 50,56 60,60' },
    { eyes: 'M 27,43 Q 35,41 43,43 M 57,43 Q 65,41 73,43', mouth: 'M 42,58 Q 50,62 58,58' }
  ],
  neutral: [
    { eyes: 'M 28,40 Q 35,36 42,40 M 58,40 Q 65,36 72,40', mouth: 'M 35,60 Q 50,66 65,60' },
    { eyes: 'M 27,40 Q 35,35 43,40 M 57,40 Q 65,35 73,40', mouth: 'M 36,60 Q 50,65 64,60' },
    { eyes: 'M 26,39 Q 35,34 44,39 M 56,39 Q 65,34 74,39', mouth: 'M 38,60 Q 50,64 62,60' }
  ]
};

// Head pose variants (exported for store.ts)
export const MOOD_HEAD_POSES: Record<Mood, Array<{ yaw: number; pitch: number; roll: number }>> = {
  happy: [
    { yaw: 0, pitch: -8, roll: 0 },
    { yaw: 15, pitch: -5, roll: 8 },
    { yaw: -15, pitch: -5, roll: -8 },
  ],
  sad: [
    { yaw: 0, pitch: 15, roll: 0 },
    { yaw: -8, pitch: 12, roll: -5 },
    { yaw: 8, pitch: 18, roll: 5 },
  ],
  curious: [
    { yaw: 25, pitch: -8, roll: 12 },
    { yaw: -25, pitch: -8, roll: -12 },
    { yaw: 0, pitch: -15, roll: 18 },
  ],
  surprised: [
    { yaw: 0, pitch: -12, roll: 0 },
    { yaw: -8, pitch: -15, roll: -5 },
    { yaw: 8, pitch: -15, roll: 5 },
  ],
  sleepy: [
    { yaw: 0, pitch: 12, roll: 0 },
    { yaw: -5, pitch: 8, roll: -15 },
    { yaw: 5, pitch: 8, roll: 15 },
  ],
  neutral: [
    { yaw: 0, pitch: 0, roll: 0 },
    { yaw: 5, pitch: -3, roll: 0 },
    { yaw: -5, pitch: -3, roll: 0 },
  ]
};

// ============== Helper Functions ==============
function getExpression(): { eyes: string; mouth: string; blush?: boolean } {
  const { mood, expression } = bobiStore.deviceState;
  const moodExpressions = MOOD_EXPRESSIONS[mood] || MOOD_EXPRESSIONS.neutral;
  const variantIndex = parseInt(expression?.split('_')[1] || '0', 10);
  return moodExpressions[variantIndex % moodExpressions.length];
}

function degToRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// ============== 3D Components ==============

// 2D Face SVG component - rendered on the front of the 3D sphere
function Face2D({ expression }: { expression: { eyes: string; mouth: string; blush?: boolean } }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      style={{ 
        width: 90, 
        height: 90,
        pointerEvents: 'none',
      }}
    >
      {/* Eyes */}
      <path 
        d={expression.eyes} 
        fill="none" 
        stroke="white" 
        strokeWidth="3" 
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: 'd 0.3s ease-in-out' }}
      />
      {/* Mouth */}
      <path 
        d={expression.mouth} 
        fill="none" 
        stroke="white" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: 'd 0.3s ease-in-out' }}
      />
      {/* Blush */}
      {expression.blush && (
        <>
          <circle cx="20" cy="55" r="6" fill="rgba(255,150,150,0.4)" />
          <circle cx="80" cy="55" r="6" fill="rgba(255,150,150,0.4)" />
        </>
      )}
    </svg>
  );
}

// Main 3D head component with rotating dark sphere and flat 2D face
// Supports both mood-based auto-rotation and manual drag interaction
function BobiHead3D({ isDragging, dragRotation }: { isDragging: boolean; dragRotation: { x: number; y: number } }) {
  const groupRef = useRef<THREE.Group>(null);
  const expression = getExpression();
  const { pitch, yaw, roll } = bobiStore.deviceState.headPose;
  
  // Smooth rotation animation - blend between mood pose and drag rotation
  useFrame(() => {
    if (groupRef.current) {
      let targetX: number, targetY: number, targetZ: number;
      
      if (isDragging) {
        // When dragging, use drag rotation
        targetX = dragRotation.x;
        targetY = dragRotation.y;
        targetZ = 0;
      } else {
        // When not dragging, use mood-based rotation
        targetX = degToRad(pitch);
        targetY = degToRad(-yaw);
        targetZ = degToRad(roll);
      }
      
      const lerpFactor = isDragging ? 0.15 : 0.08;
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetX, lerpFactor);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetY, lerpFactor);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, targetZ, lerpFactor);
    }
  });
  
  return (
    <group ref={groupRef}>
      {/* Dark sphere body - like Nomi's black head */}
      <mesh>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial 
          color="#1a1a2e" 
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>
      
      {/* 2D Face on front - using Html from drei */}
      <Html
        transform
        occlude
        position={[0, 0, 1.01]}
        style={{
          width: 90,
          height: 90,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        center
      >
        <Face2D expression={expression} />
      </Html>
    </group>
  );
}

// ============== WebGL Detection ==============
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

// ============== SVG Fallback ==============
const SVGFallbackAvatar = observer(function SVGFallbackAvatar() {
  const expression = getExpression();
  const { pitch, yaw, roll } = bobiStore.deviceState.headPose;
  const { brightness, mood } = bobiStore.deviceState;
  
  const transform = `perspective(200px) rotateX(${pitch}deg) rotateY(${yaw}deg) rotateZ(${roll}deg)`;
  const faceOpacity = 0.3 + (brightness / 100) * 0.7;

  return (
    <div className="bobi-avatar" style={{ transform, opacity: faceOpacity }}>
      <svg viewBox="0 0 100 100" className="bobi-face">
        <circle cx="50" cy="50" r="45" className="face-bg" />
        <path d={expression.eyes} className="face-feature eyes" />
        <path d={expression.mouth} className="face-feature mouth" />
        {expression.blush && (
          <>
            <circle cx="22" cy="55" r="7" className="blush" />
            <circle cx="78" cy="55" r="7" className="blush" />
          </>
        )}
        <text x="50" y="95" textAnchor="middle" className="mood-label">{mood}</text>
      </svg>
    </div>
  );
});

// ============== Main Component ==============
export const BobiAvatar = observer(function BobiAvatar() {
  const [webglAvailable, setWebglAvailable] = useState(true);
  const { volume, brightness, mood } = bobiStore.deviceState;
  
  // Drag state for manual rotation
  const [isDragging, setIsDragging] = useState(false);
  const [dragRotation, setDragRotation] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0, rotX: 0, rotY: 0 });
  const lastInteractionRef = useRef<number>(0);
  
  useEffect(() => {
    setWebglAvailable(isWebGLAvailable());
  }, []);
  
  // Return to mood pose after drag ends (with delay)
  useEffect(() => {
    if (!isDragging && lastInteractionRef.current > 0) {
      const timeout = setTimeout(() => {
        setDragRotation({ x: 0, y: 0 });
      }, 2000); // Return to mood pose after 2 seconds
      return () => clearTimeout(timeout);
    }
  }, [isDragging]);
  
  // Mouse/touch handlers for dragging
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      rotX: dragRotation.x,
      rotY: dragRotation.y,
    };
  }, [dragRotation]);
  
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    
    // Convert mouse movement to rotation (with limits)
    const sensitivity = 0.01;
    const maxRotation = Math.PI / 3; // 60 degrees max
    
    const newRotY = Math.max(-maxRotation, Math.min(maxRotation, 
      dragStartRef.current.rotY + deltaX * sensitivity));
    const newRotX = Math.max(-maxRotation, Math.min(maxRotation, 
      dragStartRef.current.rotX + deltaY * sensitivity));
    
    setDragRotation({ x: newRotX, y: newRotY });
    lastInteractionRef.current = Date.now();
  }, [isDragging]);
  
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }, []);

  // Brightness affects ambient light intensity
  const ambientIntensity = 0.3 + (brightness / 100) * 0.5;

  return (
    <div className="bobi-avatar-container">
      {/* Volume indicator on left */}
      <div className="device-indicator volume-indicator">
        <span className="indicator-icon">🔊</span>
        <div className="indicator-bar-container">
          <div className="indicator-bar" style={{ height: `${volume}%` }} />
        </div>
        <span className="indicator-value">{volume}</span>
      </div>

      {/* Bobi Face - 3D or SVG fallback */}
      {webglAvailable ? (
        <div 
          className="bobi-avatar-3d"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          <Canvas camera={{ position: [0, 0, 2.8], fov: 50 }}>
            <ambientLight intensity={ambientIntensity} />
            <directionalLight position={[2, 2, 3]} intensity={0.6} />
            <Suspense fallback={null}>
              <BobiHead3D isDragging={isDragging} dragRotation={dragRotation} />
            </Suspense>
          </Canvas>
          <div className="mood-label-3d">{mood}</div>
        </div>
      ) : (
        <SVGFallbackAvatar />
      )}

      {/* Brightness indicator on right */}
      <div className="device-indicator brightness-indicator">
        <span className="indicator-icon">☀️</span>
        <div className="indicator-bar-container">
          <div className="indicator-bar" style={{ height: `${brightness}%` }} />
        </div>
        <span className="indicator-value">{brightness}</span>
      </div>
    </div>
  );
});
