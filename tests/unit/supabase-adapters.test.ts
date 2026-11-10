import { describe, expect, it, vi } from 'vitest';
import { toCustomerWashEntry, toIstDate, washStatusCodec, customerStatusCodec } from '@/services/supabase/mappers';
import { toDomainError, unwrap } from '@/services/supabase/errors';
import { PhotoGatewayClient } from '@/services/supabase/photoGatewayClient';
import { SIGNED_URL_TTL_SECONDS } from '@/constants';
import { DomainError } from '@/utils/errors';

describe('enum mapping', () => {
  it('round-trips lower_snake database values', () => {
    expect(washStatusCodec.fromDb('vehicle_not_present')).toBe('VEHICLE_NOT_PRESENT');
    expect(washStatusCodec.toDb('COMPLETED')).toBe('completed');
    expect(customerStatusCodec.fromDb('pending_approval')).toBe('PENDING_APPROVAL');
  });

  it('rejects values the app does not know', () => {
    expect(() => washStatusCodec.fromDb('done')).toThrow(DomainError);
  });
});

describe('rule 7: resident gallery entries', () => {
  it('keeps only date, status and photo id — no time or cleaner', () => {
    const row = { date: '2026-11-09T20:15:00Z', status: 'completed', photoId: 'p1', cleanerId: 'c9', cleanerName: 'X' };
    const entry = toCustomerWashEntry(row);
    expect(entry).toEqual({ date: '2026-11-10', status: 'COMPLETED', photoId: 'p1' });
    expect(Object.keys(entry).sort()).toEqual(['date', 'photoId', 'status']);
  });

  it('uses the IST calendar date', () => {
    expect(toIstDate('2026-11-09T18:29:00Z')).toBe('2026-11-09');
    expect(toIstDate('2026-11-09T18:31:00Z')).toBe('2026-11-10');
    expect(toIstDate('2026-11-09')).toBe('2026-11-09');
  });
});

describe('error translation', () => {
  it('maps RLS denials and SQL rule violations', () => {
    expect(toDomainError({ code: '42501', message: 'permission denied' }).code).toBe('FORBIDDEN');
    expect(toDomainError({ code: 'P0001', message: 'A photo is required.' }).message).toBe('A photo is required.');
    expect(toDomainError({ code: 'XX000', message: 'internal detail' }).message).not.toContain('internal');
  });

  it('unwrap throws on error or missing data', () => {
    expect(unwrap({ data: 1, error: null })).toBe(1);
    expect(() => unwrap({ data: null, error: null })).toThrow(DomainError);
  });
});

describe('R2 photo gateway client', () => {
  function fakeFetch() {
    const calls: Array<{ url: string; method: string; auth: string | null }> = [];
    const impl = vi.fn(async (url: string, init: RequestInit) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      calls.push({ url, method: init.method ?? 'GET', auth: headers.Authorization ?? null });
      if (url.endsWith('/v1/uploads')) return new Response(JSON.stringify({ uploadUrl: 'https://gw.example/v1/objects/k?t=x' }));
      if (init.method === 'PUT') return new Response(JSON.stringify({ photoId: 'p1' }), { status: 201 });
      if (url.includes('/view-url')) return new Response(JSON.stringify({ url: 'https://gw.example/v1/objects/k?t=y', expiresAt: '2026-11-10T00:15:00Z' }));
      return new Response('{}', { status: 404 });
    });
    return { calls, impl: impl as unknown as typeof fetch };
  }

  it('rule 3: refuses an empty, non-image or oversized photo before any request', async () => {
    const { calls, impl } = fakeFetch();
    const gw = new PhotoGatewayClient('https://gw.example', async () => 'jwt', impl);
    await expect(gw.uploadAfterWashPhoto('j1', new Blob([], { type: 'image/jpeg' }))).rejects.toThrow(DomainError);
    await expect(gw.uploadAfterWashPhoto('j1', new Blob(['x'], { type: 'text/plain' }))).rejects.toThrow(DomainError);
    await expect(gw.uploadAfterWashPhoto('j1', new Blob([new Uint8Array(151 * 1024)], { type: 'image/webp' }))).rejects.toThrow(DomainError);
    expect(calls).toHaveLength(0);
  });

  it('gets a signed upload URL with the user JWT, then PUTs the photo', async () => {
    const { calls, impl } = fakeFetch();
    const gw = new PhotoGatewayClient('https://gw.example', async () => 'jwt', impl);
    expect(await gw.uploadAfterWashPhoto('j1', new Blob(['x'], { type: 'image/webp' }))).toBe('p1');
    expect(calls.map((c) => [c.method, c.auth])).toEqual([['POST', 'Bearer jwt'], ['PUT', null]]);
    expect((await gw.viewUrl('p1')).url).toContain('/v1/objects/');
  });

  it('uses a 15-minute signed URL lifetime', () => {
    expect(SIGNED_URL_TTL_SECONDS).toBe(900);
  });
});
