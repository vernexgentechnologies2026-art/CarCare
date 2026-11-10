// @vitest-environment node
import { describe, expect, it } from 'vitest';
import verifySql from '../../supabase/verify.sql?raw';
import { createDatabase } from './pglite';

describe('supabase/verify.sql', () => {
  it('reports every table, policy and function check as ok on a freshly migrated database', async () => {
    const db = await createDatabase();
    const { rows } = await db.query<{ check: string; ok: boolean; detail: string }>(verifySql);
    // pg_cron is not available locally; everything else must pass
    const failing = rows.filter((r) => !r.ok && !r.check.startsWith('cron:'));
    expect(failing).toEqual([]);
    expect(rows.filter((r) => r.check.startsWith('table ')).length).toBe(12);
  }, 60_000);
});
