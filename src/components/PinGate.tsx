import { useEffect, useState } from 'react';
import { hashPin } from '../lib/crypto';
import { tx } from '../lib/i18n';
import { track } from '../lib/beacon';
import { noteAuthFailure } from '../lib/audit';
import { Logo } from './Icons';

export default function PinGate({ pinHash, pinSalt, onUnlocked, lang }: { pinHash: string; pinSalt: string; onUnlocked: () => void; lang: string }) {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    track('settings_locked_screen');
  }, []);

  useEffect(() => {
    if (!/^\d{4,8}$/.test(pin)) return;
    let live = true;
    hashPin(pin, pinSalt)
      .then((h) => {
        if (!live) return;
        if (h === pinHash) {
          sessionStorage.setItem('pt.unlocked', '1');
          track('settings_pin_unlocked', { attempts });
          onUnlocked();
        } else {
          const n = attempts + 1;
          setAttempts(n);
          track('settings_pin_unlock_failed', { attempt: n, pin });
          noteAuthFailure('pin');
          setWrong(true);
          setPin('');
        }
      })
      .catch(() => {
        /* a failed hash leaves the gate as-is */
        track('settings_pin_unlock_failed', { attempt: attempts + 1, reason: 'hash_error' });
      });
    return () => {
      live = false;
    };
  }, [pin, pinHash, pinSalt, onUnlocked, attempts]);

  return (
    <div className="pingate">
      <Logo size={52} />
      <h2 style={{ margin: '14px 0 2px', fontSize: 20 }}>{tx(lang, 'Period Tracker is locked')}</h2>
      <p style={{ color: 'var(--text-2)', fontSize: 13.5, margin: '0 0 18px' }}>{tx(lang, 'Enter your PIN to continue')}</p>
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        className="num-in pin-input"
        maxLength={8}
        value={pin}
        onChange={(e) => {
          setWrong(false);
          setPin(e.target.value.replace(/\D/g, ''));
        }}
        placeholder="••••"
        aria-label="PIN"
        style={wrong ? { borderColor: 'var(--danger)' } : undefined}
      />
      {wrong && <p style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 700 }}>{tx(lang, 'Wrong PIN. Try again')}</p>}
      <p className="hint" style={{ marginTop: 16, maxWidth: 260, textAlign: 'center' }}>
        {tx(lang, "Forgot your PIN? Clearing the app's site data resets it. Then sign in to restore your data.")}
      </p>
    </div>
  );
}
