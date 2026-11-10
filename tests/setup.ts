import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Newer Node versions expose a native (file-backed, often disabled) `localStorage`
 * global that shadows jsdom's. Install a deterministic in-memory Storage instead.
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });

/**
 * React Router's data router builds `new Request(url, { signal })` on navigation.
 * Under jsdom the signal is jsdom's AbortSignal, which Node's undici `Request`
 * rejects. The app has no loaders/actions, so drop the signal in tests.
 */
const NativeRequest = globalThis.Request;
class TestRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const { signal: _signal, ...rest } = init ?? {};
    void _signal;
    super(input, rest);
  }
}
globalThis.Request = TestRequest as typeof Request;

// jsdom does not implement object URLs (used for photo previews).
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:test-preview';
  URL.revokeObjectURL = () => undefined;
}

afterEach(() => {
  cleanup();
  globalThis.localStorage.clear();
});
