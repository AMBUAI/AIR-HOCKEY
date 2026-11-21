import React, { useEffect, useState } from 'react';
import { Maximize2, RotateCw } from 'lucide-react';

interface OrientationGateProps {
  children: React.ReactNode;
}

export function requestLandscapeFullscreen(): void {
  try {
    const docEl = document.documentElement;
    if (!document.fullscreenElement && docEl.requestFullscreen) {
      docEl.requestFullscreen().catch(() => {});
    }
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    if (orientation && typeof orientation.lock === 'function') {
      orientation.lock('landscape').catch(() => {});
    }
  } catch {
    // Orientation lock not supported on this browser/device
  }
}

export function toggleLandscapeFullscreen(): void {
  try {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    requestLandscapeFullscreen();
  } catch {
    // Fullscreen toggle not supported on this browser/device
  }
}

export const OrientationGate: React.FC<OrientationGateProps> = ({ children }) => {
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });

  useEffect(() => {
    const check = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  if (isPortrait) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#07090F] px-6 text-center">
        <div
          className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-2xl border border-cyan-400/30 bg-[#0D111C]"
          style={{ boxShadow: '0 0 36px rgba(0, 229, 255, 0.18)' }}
        >
          <div className="flex h-12 w-7 items-center justify-center rounded-md border-2 border-cyan-400 bg-cyan-400/10">
            <RotateCw className="h-4 w-4 text-cyan-300 animate-spin" style={{ animationDuration: '4s' }} />
          </div>
        </div>

        <h1 className="font-display text-2xl font-bold tracking-wide text-white text-balance">
          Rotate Your Phone to Landscape
        </h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">
          Neon Air Hockey is designed exclusively for horizontal landscape play so the full table and both goals remain unobstructed.
        </p>

        <button
          type="button"
          onClick={requestLandscapeFullscreen}
          className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-5 py-2.5 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25 active:scale-[0.98] whitespace-nowrap shrink-0"
        >
          <Maximize2 className="h-4 w-4" />
          <span>Try Landscape Lock</span>
        </button>
      </div>
    );
  }

  return <>{children}</>;
};
