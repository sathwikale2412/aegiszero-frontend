import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

// The Workato webhook URL deliberately has no client-side twin. Anything read through
// import.meta.env is compiled into the public bundle, and that URL carries a tenant token
// that authorises access-revocation calls. It now lives in the dispatch function's
// environment; see api/index.py.
