import { useEffect, useState } from 'react';
import { tx } from '../lib/i18n';
import { track } from '../lib/beacon';

/** iOS has no install prompt event, so card views would otherwise be invisible in the funnel. */
function IosHint({ lang }: { lang: string }) {
  useEffect(() => {
    track('update_pwa_install', { stage: 'shown', via: 'ios' });
  }, []);
  return (
    <p className="hint" style={{ margin: 0 }}>
      {tx(lang, 'On iPhone: tap Share, then “Add to Home Screen”. Opens fullscreen like a native app · no App Store needed.')}
    </p>
  );
}
interface DeferredPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

/** Install card: native prompt on Chromium, manual steps on iOS Safari. Hidden when already installed. */
export default function InstallCard({ lang }: { lang: string }) {
  const [deferred, setDeferred] = useState<DeferredPrompt | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => {
    try {
      return window.matchMedia('(display-mode: standalone)').matches;
    } catch {
      return false;
    }
  });
  const [isIOS] = useState<boolean>(() => {
    try {
      return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as DeferredPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!deferred && !isIOS) return null;

  return (
    <div className="card">
      <h3>{tx(lang, 'Install the app')}</h3>
      {deferred ? (
        <>
          <p className="hint" style={{ margin: '0 0 12px' }}>
            {tx(lang, 'Add Period Tracker to your home screen for fullscreen, offline use.')}
          </p>
          <button
            className="btn ghost"
            onClick={async () => {
              try {
                await deferred.prompt();
                const choice = await deferred.userChoice;
                track('update_pwa_install', { stage: choice.outcome });
              } catch {
                track('update_pwa_install', { stage: 'dismissed' });
              }
              setDeferred(null);
            }}
          >
            {tx(lang, 'Install')}
          </button>
        </>
      ) : (
        <IosHint lang={lang} />
      )}
    </div>
  );
}
