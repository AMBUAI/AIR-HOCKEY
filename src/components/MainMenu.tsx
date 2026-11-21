import React, { useEffect, useState } from 'react';
import { BookOpen, Bot, Globe, Info, Maximize2, Minimize2, Settings } from 'lucide-react';
import logoImg from '../assets/logo.png';
import { soundEngine } from '../audio/soundEngine';
import { DemoBackgroundCanvas } from './DemoBackgroundCanvas';
import { toggleLandscapeFullscreen } from './OrientationGate';

interface MainMenuProps {
  onPlayOnline: () => void;
  onPlayBot: () => void;
  onOpenSettings: () => void;
  onOpenRuleBook: () => void;
  onOpenAbout: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onPlayOnline,
  onPlayBot,
  onOpenSettings,
  onOpenRuleBook,
  onOpenAbout,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  );

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handle = (fn: () => void) => {
    soundEngine.unlock();
    soundEngine.playMenuClick();
    fn();
  };

  return (
    <div className="relative flex h-full w-full flex-col justify-between gap-2 sm:gap-4 overflow-hidden bg-[#07090F] px-4 py-3 sm:px-8 sm:py-5 lg:px-14 lg:py-8">
      {/* Live AI vs AI Air Hockey Match Background */}
      <DemoBackgroundCanvas />

      {/* Contrast Scrim over the live match so UI stays razor-sharp */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at center, rgba(7, 9, 15, 0.42) 0%, rgba(7, 9, 15, 0.78) 100%)',
        }}
      />

      {/* Top Row: Large Game Icon + Title + PRAKALP STUDIOS Credit + Fullscreen Toggle */}
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 sm:gap-5">
          <div
            className="h-16 w-16 sm:h-20 sm:w-20 lg:h-24 lg:w-24 shrink-0 overflow-hidden rounded-2xl border-2 border-[#00E5FF]/70 bg-[#07090F]"
            style={{ boxShadow: '0 0 28px rgba(0, 229, 255, 0.4)' }}
          >
            <img
              src={logoImg}
              alt="Neon Air Hockey Icon"
              className="h-full w-full scale-[1.08] object-cover"
            />
          </div>

          <div>
            <p className="text-[11px] sm:text-xs lg:text-sm font-semibold tracking-wider text-cyan-300">
              2D Landscape Arcade · First to 11
            </p>
            <h1
              className="font-display font-bold leading-none tracking-tight text-white"
              style={{ fontSize: 'clamp(1.65rem, 4.2vw, 4rem)' }}
            >
              NEON AIR{' '}
              <span className="bg-gradient-to-r from-[#00E5FF] via-slate-100 to-[#FF2A85] bg-clip-text text-transparent">
                HOCKEY
              </span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm lg:text-base font-bold tracking-wide text-slate-200">
              Developed by{' '}
              <span className="text-[#00E5FF]">PRAKALP STUDIOS</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handle(toggleLandscapeFullscreen)}
          className="inline-flex min-h-[46px] sm:min-h-[52px] items-center gap-2 rounded-xl border border-cyan-400/50 bg-[#0D111C]/90 px-4 sm:px-5 py-2.5 text-xs sm:text-sm lg:text-base font-semibold text-cyan-100 backdrop-blur-md transition-colors hover:border-[#00E5FF] hover:bg-cyan-500/20 active:scale-[0.98] whitespace-nowrap shrink-0"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4 lg:h-5 lg:w-5 text-[#00E5FF]" />
          ) : (
            <Maximize2 className="h-4 w-4 lg:h-5 lg:w-5 text-[#00E5FF]" />
          )}
          <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
        </button>
      </header>

      {/* Center Stage: Large Fullscreen Mode Cards */}
      <div className="relative z-10 grid flex-1 min-h-0 w-full grid-cols-12 items-stretch gap-3 sm:gap-6 lg:gap-8">
        {/* Play Online Primary Card */}
        <button
          type="button"
          onClick={() => handle(onPlayOnline)}
          className="col-span-6 flex min-h-0 flex-col justify-between rounded-2xl sm:rounded-3xl border border-[#00E5FF]/55 bg-[#0D111C]/82 p-3.5 sm:p-6 lg:p-8 text-left backdrop-blur-md transition-all hover:border-[#00E5FF] hover:bg-[#0D111C]/92 active:scale-[0.99]"
          style={{ boxShadow: '0 0 40px rgba(0, 229, 255, 0.18)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-10 w-10 sm:h-14 sm:w-14 lg:h-16 lg:w-16 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-[#00E5FF]/20 text-[#00E5FF]">
              <Globe className="h-5 w-5 sm:h-7 sm:w-7 lg:h-9 lg:w-9" />
            </div>
            <span className="text-xs sm:text-sm lg:text-base font-semibold text-[#00E5FF] whitespace-nowrap">
              Host / Join →
            </span>
          </div>

          <div className="mt-2">
            <div
              className="font-display font-bold tracking-wide text-white"
              style={{ fontSize: 'clamp(1.15rem, 2.5vw, 2.35rem)' }}
            >
              PLAY ONLINE
            </div>
            <p className="mt-1 text-[11px] sm:text-sm lg:text-base leading-snug text-slate-300">
              Two-player real-time match with 6-character room codes, ready lobby, and server-validated scoring.
            </p>
          </div>
        </button>

        {/* Play vs Bot Primary Card */}
        <button
          type="button"
          onClick={() => handle(onPlayBot)}
          className="col-span-6 flex min-h-0 flex-col justify-between rounded-2xl sm:rounded-3xl border border-[#FF2A85]/55 bg-[#0D111C]/82 p-3.5 sm:p-6 lg:p-8 text-left backdrop-blur-md transition-all hover:border-[#FF2A85] hover:bg-[#0D111C]/92 active:scale-[0.99]"
          style={{ boxShadow: '0 0 40px rgba(255, 42, 133, 0.18)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-10 w-10 sm:h-14 sm:w-14 lg:h-16 lg:w-16 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-[#FF2A85]/20 text-[#FF2A85]">
              <Bot className="h-5 w-5 sm:h-7 sm:w-7 lg:h-9 lg:w-9" />
            </div>
            <span className="text-xs sm:text-sm lg:text-base font-semibold text-[#FF2A85] whitespace-nowrap">
              Start Now →
            </span>
          </div>

          <div className="mt-2">
            <div
              className="font-display font-bold tracking-wide text-white"
              style={{ fontSize: 'clamp(1.15rem, 2.5vw, 2.35rem)' }}
            >
              PLAY VS BOT
            </div>
            <p className="mt-1 text-[11px] sm:text-sm lg:text-base leading-snug text-slate-300">
              Instant single-player duel against an unbeatable predictive AI opponent.
            </p>
          </div>
        </button>
      </div>

      {/* Bottom Row: Large Utility Navigation */}
      <footer className="relative z-10 shrink-0 grid grid-cols-3 gap-3 sm:gap-5">
        <button
          type="button"
          onClick={() => handle(onOpenSettings)}
          className="flex min-h-[44px] sm:min-h-[54px] lg:min-h-[62px] items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-[#0D111C]/85 px-4 py-2 text-xs sm:text-base lg:text-lg font-semibold text-slate-100 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-[#0D111C] whitespace-nowrap shrink-0"
        >
          <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-slate-300" />
          <span>Settings</span>
        </button>

        <button
          type="button"
          onClick={() => handle(onOpenRuleBook)}
          className="flex min-h-[44px] sm:min-h-[54px] lg:min-h-[62px] items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-[#0D111C]/85 px-4 py-2 text-xs sm:text-base lg:text-lg font-semibold text-slate-100 backdrop-blur-md transition-colors hover:border-cyan-400/40 hover:bg-[#0D111C] whitespace-nowrap shrink-0"
        >
          <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-[#00E5FF]" />
          <span>Rule Book</span>
        </button>

        <button
          type="button"
          onClick={() => handle(onOpenAbout)}
          className="flex min-h-[44px] sm:min-h-[54px] lg:min-h-[62px] items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-[#0D111C]/85 px-4 py-2 text-xs sm:text-base lg:text-lg font-semibold text-slate-100 backdrop-blur-md transition-colors hover:border-pink-400/40 hover:bg-[#0D111C] whitespace-nowrap shrink-0"
        >
          <Info className="h-4 w-4 sm:h-5 sm:w-5 text-[#FF2A85]" />
          <span>About</span>
        </button>
      </footer>
    </div>
  );
};
