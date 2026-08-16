import { useState } from 'react';
import { CloudUser, restoreWithKey, signIn, signUp } from '../lib/cloud';
import { Logo } from './Icons';

type Tab = 'signup' | 'signin' | 'restore';

/**
 * Full-screen account step. Used as the last onboarding step (embedded, with
 * Skip) and from Settings (overlay, with back). Copy stays non-technical.
 */
export default function AccountScreen({
  user,
  onDone,
  onSkip,
  onClose,
}: {
  user: CloudUser | null;
  onDone: () => void;
  onSkip?: () => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(user && !user.anonymous ? 'signin' : 'signup');
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
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="acct-screen">
      <div className="acct-inner">
        {onClose && (
          <button className="btn ghost sm" style={{ alignSelf: 'flex-start', marginBottom: 14 }} onClick={onClose}>
            ← Back
          </button>
        )}
        <Logo size={52} />
        <h2>{tab === 'signup' ? 'Create your account' : tab === 'signin' ? 'Welcome back' : 'Restore your data'}</h2>
        <p className="lead">
          {tab === 'signup'
            ? 'Your data is backed up automatically. An account lets you sign in on any device.'
            : tab === 'signin'
              ? 'Sign in to pick up right where you left off.'
              : 'Enter the backup code from your other device to bring your data here.'}
        </p>

        {tab !== 'restore' && (
          <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 18 }}>
            <button className={tab === 'signup' ? 'on' : ''} onClick={() => setTab('signup')}>Create</button>
            <button className={tab === 'signin' ? 'on' : ''} onClick={() => setTab('signin')}>Sign in</button>
          </div>
        )}

        {tab === 'signup' && (
          <>
            <div className="field">
              <label htmlFor="ac-name">Name</label>
              <input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="ac-age">Age</label>
              <input id="ac-age" type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 24" />
            </div>
            <div className="field">
              <label htmlFor="ac-email">Email</label>
              <input id="ac-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="ac-pass">Password</label>
              <input id="ac-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" />
            </div>
            <button
              className="btn primary"
              disabled={busy || !name.trim() || !email.trim() || password.length < 6 || !age}
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
              <input id="si-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="si-pass">Password</label>
              <input id="si-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" />
            </div>
            <button className="btn primary" disabled={busy || !email.trim() || !password} onClick={() => run(() => signIn(email.trim(), password))}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </>
        )}

        {tab === 'restore' && (
          <>
            <div className="field">
              <label htmlFor="rs-key">Backup code</label>
              <input
                id="rs-key"
                style={{ textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center' }}
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 11))}
                placeholder="XXXXX-XXXXX"
              />
            </div>
            <button className="btn primary" disabled={busy || key.length !== 11} onClick={() => run(() => restoreWithKey(key))}>
              {busy ? 'Restoring…' : 'Restore my data'}
            </button>
          </>
        )}

        {tab !== 'restore' && (
          <button className="chip" style={{ marginTop: 16 }} onClick={() => setTab('restore')}>
            I have a backup code
          </button>
        )}

        {err && <p className="hint" style={{ color: 'var(--danger)', marginTop: 12, fontWeight: 700 }}>{err}</p>}

        {onSkip && (
          <button className="btn ghost" style={{ marginTop: 18 }} onClick={onSkip}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
