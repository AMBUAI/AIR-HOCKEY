import React from 'react';
import { ArrowLeft, BookOpen, Home, Music, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { AudioSettings } from '../game/types';

interface SettingsScreenProps {
  settings: AudioSettings;
  inActiveMatch: boolean;
  onUpdateSettings: (partial: Partial<AudioSettings>) => void;
  onOpenRuleBook: () => void;
  onBack: () => void;
  onReturnToMenu: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  inActiveMatch,
  onUpdateSettings,
  onOpenRuleBook,
  onBack,
  onReturnToMenu,
}) => {
  const toggleSfx = () => {
    const next = !settings.sfxEnabled;
    onUpdateSettings({ sfxEnabled: next });
    if (next) soundEngine.playMenuClick();
  };

  const toggleMusic = () => {
    soundEngine.playMenuClick();
    onUpdateSettings({ musicEnabled: !settings.musicEnabled });
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#07090F] px-4 py-3 sm:px-8 sm:py-5">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => {
            soundEngine.playMenuClick();
            onBack();
          }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-[#0D111C] px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-200 hover:bg-white/5 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{inActiveMatch ? 'Resume Match' : 'Back'}</span>
        </button>

        <h1 className="font-display text-lg sm:text-2xl font-bold tracking-wide text-white">
          Settings
        </h1>

        <button
          type="button"
          onClick={() => {
            soundEngine.playMenuClick();
            onReturnToMenu();
          }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-[#0D111C] px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-200 hover:bg-white/5 whitespace-nowrap shrink-0"
        >
          <Home className="h-4 w-4" />
          <span>Return to Menu</span>
        </button>
      </header>

      <div className="mt-3 grid flex-1 min-h-0 grid-cols-12 gap-4 items-stretch overflow-y-auto arcade-scroll pr-1">
        {/* Audio Toggles & Volumes */}
        <section className="col-span-7 flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0D111C] p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={toggleSfx}
              className={`flex min-h-[48px] items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                settings.sfxEnabled
                  ? 'border-[#00E5FF]/45 bg-[#00E5FF]/12 text-white'
                  : 'border-white/10 bg-[#07090F] text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {settings.sfxEnabled ? (
                  <Volume2 className="h-4 w-4 text-[#00E5FF]" />
                ) : (
                  <VolumeX className="h-4 w-4 text-slate-500" />
                )}
                <span className="text-xs sm:text-sm font-semibold whitespace-nowrap">Sound Effects</span>
              </div>
              <span className="font-mono-nums text-xs font-bold">
                {settings.sfxEnabled ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={toggleMusic}
              className={`flex min-h-[48px] items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                settings.musicEnabled
                  ? 'border-[#FF2A85]/45 bg-[#FF2A85]/12 text-white'
                  : 'border-white/10 bg-[#07090F] text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Music className={`h-4 w-4 ${settings.musicEnabled ? 'text-[#FF2A85]' : 'text-slate-500'}`} />
                <span className="text-xs sm:text-sm font-semibold whitespace-nowrap">Arcade Music</span>
              </div>
              <span className="font-mono-nums text-xs font-bold">
                {settings.musicEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          {/* Sliders */}
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">Master Volume</span>
                <span className="font-mono-nums text-slate-400">{Math.round(settings.masterVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.masterVolume * 100)}
                onChange={(e) => onUpdateSettings({ masterVolume: Number(e.target.value) / 100 })}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-[#00E5FF]"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">Sound Effects Volume</span>
                <span className="font-mono-nums text-slate-400">{Math.round(settings.sfxVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                disabled={!settings.sfxEnabled}
                value={Math.round(settings.sfxVolume * 100)}
                onChange={(e) => onUpdateSettings({ sfxVolume: Number(e.target.value) / 100 })}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-[#00E5FF] disabled:opacity-40"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">Music Volume</span>
                <span className="font-mono-nums text-slate-400">{Math.round(settings.musicVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                disabled={!settings.musicEnabled}
                value={Math.round(settings.musicVolume * 100)}
                onChange={(e) => onUpdateSettings({ musicVolume: Number(e.target.value) / 100 })}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-[#FF2A85] disabled:opacity-40"
              />
            </div>
          </div>
        </section>

        {/* Rule Book & Quick Info */}
        <section className="col-span-5 flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0D111C] p-4 sm:p-5">
          <div>
            <h2 className="font-display text-lg font-bold text-white">Official Rule Book</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
              Review all 12 official gameplay sections: finger-holding striker mechanics, serves, valid goals, fouls, out-of-bounds recovery, first-to-11 rules, Online Multiplayer, and Play vs Bot.
            </p>
          </div>

          <div className="mt-4 space-y-2.5">
            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuClick();
                onOpenRuleBook();
              }}
              className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-4 py-2.5 text-sm font-bold text-[#07090F] transition-all hover:brightness-110 active:scale-[0.98] whitespace-nowrap shrink-0"
            >
              <BookOpen className="h-4 w-4" />
              <span>Open Rule Book</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuClick();
                onReturnToMenu();
              }}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0"
            >
              <Home className="h-4 w-4" />
              <span>Return to Menu</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
