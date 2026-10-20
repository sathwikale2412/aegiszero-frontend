import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const panel = {
  backgroundColor: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '12px',
  padding: '1.5rem'
};

const fieldLabel = {
  fontSize: '0.75rem',
  fontWeight: '600',
  color: '#94a3b8',
  display: 'block',
  marginBottom: '0.375rem'
};

const input = {
  width: '100%',
  padding: '0.625rem',
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '0.875rem'
};

export default function AuthScreen() {
  const { signIn, signUp, continueAsGuest } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        const hint = await signUp(email.trim(), password, name.trim());
        setNotice(hint || 'Account ready. You are signed in.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const tabStyle = (isActive) => ({
    flex: 1,
    padding: '0.5rem',
    border: 'none',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    backgroundColor: isActive ? '#2563eb' : 'transparent',
    color: isActive ? '#fff' : '#94a3b8'
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#090d16',
        color: '#f1f5f9',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem'
      }}
    >
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: '#3b82f6',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.125rem'
            }}
          >
            🛡️
          </div>
          <div>
            <div style={{ fontWeight: '700', color: '#fff' }}>AegisZero Enterprise</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Sign in to open the governance console</div>
          </div>
        </div>

        <div style={panel}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <button type="button" onClick={() => { setMode('signin'); setError(''); setNotice(''); }} style={tabStyle(mode === 'signin')}>
              Sign in
            </button>
            <button type="button" onClick={() => { setMode('signup'); setError(''); setNotice(''); }} style={tabStyle(mode === 'signup')}>
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {mode === 'signup' && (
              <div>
                <label htmlFor="aegis-name" style={fieldLabel}>Name</label>
                <input id="aegis-name" style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Security administrator" autoComplete="name" />
              </div>
            )}

            <div>
              <label htmlFor="aegis-email" style={fieldLabel}>Work email</label>
              <input id="aegis-email" type="email" required style={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.example" autoComplete="email" />
            </div>

            <div>
              <label htmlFor="aegis-password" style={fieldLabel}>Password</label>
              <input
                id="aegis-password"
                type="password"
                required
                minLength={8}
                style={input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>

            {error && (
              <div style={{ fontSize: '0.75rem', color: '#f87171', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', padding: '0.625rem' }}>
                {error}
              </div>
            )}

            {notice && (
              <div style={{ fontSize: '0.75rem', color: '#34d399', backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '6px', padding: '0.625rem' }}>
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '0.875rem',
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.7 : 1
              }}
            >
              {busy ? 'Working…' : mode === 'signin' ? 'Open console' : 'Create my account'}
            </button>
          </form>

          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #1e293b' }}>
            <button
              type="button"
              onClick={continueAsGuest}
              style={{
                width: '100%',
                padding: '0.625rem',
                backgroundColor: '#1e293b',
                color: '#94a3b8',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Continue as guest (nothing is saved to the cloud)
            </button>
          </div>
        </div>

        <p style={{ fontSize: '0.6875rem', color: '#64748b', textAlign: 'center', marginTop: '1rem', lineHeight: 1.5 }}>
          Every sign-in and every dispatched governance event is stored against your account with row-level security.
        </p>
      </div>
    </div>
  );
}
