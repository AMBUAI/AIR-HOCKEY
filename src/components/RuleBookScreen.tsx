import React, { useState } from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { RULE_BOOK_SECTIONS } from '../game/ruleBookData';

interface RuleBookScreenProps {
  onBack: () => void;
}

export const RuleBookScreen: React.FC<RuleBookScreenProps> = ({ onBack }) => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const current = RULE_BOOK_SECTIONS[selectedIdx];

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
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[#00E5FF]" />
          <h1 className="font-display text-lg sm:text-2xl font-bold tracking-wide text-white">
            Rule Book
          </h1>
        </div>

        <span className="font-mono-nums text-xs text-slate-400 whitespace-nowrap shrink-0">
          {current.number} / 12
        </span>
      </header>

      <div className="mt-3 grid flex-1 min-h-0 grid-cols-12 gap-4">
        {/* Left Chapter Navigation */}
        <nav className="col-span-5 overflow-y-auto arcade-scroll pr-1 space-y-1.5">
          {RULE_BOOK_SECTIONS.map((sec, idx) => {
            const active = idx === selectedIdx;
            return (
              <button
                key={sec.number}
                type="button"
                onClick={() => {
                  soundEngine.playMenuClick();
                  setSelectedIdx(idx);
                }}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-[#00E5FF]/50 bg-[#00E5FF]/12 text-white'
                    : 'border-white/5 bg-[#0D111C] text-slate-300 hover:border-white/15 hover:text-white'
                }`}
              >
                <span
                  className={`font-mono-nums text-xs font-bold ${
                    active ? 'text-[#00E5FF]' : 'text-slate-500'
                  }`}
                >
                  {sec.number}
                </span>
                <span className="truncate text-xs sm:text-sm font-semibold">{sec.title}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Chapter Content */}
        <article className="col-span-7 overflow-y-auto arcade-scroll rounded-2xl border border-white/10 bg-[#0D111C] p-4 sm:p-6">
          <div className="font-mono-nums text-xs font-bold text-[#00E5FF]">
            Section {current.number}
          </div>
          <h2 className="font-display mt-1 text-xl sm:text-2xl font-bold text-white">
            {current.title}
          </h2>
          <p className="mt-2 text-xs sm:text-sm font-medium leading-relaxed text-slate-200">
            {current.summary}
          </p>

          <ul className="mt-4 space-y-2.5 border-t border-white/10 pt-4">
            {current.details.map((line, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs sm:text-sm leading-relaxed text-slate-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF2A85]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
};
