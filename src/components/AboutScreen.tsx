import React from 'react';
import { ArrowLeft, Bot, Cpu, Globe, ShieldCheck } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';

interface AboutScreenProps {
  onBack: () => void;
}

export const AboutScreen: React.FC<AboutScreenProps> = ({ onBack }) => {
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
          <span>Main Menu</span>
        </button>

        <h1 className="font-display text-lg sm:text-2xl font-bold tracking-wide text-white">
          About Neon Air Hockey
        </h1>

        <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
          First to 11 · 2D Arcade
        </span>
      </header>

      <div className="mt-3 grid flex-1 min-h-0 grid-cols-2 gap-3 overflow-y-auto arcade-scroll">
        <div className="rounded-2xl border border-white/10 bg-[#0D111C] p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Cpu className="h-4 w-4 text-[#00E5FF]" />
            <span>Sub-Stepped 2D Physics</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Powered by a deterministic 60Hz, 6-substep physics engine with rounded corner rebounds, goal post collisions, air-cushion glide friction, and direct striker momentum transfer.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0D111C] p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Globe className="h-4 w-4 text-[#00E5FF]" />
            <span>Authoritative Online Multiplayer</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Real-time WebSocket rooms with unique 6-character codes, host-gated lobby start, server-validated scoring, and automatic match preservation on reconnection.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0D111C] p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Bot className="h-4 w-4 text-[#FF2A85]" />
            <span>Unbeatable Predictive AI</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Play vs Bot runs locally offline using forward multi-bounce puck trajectory simulation, goal-line interception, and diagonal bank-shot aiming—obeying every physical rule fairly.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0D111C] p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Mobile Landscape Controls</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Engineered for horizontal touch-and-hold play: touch your striker to lock 1:1 tracking inside your half, and lift your finger to stop instantly with zero drift.
          </p>
        </div>
      </div>

      <footer className="mt-3 shrink-0 border-t border-white/10 pt-2.5 text-center text-xs font-semibold tracking-wider text-slate-400">
        Developed by <span className="text-slate-200">PRAKALP STUDIOS</span>
      </footer>
    </div>
  );
};
