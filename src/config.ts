/**
 * Cloud config. The Supabase URL and publishable (anon) key are public by
 * design — they ship inside the app, and Row Level Security in the database
 * ensures each user can only touch their own rows. Env vars override them.
 */
export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL || 'https://ybzfvipjezwoyfjnqxmg.supabase.co';

export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_yHVsF0acBCSpJpQVO9hcag_fbl0XPJY';

// VITE_LOCAL_ONLY=1 builds a cloud-free version (used for screenshots and offline testing).
export const CLOUD_ENABLED = !import.meta.env.VITE_LOCAL_ONLY && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

