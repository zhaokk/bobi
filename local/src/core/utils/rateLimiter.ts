/**
 * Rate Limiter Utilities
 * Implements cooldown and sliding window rate limiting
 */

export class Cooldown {
  private lastAction: number = 0;

  constructor(private cooldownMs: number) {}

  canAct(): boolean {
    return Date.now() - this.lastAction >= this.cooldownMs;
  }

  act(): boolean {
    if (!this.canAct()) return false;
    this.lastAction = Date.now();
    return true;
  }

  remaining(): number {
    return Math.max(0, this.cooldownMs - (Date.now() - this.lastAction));
  }

  reset(): void {
    this.lastAction = 0;
  }
}

export class SlidingWindowCounter {
  private timestamps: number[] = [];

  constructor(
    private maxCount: number,
    private windowMs: number
  ) {}

  canAct(): boolean {
    this.cleanup();
    return this.timestamps.length < this.maxCount;
  }

  act(): boolean {
    if (!this.canAct()) return false;
    this.timestamps.push(Date.now());
    return true;
  }

  count(): number {
    this.cleanup();
    return this.timestamps.length;
  }

  private cleanup(): void {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
  }

  reset(): void {
    this.timestamps = [];
  }
}

export class Cache<T> {
  private value: T | null = null;
  private timestamp: number = 0;

  constructor(private freshnessMs: number) {}

  get(): T | null {
    if (this.value !== null && Date.now() - this.timestamp < this.freshnessMs) {
      return this.value;
    }
    return null;
  }

  set(value: T): void {
    this.value = value;
    this.timestamp = Date.now();
  }

  invalidate(): void {
    this.value = null;
    this.timestamp = 0;
  }
}
