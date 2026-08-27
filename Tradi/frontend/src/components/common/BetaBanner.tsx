import { useState } from 'react';
import { X } from 'lucide-react';
import { BETA_MODE } from '@/lib/beta';
import { safeGet, safeSet } from '@/lib/storage';

const DISMISS_KEY = 'hm-beta-banner-dismissed';

export function BetaBanner() {
  const [dismissed, setDismissed] = useState(() => safeGet(DISMISS_KEY) === 'true');

  if (!BETA_MODE || dismissed) return null;

  function handleDismiss() {
    safeSet(DISMISS_KEY, 'true');
    setDismissed(true);
  }

  return (
    <div className="border-b border-secondary/20 bg-secondary/10">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5">
        <span className="rounded-full border border-secondary/40 bg-secondary/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-secondary">
          Beta
        </span>
        <p className="text-center text-xs text-secondary">
          Free and unlimited during open beta — accounts & billing arrive at launch.
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss beta announcement"
          className="ml-2 text-secondary hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
