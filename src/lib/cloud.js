import { supabase } from './supabase';

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

export async function pushAuditEvent(userId, event) {
  if (!supabase) return;
  const { error } = await supabase.from('aegis_audit_events').insert({
    user_id: userId,
    event_type: event.type,
    message: event.msg,
    payload: event.payload ?? {},
  });
  if (error) console.error('Failed to persist audit event', error.message);
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
