import { useEffect, useState } from 'react';
import { hashPin } from '../lib/crypto';
import { Logo } from './Icons';

export default function PinGate({ pinHash, pinSalt, onUnlocked }: { pinHash: string; pinSalt: string; onUnlocked: () => void }) {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    if (/^\d{4,8}$/.test(pin)) {
      hashPin(pin, pinSalt).then((h) => {
        if (h === pinHash) {
          sessionStorage.setItem('pt.unlocked', '1');
          onUnlocked();
        } else {
          setWrong(true);
          setPin('');
        }
      });
    }
  }, [pin, pinHash, pinSalt, onUnlocked]);

  return (
    <div className="pingate">
      <Logo size={52} />
      <h2 style={{ margin: '14px 0 2px', fontSize: 20 }}>Period Tracker is locked</h2>
      <p style={{ color: 'var(--text-2)', fontSize: 13.5, margin: '0 0 18px' }}>Enter your PIN to continue</p>
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
      {wrong && <p style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 700 }}>Wrong PIN — try again</p>}
      <p className="hint" style={{ marginTop: 16, maxWidth: 260, textAlign: 'center' }}>
        Forgot the PIN? Erase browser data for this site to reset the app (this deletes your logs), or restore an encrypted backup afterwards.
      </p>
    </div>
  );
}
