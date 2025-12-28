/**
 * DVR Recorder Module
 * Handles ring-buffer style recording for front/rear cameras
 * 
 * TODO: Replace mock implementation with real hardware integration
 * - Integrate with actual camera hardware (V4L2, GStreamer, etc.)
 * - Write to local storage with proper codec (H.264/H.265)
 * - Implement actual ring buffer file rotation
 */

import { logger } from '../utils/logger.js';
import { ENV } from '../config/env.js';
import type { CameraType } from '../types/index.js';

interface Segment {
  id: string;
  camera: CameraType;
  startTime: number;
  endTime: number | null;
  filePath: string;  // Mock: just a path string
}

class CameraRecorder {
  private segments: Segment[] = [];
  private currentSegment: Segment | null = null;
  private isRecording = false;
  private segmentTimer: NodeJS.Timeout | null = null;

  constructor(private camera: CameraType) {}

  start(): void {
    if (this.isRecording) return;
    this.isRecording = true;
    logger.info('DVR', `Started recording: ${this.camera} camera`);
    this.startNewSegment();
  }

  stop(): void {
    if (!this.isRecording) return;
    this.isRecording = false;
    if (this.segmentTimer) {
      clearTimeout(this.segmentTimer);
      this.segmentTimer = null;
    }
    if (this.currentSegment) {
      this.currentSegment.endTime = Date.now();
      logger.info('DVR', `Closed segment: ${this.currentSegment.id}`);
    }
    logger.info('DVR', `Stopped recording: ${this.camera} camera`);
  }

  private startNewSegment(): void {
    if (!this.isRecording) return;

    // Close current segment
    if (this.currentSegment) {
      this.currentSegment.endTime = Date.now();
    }

    // Create new segment
    const id = `${this.camera}_${Date.now()}`;
    this.currentSegment = {
      id,
      camera: this.camera,
      startTime: Date.now(),
      endTime: null,
      // TODO: Replace with actual file path on device storage
      filePath: `/mock/dvr/${this.camera}/${id}.mp4`,
    };
    this.segments.push(this.currentSegment);
    logger.debug('DVR', `New segment: ${id}`, { camera: this.camera });

    // Rotate old segments (ring buffer)
    while (this.segments.length > ENV.DVR_MAX_SEGMENTS) {
      const removed = this.segments.shift();
      if (removed) {
        logger.debug('DVR', `Rotated out segment: ${removed.id}`);
        // TODO: Actually delete the file from storage
      }
    }

    // Schedule next segment
    this.segmentTimer = setTimeout(() => {
      this.startNewSegment();
    }, ENV.DVR_SEGMENT_DURATION_MS);
  }

  getSegments(): Segment[] {
    return [...this.segments];
  }

  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Save current segment as event clip (e.g., for IMU L2 collision event)
   * TODO: Implement actual clip extraction from video file
   */
  saveEventClip(eventId: string, beforeMs: number = 30000, afterMs: number = 10000): string {
    const clipPath = `/mock/dvr/events/${eventId}_${this.camera}.mp4`;
    logger.info('DVR', `Saving event clip: ${clipPath}`, { 
      eventId, 
      camera: this.camera,
      beforeMs,
      afterMs 
    });
    // TODO: Extract clip from ring buffer segments
    return clipPath;
  }
}

class DVRRecorder {
  private frontCamera: CameraRecorder;
  private rearCamera: CameraRecorder;

  constructor() {
    this.frontCamera = new CameraRecorder('front');
    this.rearCamera = new CameraRecorder('rear');
  }

  startRecording(): void {
    this.frontCamera.start();
    this.rearCamera.start();
    logger.info('DVR', 'DVR recording started (front + rear)');
  }

  stopRecording(): void {
    this.frontCamera.stop();
    this.rearCamera.stop();
    logger.info('DVR', 'DVR recording stopped');
  }

  isRecording(): boolean {
    return this.frontCamera.isActive() && this.rearCamera.isActive();
  }

  getCamera(type: CameraType): CameraRecorder {
    return type === 'front' ? this.frontCamera : this.rearCamera;
  }

  /**
   * Save event clips from both cameras
   */
  saveEventClips(eventId: string): { front: string; rear: string } {
    return {
      front: this.frontCamera.saveEventClip(eventId),
      rear: this.rearCamera.saveEventClip(eventId),
    };
  }
}

// Singleton instance
export const dvrRecorder = new DVRRecorder();
