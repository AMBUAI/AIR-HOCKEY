import React, { useState } from 'react';
import { ArrowLeft, LogIn, PlusCircle } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { ConnectionStatus } from '../network/multiplayerClient';

interface OnlineHubProps {
  initialName: string;
  connectionStatus: ConnectionStatus;
  errorMessage: string | null;
  onClearError: () => void;
  onHostRoom: (playerName: string) => void;
  onJoinRoom: (code: string, playerName: string) => void;
  onBack: () => void;
}

export const OnlineHub: React.FC<OnlineHubProps> = ({
  initialName,
  connectionStatus,
  errorMessage,
  onClearError,
  onHostRoom,
  onJoinRoom,
  onBack,
}) => {
  const [name, setName] = useState(initialName || 'Player');
  const [roomCode, setRoomCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const isBusy = connectionStatus === 'connecting';
  const activeError = localError || errorMessage;

  const handleHost = () => {
    soundEngine.unlock();
    soundEngine.playMenuClick();
    setLocalError(null);
    onClearError();
    onHostRoom(name.trim() || 'Player 1');
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.unlock();
    soundEngine.playMenuClick();
    setLocalError(null);
    onClearError();

    const cleaned = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length !== 6) {
      setLocalError('Room code must be exactly 6 alphanumeric characters.');
      return;
    }
    onJoinRoom(cleaned, name.trim() || 'Player 2');
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#07090F] px-4 py-3 sm:px-8 sm:py-5">
      {/* Header */}
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
          Online Multiplayer
        </h1>

        <div className="flex items-center gap-2">
          <label htmlFor="callsign-input" className="hidden sm:inline text-xs font-medium text-slate-400">
            Name
          </label>
          <input
            id="callsign-input"
            type="text"
            maxLength={16}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your Name"
            className="h-10 w-32 sm:w-40 rounded-xl border border-white/15 bg-[#0D111C] px-3 text-xs sm:text-sm font-medium text-white placeholder:text-slate-500 focus:border-[#00E5FF] focus:outline-none"
          />
        </div>
      </header>

      {/* Error Strip */}
      {activeError && (
        <div className="mt-2.5 shrink-0 rounded-xl border border-rose-500/40 bg-rose-500/12 px-4 py-2 text-xs font-medium text-rose-200">
          {activeError}
        </div>
      )}

      {/* Host / Join 2-Column Split */}
      <div className="mt-3 grid flex-1 min-h-0 grid-cols-2 gap-4 items-stretch">
        {/* HOST PANEL */}
        <section className="flex flex-col justify-between rounded-2xl border border-[#00E5FF]/30 bg-[#0D111C] p-4 sm:p-5">
          <div>
            <p className="text-xs font-semibold text-[#00E5FF]">Player 1 · Cyan Side</p>
            <h2 className="font-display mt-1 text-xl font-bold text-white">Host Private Match</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
              Generate a unique 6-character room code and share it with your opponent to start a first-to-11 match.
            </p>
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={handleHost}
            className="mt-4 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-4 py-2.5 text-sm font-bold text-[#07090F] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <PlusCircle className="h-4 w-4" />
            <span>{isBusy ? 'Connecting...' : 'Create Room'}</span>
          </button>
        </section>

        {/* JOIN PANEL */}
        <form
          onSubmit={handleJoin}
          className="flex flex-col justify-between rounded-2xl border border-[#FF2A85]/30 bg-[#0D111C] p-4 sm:p-5"
        >
          <div>
            <p className="text-xs font-semibold text-[#FF2A85]">Player 2 · Pink Side</p>
            <h2 className="font-display mt-1 text-xl font-bold text-white">Join With Room Code</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
              Enter the 6-character alphanumeric code from your host to connect directly to their arena.
            </p>

            <div className="mt-3">
              <input
                type="text"
                maxLength={6}
                value={roomCode}
                onChange={(e) => {
                  setLocalError(null);
                  onClearError();
                  setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                }}
                placeholder="E.g. A7K9P2"
                aria-label="6-character room code"
                className="font-mono-nums h-11 w-full rounded-xl border border-white/15 bg-[#07090F] px-3 text-center text-lg font-bold tracking-[0.28em] text-white placeholder:text-slate-600 placeholder:tracking-normal focus:border-[#FF2A85] focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="mt-3 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#FF2A85] px-4 py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <LogIn className="h-4 w-4" />
            <span>{isBusy ? 'Joining...' : 'Join Room'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
