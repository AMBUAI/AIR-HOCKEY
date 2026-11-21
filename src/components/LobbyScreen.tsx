import React, { useState } from 'react';
import { ArrowLeft, Check, Copy, Play, Wifi, WifiOff } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { PlayerSide, RoomSnapshot } from '../game/types';
import { ConnectionStatus } from '../network/multiplayerClient';

interface LobbyScreenProps {
  room: RoomSnapshot;
  localSide: PlayerSide;
  connectionStatus: ConnectionStatus;
  errorMessage: string | null;
  onToggleReady: (ready: boolean) => void;
  onStartMatch: () => void;
  onLeaveRoom: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  localSide,
  connectionStatus,
  errorMessage,
  onToggleReady,
  onStartMatch,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);

  const me = localSide === 1 ? room.player1 : room.player2;
  const isHost = Boolean(me?.isHost);
  const bothConnected = Boolean(room.player1?.connected && room.player2?.connected);
  const bothReady = Boolean(room.player1?.ready && room.player2?.ready);
  const canStart = isHost && bothConnected && bothReady;

  const handleCopy = async () => {
    soundEngine.playMenuClick();
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#07090F] px-4 py-3 sm:px-8 sm:py-5">
      {/* Top Bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => {
            soundEngine.playMenuClick();
            onLeaveRoom();
          }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-[#0D111C] px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-200 hover:bg-white/5 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Leave Room</span>
        </button>

        {/* Room Code */}
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-medium text-slate-400">Room Code</span>
          <span className="font-mono-nums text-xl sm:text-2xl font-bold tracking-[0.22em] text-white">
            {room.code}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* Connection Telemetry */}
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
            connectionStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'
          }`}
        >
          {connectionStatus === 'connected' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          <span>{connectionStatus === 'connected' ? 'Connected' : 'Reconnecting'}</span>
        </div>
      </header>

      {errorMessage && (
        <div className="mt-2 shrink-0 rounded-xl border border-rose-500/40 bg-rose-500/12 px-4 py-2 text-xs text-rose-200">
          {errorMessage}
        </div>
      )}

      {/* Two Player Slots */}
      <div className="mt-3 grid flex-1 min-h-0 grid-cols-2 gap-4 items-stretch">
        {/* Player 1 Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#00E5FF]/35 bg-[#0D111C] p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#00E5FF]">Player 1 · Host</span>
              <span className={room.player1?.connected ? 'text-emerald-400' : 'text-amber-400'}>
                {room.player1?.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            <h2 className="font-display mt-2 text-xl sm:text-2xl font-bold text-white truncate">
              {room.player1?.name || 'Host'}
              {localSide === 1 ? ' (You)' : ''}
            </h2>
            <p className="mt-1 text-xs text-slate-400">Defends left goal · Electric Cyan striker</p>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs font-semibold">
            <span className="text-slate-400">Lobby Status</span>
            <span className={room.player1?.ready ? 'text-[#00E5FF]' : 'text-slate-400'}>
              {room.player1?.ready ? 'Ready' : 'Not Ready'}
            </span>
          </div>
        </div>

        {/* Player 2 Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#FF2A85]/35 bg-[#0D111C] p-4 sm:p-5">
          {room.player2 ? (
            <>
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#FF2A85]">Player 2 · Challenger</span>
                  <span className={room.player2.connected ? 'text-emerald-400' : 'text-amber-400'}>
                    {room.player2.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>

                <h2 className="font-display mt-2 text-xl sm:text-2xl font-bold text-white truncate">
                  {room.player2.name}
                  {localSide === 2 ? ' (You)' : ''}
                </h2>
                <p className="mt-1 text-xs text-slate-400">Defends right goal · Hot Pink striker</p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs font-semibold">
                <span className="text-slate-400">Lobby Status</span>
                <span className={room.player2.ready ? 'text-[#FF2A85]' : 'text-slate-400'}>
                  {room.player2.ready ? 'Ready' : 'Not Ready'}
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="font-display text-base sm:text-lg font-bold text-slate-200">
                Waiting for Opponent
              </div>
              <p className="mt-1 max-w-xs text-xs text-slate-400">
                Share room code <span className="font-mono-nums font-bold text-white">{room.code}</span> with Player 2 to join this match.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Ready / Start Controls */}
      <footer className="mt-3 flex shrink-0 items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          {!room.player2
            ? 'Waiting for second player to connect...'
            : !bothReady
              ? 'Both players must mark Ready before the host can start.'
              : isHost
                ? 'Both players ready. Tap Start Match to lock room and begin!'
                : 'Both players ready. Waiting for host to start the match...'}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              soundEngine.playMenuClick();
              onToggleReady(!(me?.ready ?? false));
            }}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 py-2 text-sm font-bold transition-all whitespace-nowrap shrink-0 ${
              me?.ready
                ? 'border border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                : 'border border-white/20 bg-white/10 text-white hover:bg-white/15'
            }`}
          >
            {me?.ready ? 'Ready ✓' : 'Mark Ready'}
          </button>

          {isHost && (
            <button
              type="button"
              disabled={!canStart}
              onClick={() => {
                soundEngine.playMenuClick();
                onStartMatch();
              }}
              className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition-all whitespace-nowrap shrink-0 ${
                canStart
                  ? 'bg-[#00E5FF] text-[#07090F] hover:brightness-110 active:scale-[0.98]'
                  : 'cursor-not-allowed bg-slate-800 text-slate-500'
              }`}
            >
              <Play className="h-4 w-4" />
              <span>Start Match</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};
