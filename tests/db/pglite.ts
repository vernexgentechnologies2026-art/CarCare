import { PGlite } from '@electric-sql/pglite';
import m001 from '../../supabase/migrations/001_initial_schema.sql?raw';
import m002 from '../../supabase/migrations/002_rls_policies.sql?raw';
import m003 from '../../supabase/migrations/003_photo_retention_cron.sql?raw';
import m004 from '../../supabase/migrations/004_app_api.sql?raw';
import m005 from '../../supabase/migrations/005_security_and_capacity.sql?raw';

/**
 * Minimal stand-ins for what Supabase provides before any migration runs:
 * the anon / authenticated / service_role roles, auth.users and auth.uid()
 * (which, like Supabase, reads the JWT `sub` claim from the request settings).
 */
const SUPABASE_BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
`;

export const MIGRATIONS = { m001, m002, m003, m004, m005 };

export async function createDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_BOOTSTRAP);
  await db.exec(m001);
  await db.exec(m002);
  await db.exec(m003);
  await db.exec(m004);
  await db.exec(m005);
  return db;
}

/** Runs the following statements as a signed-in user (RLS applies). */
export async function asUser(db: PGlite, userId: string): Promise<void> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId}', false); set role authenticated;`);
}

export async function asAnon(db: PGlite): Promise<void> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
}

/**
 * Test-only role: a member of `authenticated` that also has table SELECT, so the
 * RLS policies (the second layer behind the function-only API) can be verified.
 */
export async function asPolicyProbe(db: PGlite, userId: string): Promise<void> {
  await db.exec(`reset role;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'rls_probe') then
        create role rls_probe nologin;
        grant authenticated to rls_probe;
        grant select on all tables in schema public to rls_probe;
      end if;
    end $$;
    select set_config('request.jwt.claim.sub', '${userId}', false); set role rls_probe;`);
}

/** The Worker / Edge Function identity (bypasses RLS, never in the browser). */
export async function asService(db: PGlite): Promise<void> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;`);
}

/** Migration owner (postgres), used only to seed fixtures. */
export async function asOwner(db: PGlite): Promise<void> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
}

export async function rows<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

export async function one<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const [row] = await rows<T>(db, sql, params);
  if (!row) throw new Error(`no row for: ${sql}`);
  return row;
}
