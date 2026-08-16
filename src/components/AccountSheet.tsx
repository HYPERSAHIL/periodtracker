import { useState } from 'react';
import { CloudUser, restoreWithKey, signIn, signUp } from '../lib/cloud';

type Tab = 'signin' | 'signup' | 'restore';

export default function AccountSheet({
  user,
  onUserChanged,
  onClose,
  showSkip = true,
}: {
  user: CloudUser | null;
  onUserChanged: () => void;
  onClose: () => void;
  showSkip?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(user?.anonymous || !user ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onUserChanged();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Account and sync">
        <div className="grab" />
        <h2>☁️ Account &amp; sync</h2>
        <p className="hint" style={{ marginBottom: 14 }}>
          Your logs already sync automatically and privately — even without an account. Creating one
          lets you sign in on any device. We ask only for your name, age, and email — never your location.
        </p>

        <div className="seg" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 16 }}>
          <button className={tab === 'signup' ? 'on' : ''} onClick={() => setTab('signup')}>Create</button>
          <button className={tab === 'signin' ? 'on' : ''} onClick={() => setTab('signin')}>Sign in</button>
          <button className={tab === 'restore' ? 'on' : ''} onClick={() => setTab('restore')}>Sync code</button>
        </div>

        {tab === 'signup' && (
          <>
            <div className="field">
              <label htmlFor="ac-name">Name</label>
              <input id="ac-name" className="num-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="ac-age">Age</label>
              <input id="ac-age" className="num-in" type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 24" />
            </div>
            <div className="field">
              <label htmlFor="ac-email">Email</label>
              <input id="ac-email" className="num-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="ac-pass">Password</label>
              <input id="ac-pass" className="num-in" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
            </div>
            <button
              className="btn primary"
              disabled={busy || !name.trim() || !email.trim() || password.length < 8 || !age}
              onClick={() => run(() => signUp({ name: name.trim(), age: Number(age), email: email.trim(), password, anonKey: user?.anonymous ? user.syncKey : undefined }))}
            >
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </>
        )}

        {tab === 'signin' && (
          <>
            <div className="field">
              <label htmlFor="si-email">Email</label>
              <input id="si-email" className="num-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="si-pass">Password</label>
              <input id="si-pass" className="num-in" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" />
            </div>
            <button className="btn primary" disabled={busy || !email.trim() || !password} onClick={() => run(() => signIn(email.trim(), password))}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </>
        )}

        {tab === 'restore' && (
          <>
            <p className="hint" style={{ marginBottom: 10 }}>
              Have an anonymous sync code from another device? Enter it here to pull that data onto this device.
            </p>
            <div className="field">
              <label htmlFor="rs-key">Sync code</label>
              <input
                id="rs-key"
                className="num-in"
                style={{ textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center' }}
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 11))}
                placeholder="XXXXX-XXXXX"
              />
            </div>
            <button className="btn primary" disabled={busy || key.length !== 11} onClick={() => run(() => restoreWithKey(key))}>
              {busy ? 'Restoring…' : 'Restore data'}
            </button>
          </>
        )}

        {err && <p className="hint" style={{ color: 'var(--danger)', marginTop: 10, fontWeight: 700 }}>{err}</p>}

        <p className="hint" style={{ marginTop: 14 }}>
          Your password is hardened on your device before it's sent, and we store only your name, age,
          email, and standard request info (country, device type). No location tracking, no ads, no data sale — ever.
        </p>

        {showSkip && (
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={onClose}>
            Skip — anonymous sync has me covered
          </button>
        )}
      </div>
    </div>
  );
}
