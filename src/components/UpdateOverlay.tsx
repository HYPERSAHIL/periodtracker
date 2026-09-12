import { useEffect, useState } from 'react';
import { UpdateState, updater } from '../lib/updater';
import { tx } from '../lib/i18n';
import { Logo } from './Icons';

/**
 * Non-closable update window (native APK builds only). Once an update is
 * downloaded the user must install it - there is intentionally no dismiss.
 */
export default function UpdateOverlay({ lang }: { lang?: string }) {
  const [state, setState] = useState<UpdateState>(updater.state);

  useEffect(() => updater.subscribe(setState), []);

  // nothing to show while checking/idle on web or up-to-date builds
  if (state.stage === 'idle' || state.stage === 'checking' || state.stage === 'available') return null;
  // during download we show a passive, still-unclosable card
  if (state.stage === 'downloading') {
    return (
      <div className="upd-screen">
        <div className="upd-card">
          <Logo size={44} />
          <h2>{tx(lang, 'Downloading update')}{state.version ? ` ${state.version}` : ''}</h2>
          <div className="upd-progress">
            <div style={{ width: `${Math.max(6, state.progress)}%` }} />
          </div>
          <p className="upd-note">{state.progress}%{state.sizeBytes ? ` · ${(state.sizeBytes / 1048576).toFixed(1)} MB` : ''}</p>
        </div>
      </div>
    );
  }

  const needPerm = state.stage === 'need_permission';

  return (
    <div className="upd-screen">
      <div className="upd-card">
        <Logo size={44} />
        <h2>{tx(lang, 'Update ready to install')}</h2>
        <p className="upd-note">
          Version {state.version} {tx(lang, 'is downloaded and verified. Installing keeps your data. Nothing is lost.')} {state.notes ? state.notes + ' ' : ''}
        </p>

        {needPerm ? (
          <>
            <div className="upd-steps">
              <div className="upd-step"><span>1</span> Tap <strong>{tx(lang, 'Open Settings')}</strong> below</div>
              <div className="upd-step"><span>2</span> Enable <strong>Allow from this source</strong></div>
              <div className="upd-step"><span>3</span> Come back and tap <strong>{tx(lang, 'Install')}</strong></div>
            </div>
            <button className="btn primary upd-btn" onClick={() => updater.installPressed()}>
              {tx(lang, 'Open Settings')}
            </button>
            <button
              className="btn ghost upd-btn"
              onClick={() => {
                updater.installPressed();
              }}
            >
              {tx(lang, "I've enabled it. Install now")}
            </button>
          </>
        ) : (
          <button className="btn primary upd-btn" onClick={() => updater.installPressed()}>
            {state.stage === 'installing' ? tx(lang, 'Installing') + '…' : tx(lang, 'Install')}
          </button>
        )}

        <p className="upd-tiny">{tx(lang, 'This screen stays until the update is installed. That is by design, so every device runs the latest version.')}</p>
      </div>
    </div>
  );
}
