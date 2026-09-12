import { useState } from 'react';
import { CloudUser, restoreWithKey, signIn, signUp } from '../lib/cloud';
import { deviceInfo } from '../lib/device';
import { tx } from '../lib/i18n';
import { APP_VERSION } from '../types';
import { Logo } from './Icons';

type Tab = 'signup' | 'signin' | 'restore';

/**
 * Full-screen account step on the app's rose hero gradient. Used as the last
 * onboarding step (with Skip) and from Settings (with back).
 */
export default function AccountScreen({
  user,
  onDone,
  onSkip,
  onClose,
  lang,
}: {
  user: CloudUser | null;
  onDone: () => void;
  onSkip?: () => void;
  onClose?: () => void;
  lang?: string;
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
      setErr(e instanceof Error ? e.message : tx(lang, 'Something went wrong.'));
    } finally {
      setBusy(false);
    }
  };

  const title =
    tab === 'signup' ? tx(lang, 'Create your account') : tab === 'signin' ? tx(lang, 'Welcome back') : tx(lang, 'Restore your data');
  const sub =
    tab === 'signup'
      ? tx(lang, 'Your data is backed up automatically. An account lets you sign in on any device.')
      : tab === 'signin'
        ? tx(lang, 'Sign in to pick up right where you left off.')
        : tx(lang, 'Enter the backup code from your other device.');

  return (
    <div className="acct2">
      <div className="acct2-ring a" />
      <div className="acct2-ring b" />
      <div className="acct2-inner">
        {onClose && (
          <button className="acct2-back" onClick={onClose} aria-label="Back">
            ←
          </button>
        )}

        <Logo size={56} />
        <h1 className="acct2-h">{tx(lang, 'Period Tracker')}</h1>
        <div className="acct2-tabs" role="tablist">
          {(['signup', 'signin'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'on' : ''}
              onClick={() => setTab(t)}
            >
              {t === 'signup' ? tx(lang, 'Create') : tx(lang, 'Sign in')}
            </button>
          ))}
        </div>

        <div className="acct2-card">
          <h2>{title}</h2>
          <p className="acct2-sub">{sub}</p>

          {tab === 'signup' && (
            <>
              <div className="acct2-row">
                <div className="acct2-field" style={{ flex: 1 }}>
                  <label htmlFor="ac-name">{tx(lang, 'Name')}</label>
                  <input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={tx(lang, 'Your name')} autoComplete="name" />
                </div>
                <div className="acct2-field" style={{ width: 92 }}>
                  <label htmlFor="ac-age">{tx(lang, 'Age')}</label>
                  <input id="ac-age" type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="24" />
                </div>
              </div>
              <div className="acct2-field">
                <label htmlFor="ac-email">{tx(lang, 'Email')}</label>
                <input id="ac-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
              </div>
              <div className="acct2-field">
                <label htmlFor="ac-pass">{tx(lang, 'Password')}</label>
                <input id="ac-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tx(lang, 'At least 6 characters')} autoComplete="new-password" />
              </div>
              <button
                className="btn primary acct2-btn"
                disabled={busy || !name.trim() || !email.trim() || password.length < 6 || !age}
                onClick={() =>
                  run(() =>
                    signUp({
                      name: name.trim(),
                      age: Number(age),
                      email: email.trim(),
                      password,
                      anonKey: user?.anonymous ? user.syncKey : undefined,
                      device: deviceInfo(APP_VERSION),
                    })
                  )
                }
              >
                {busy ? tx(lang, 'Creating…') : tx(lang, 'Create account')}
              </button>
            </>
          )}

          {tab === 'signin' && (
            <>
              <div className="acct2-field">
                <label htmlFor="si-email">{tx(lang, 'Email')}</label>
                <input id="si-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
              </div>
              <div className="acct2-field">
                <label htmlFor="si-pass">{tx(lang, 'Password')}</label>
                <input id="si-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tx(lang, 'Your password')} autoComplete="current-password" />
              </div>
              <button className="btn primary acct2-btn" disabled={busy || !email.trim() || !password} onClick={() => run(() => signIn(email.trim(), password))}>
                {busy ? tx(lang, 'Signing in…') : tx(lang, 'Sign in')}
              </button>
            </>
          )}

          {tab === 'restore' && (
            <>
              <div className="acct2-field">
                <label htmlFor="rs-key">{tx(lang, 'Backup code')}</label>
                <input
                  id="rs-key"
                  className="acct2-code"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 11))}
                  placeholder="XXXXX-XXXXX"
                />
              </div>
              <button className="btn primary acct2-btn" disabled={busy || key.length !== 11} onClick={() => run(() => restoreWithKey(key))}>
                {busy ? tx(lang, 'Restoring…') : tx(lang, 'Restore my data')}
              </button>
            </>
          )}

          {tab !== 'restore' && (
            <button className="acct2-alt" onClick={() => setTab('restore')}>
              {tx(lang, 'I have a backup code')}
            </button>
          )}
          {tab === 'restore' && (
            <button className="acct2-alt" onClick={() => setTab('signup')}>{tx(lang, 'Create an account instead')}</button>
          )}

          {err && <p className="acct2-err">{err}</p>}
        </div>

        {onSkip && (
          <button className="acct2-skip" onClick={onSkip}>
            {tx(lang, 'Skip')}
          </button>
        )}
      </div>
    </div>
  );
}
