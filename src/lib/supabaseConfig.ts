const defaultProjectRef = 'elqiycppfiafleglqkla';

export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? `https://${defaultProjectRef}.supabase.co`;

export const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable_bs56HMnwXIHm2XQOOwCh9A_PQjjGW-5';

export const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey);
