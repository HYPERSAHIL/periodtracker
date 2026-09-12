import { useEffect, useState } from 'react';
import { hashPin } from '../lib/crypto';
import { tx } from '../lib/i18n';
import { Logo } from './Icons';

export default function PinGate({ pinHash, pinSalt, onUnlocked, lang }: { pinHash: string; pinSalt: string; onUnlocked: () => void; lang: string }) {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    if (!/^\d{4,8}$/.test(pin)) return;
    let live = true;
    hashPin(pin, pinSalt)
      .then((h) => {
        if (!live) return;
        if (h === pinHash) {
          sessionStorage.setItem('pt.unlocked', '1');
          onUnlocked();
        } else {
          setWrong(true);
          setPin('');
        }
      })
      .catch(() => {
        /* a failed hash leaves the gate as-is */
      });
    return () => {
      live = false;
    };
  }, [pin, pinHash, pinSalt, onUnlocked]);

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
