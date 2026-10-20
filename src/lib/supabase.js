import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const workatoWebhookUrl = import.meta.env.VITE_WORKATO_WEBHOOK_URL || '';

export const isPipelineConfigured = Boolean(workatoWebhookUrl);
