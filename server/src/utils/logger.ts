/**
 * Logger Utility
 * Traces all events with timestamps and turn IDs
 * Saves logs to file for debugging
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log file setup
const LOG_DIR = path.resolve(__dirname, '../../../logs');
const LOG_FILE = path.join(LOG_DIR, `bobi-${new Date().toISOString().slice(0, 10)}.log`);

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (e) {
  console.error('Failed to create log directory:', e);
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
  ts: number;
  turnId?: string;
}

// Event listeners for log streaming to clients
type LogListener = (entry: LogEntry) => void;
const listeners: Set<LogListener> = new Set();

export function addLogListener(listener: LogListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().slice(11, 23); // HH:mm:ss.SSS
}

// Simplify data for logging (truncate long base64 strings)
function simplifyData(data: unknown): unknown {
  if (data === undefined || data === null) return data;
  
  if (typeof data === 'string') {
    // Truncate long base64 audio strings
    if (data.length > 100 && /^[A-Za-z0-9+/=]+$/.test(data)) {
      return `[base64 ${data.length} chars]`;
    }
    return data.length > 500 ? data.slice(0, 500) + '...' : data;
  }
  
  if (typeof data === 'object') {
    if (Array.isArray(data)) {
      return data.slice(0, 10).map(simplifyData);
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      // Special handling for audio fields
      if (key === 'audio' || key === 'delta') {
        if (typeof value === 'string' && value.length > 50) {
          result[key] = `[base64 ${value.length} chars]`;
        } else {
          result[key] = value;
        }
      } else {
        result[key] = simplifyData(value);
      }
    }
    return result;
  }
  
  return data;
}

function emit(entry: LogEntry): void {
  const prefix = `[${formatTime(entry.ts)}] [${entry.level}] [${entry.category}]`;
  const turnInfo = entry.turnId ? ` (turn:${entry.turnId.slice(0, 8)})` : '';
  
  const logFn = entry.level === 'ERROR' ? console.error :
                entry.level === 'WARN' ? console.warn :
                console.log;
  
  // Simplify data for console output
  const simplifiedData = simplifyData(entry.data);
  
  if (simplifiedData !== undefined) {
    logFn(`${prefix}${turnInfo} ${entry.message}`, simplifiedData);
  } else {
    logFn(`${prefix}${turnInfo} ${entry.message}`);
  }

  // Write simplified data to file
  try {
    const dataStr = simplifiedData !== undefined ? ` ${JSON.stringify(simplifiedData)}` : '';
    const line = `${prefix}${turnInfo} ${entry.message}${dataStr}\n`;
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {
    // Ignore file write errors
  }

  // Notify listeners (with simplified data)
  listeners.forEach(l => l({ ...entry, data: simplifiedData }));
}

export function debug(category: string, message: string, data?: unknown, turnId?: string): void {
  if (!ENV.DEBUG) return;
  emit({ level: 'DEBUG', category, message, data, ts: Date.now(), turnId });
}

export function info(category: string, message: string, data?: unknown, turnId?: string): void {
  emit({ level: 'INFO', category, message, data, ts: Date.now(), turnId });
}

export function warn(category: string, message: string, data?: unknown, turnId?: string): void {
  emit({ level: 'WARN', category, message, data, ts: Date.now(), turnId });
}

export function error(category: string, message: string, data?: unknown, turnId?: string): void {
  emit({ level: 'ERROR', category, message, data, ts: Date.now(), turnId });
}

export const logger = { debug, info, warn, error, addLogListener };
