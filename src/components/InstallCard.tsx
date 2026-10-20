import { useEffect, useState } from 'react';
import { tx } from '../lib/i18n';
import { track } from '../lib/beacon';

/** iOS has no install prompt event, so card views would otherwise be invisible in the funnel. */
function IosHint({ lang }: { lang: string }) {
  return (
    <p className="hint" style={{ margin: 0 }}>
      {tx(lang, 'On iPhone: tap Share, then “Add to Home Screen”. Opens fullscreen like a native app · no App Store needed.')}
    </p>
  );
}

/** Android before the prompt event arrives (Chrome's engagement heuristic needs
    ~30s + at least one interaction first) — manual menu path, plus the card
    upgrades itself the moment beforeinstallprompt fires. */
function AndroidHint({ lang }: { lang: string }) {
  return (
    <p className="hint" style={{ margin: 0 }}>
      {tx(lang, 'In Chrome: menu ⋮ → Install app. Works offline, opens fullscreen, gets a home-screen icon like a real app.')}
    </p>
  );
}

interface DeferredPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

const HIDE_KEY = 'pt.install.hideUntil';
const HIDE_MS = 7 * 86400000; // a "Not now" quiets the card for a week, then it returns

const IS_IOS = (() => {
  try {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  } catch {
    return false;
  }
})();

/** Install card: shown to every visitor who hasn't installed — on the home
    screen, not buried in Settings. Native prompt on Chromium, manual steps on
    iOS Safari / promptless Chromium. */
export default function InstallCard({ lang }: { lang: string }) {
  const [deferred, setDeferred] = useState<DeferredPrompt | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => {
    try {
      return window.matchMedia('(display-mode: standalone)').matches;
    } catch {
      return false;
    }
  });
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return Date.now() < Number(localStorage.getItem(HIDE_KEY) || 0);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let live = true;
    track('update_pwa_install', { stage: 'shown_card', via: IS_IOS ? 'ios' : 'android' });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as DeferredPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // Android WebAPK installs are detectable directly (manifest declares
    // related_applications platform 'webapp'); hides the card for real installs
    const self = (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<Array<{ platform?: string }>> }).getInstalledRelatedApps;
    if (self) {
      self
        .call(navigator)
        .then((list) => {
          if (live && list.some((a) => a.platform === 'webapp')) setInstalled(true);
        })
        .catch(() => {});
    }
    return () => {
      live = false;
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || hidden) return null;

  const dismiss = () => {
    track('update_pwa_install', { stage: 'dismissed_card' });
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_MS));
    } catch {
      /* card returns next load */
    }
  };

  return (
    <div className="card" style={{ position: 'relative' }}>
      <button
        className="btn ghost sm"
        aria-label={tx(lang, 'Not now')}
        onClick={dismiss}
        style={{ position: 'absolute', top: 8, right: 8, minHeight: 32, minWidth: 32 }}
      >
        ✕
      </button>
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
      ) : IS_IOS ? (
        <IosHint lang={lang} />
      ) : (
        <AndroidHint lang={lang} />
      )}
    </div>
  );
}
