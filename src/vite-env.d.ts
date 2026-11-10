/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: 'mock' | 'supabase';
  /** Show the dev role switcher outside `vite dev` (e.g. a client review build). */
  readonly VITE_ENABLE_DEV_TOOLS?: 'true' | 'false';
  /** Public project URL — required when VITE_DATA_SOURCE=supabase. */
  readonly VITE_SUPABASE_URL?: string;
  /** Public anon key (RLS-restricted). Never put a service-role key in a VITE_ variable. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Public URL of the R2 photo gateway Worker (workers/photo-gateway). */
  readonly VITE_PHOTO_GATEWAY_URL?: string;
  /** Domain for the internal sign-in addresses (<mobile>@domain). Optional. */
  readonly VITE_AUTH_EMAIL_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
