import { describe, expect, it, vi } from 'vitest';
import { installChunkRecovery } from '@/app/chunkRecovery';

function setup() {
  const target = new EventTarget() as unknown as Window;
  const reload = vi.fn();
  let clock = 1_000_000;
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  installChunkRecovery(target, reload, () => clock, storage);
  const fail = () => {
    const e = new Event('vite:preloadError', { cancelable: true });
    (target as unknown as EventTarget).dispatchEvent(e);
    return e;
  };
  return { reload, fail, advance: (ms: number) => (clock += ms) };
}

describe('stale-release recovery', () => {
  it('reloads once when a screen chunk from the previous release is gone', () => {
    const { reload, fail } = setup();
    const e = fail();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('does not loop: a second failure within a minute shows the error screen instead', () => {
    const { reload, fail, advance } = setup();
    fail();
    advance(5_000);
    const second = fail();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
    advance(60_000);
    fail();
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
