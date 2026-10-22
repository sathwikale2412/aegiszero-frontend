import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/**
 * Ask the serverless dispatcher to call Workato. The bearer token is the caller's own
 * Supabase session, which the function verifies before it forwards anything.
 */
export async function dispatch(kind, payload) {
  let token = '';
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? '';
  }
  const response = await fetch(`${API_BASE}/dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ kind, payload }),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`The dispatch service replied ${response.status}.`);
  }
  if (!response.ok || data.status !== 'ok') {
    const suffix = data?.request_id ? ` (ref ${data.request_id})` : '';
    throw new Error(`${data?.message ?? 'The dispatch failed.'}${suffix}`);
  }
  return data;
}

export async function fetchPipelineHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) return { pipeline: 'unreachable', auth: 'unreachable' };
    return await response.json();
  } catch {
    return { pipeline: 'unreachable', auth: 'unreachable' };
  }
}

export async function recordLogin(userId, email) {
  if (!supabase) return;
  const { error } = await supabase.from('aegis_logins').insert({ user_id: userId, email });
  if (error) console.error('Failed to record sign-in', error.message);
}

export async function fetchLoginHistory(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('aegis_logins')
    .select('email, logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(25);
  if (error) {
    console.error('Failed to load sign-in history', error.message);
    return [];
  }
  return data ?? [];
}

// Resolves true when there is nothing to fail: guest mode never claims to persist.
export async function pushAuditEvent(userId, event) {
  if (!supabase) return true;
  const { error } = await supabase.from('aegis_audit_events').insert({
    user_id: userId,
    event_type: event.type,
    message: event.msg,
    payload: event.payload ?? {},
  });
  if (error) {
    console.error('Failed to persist audit event', error.message);
    return false;
  }
  return true;
}

export async function fetchAuditEvents(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('aegis_audit_events')
    .select('id, event_type, message, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('Failed to load audit history', error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: `DB-${row.id}`,
    time: new Date(row.created_at).toLocaleTimeString(),
    type: row.event_type,
    msg: row.message,
  }));
}
