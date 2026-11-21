import React, { useEffect, useRef, useState } from 'react';
import { Home, RotateCcw, Settings as SettingsIcon, Trophy, Wifi, WifiOff } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { ConnectionStatus, MultiplayerClient } from '../network/multiplayerClient';
import { UnbeatableBotAI } from '../game/botAi';
import {
  CENTER_X,
  CENTER_Y,
  COLORS,
  FIXED_DT,
  GOAL_CELEBRATION_MS,
  SERVE_COUNTDOWN_MS,
  STRIKER_RADIUS,
  TABLE_WIDTH,
  WINNING_SCORE,
} from '../game/constants';
import {
  clampStrikerPosition,
  createInitialMatchState,
  resetPositionsForServe,
  stepPhysics,
} from '../game/physics';
import {
  clientToTableCoords,
  computeTableViewport,
  renderAirHockeyTable,
  SparkParticle,
  TableViewport,
} from '../game/tableRenderer';
import {
  GameMode,
  MatchState,
  PhysicsEvent,
  PlayerSide,
  RoomSnapshot,
  Vec2,
} from '../game/types';

interface GameArenaProps {
  mode: GameMode;
  localSide: PlayerSide;
  player1Name: string;
  player2Name: string;
  roomSnapshot: RoomSnapshot | null;
  connectionStatus: ConnectionStatus;
  latencyMs: number | null;
  multiplayerClient: MultiplayerClient | null;
  onOpenSettings: () => void;
  onExitToMenu: () => void;
}

interface HudState {
  score1: number;
  score2: number;
  phase: MatchState['phase'];
  servingSide: PlayerSide;
  countdownSec: number;
  lastScorer: PlayerSide | null;
  winner: PlayerSide | null;
}

export const GameArena: React.FC<GameArenaProps> = ({
  mode,
  localSide,
  player1Name,
  player2Name,
  roomSnapshot,
  connectionStatus,
  latencyMs,
  multiplayerClient,
  onOpenSettings,
  onExitToMenu,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<TableViewport>(computeTableViewport(800, 400));

  // Mutable live game state refs for zero-React-overhead 60-120fps loop
  const matchRef = useRef<MatchState>(
    mode === 'online' && roomSnapshot?.match
      ? structuredClone(roomSnapshot.match)
      : createInitialMatchState(1)
  );
  const botAiRef = useRef<UnbeatableBotAI>(new UnbeatableBotAI());

  // Local finger-holding input state
  const activePointerIdRef = useRef<number | null>(null);
  const grabOffsetRef = useRef<Vec2>({ x: 0, y: 0 });
  const isHoldingRef = useRef<boolean>(false);
  const localTargetRef = useRef<Vec2>({
    x: localSide === 1 ? 140 : TABLE_WIDTH - 140,
    y: CENTER_Y,
  });
  const inputSeqRef = useRef<number>(0);

  // Visual FX refs
  const puckTrailRef = useRef<Vec2[]>([]);
  const particlesRef = useRef<SparkParticle[]>([]);
  const goalFlashAlphaRef = useRef<number>(0);
  const goalFlashSideRef = useRef<PlayerSide | null>(null);
  const lastCountdownBeepRef = useRef<number>(-1);
  const matchStartedSoundPlayedRef = useRef<boolean>(false);
  const matchEndSoundPlayedRef = useRef<boolean>(false);

  // Server snapshot target for online smooth interpolation
  const serverMatchRef = useRef<MatchState | null>(roomSnapshot?.match ?? null);

  const [hud, setHud] = useState<HudState>(() => {
    const m = matchRef.current;
    return {
      score1: m.score1,
      score2: m.score2,
      phase: m.phase,
      servingSide: m.servingSide,
      countdownSec: Math.ceil(m.countdownMs / 1000),
      lastScorer: m.lastScorer,
      winner: m.winner,
    };
  });

  // Sync incoming online room snapshots (lobby rematch, disconnect pause, etc.)
  useEffect(() => {
    if (mode !== 'online' || !roomSnapshot?.match) return;
    const incoming = roomSnapshot.match;
    serverMatchRef.current = incoming;

    // If a brand new match/rematch started (score reset to 0-0), reset local trackers
    if (incoming.score1 === 0 && incoming.score2 === 0 && incoming.tick < 15) {
      matchEndSoundPlayedRef.current = false;
      matchStartedSoundPlayedRef.current = false;
      puckTrailRef.current = [];
      particlesRef.current = [];
      localTargetRef.current = {
        x: localSide === 1 ? 140 : TABLE_WIDTH - 140,
        y: CENTER_Y,
      };
    }

    matchRef.current = structuredClone(incoming);
    setHud({
      score1: incoming.score1,
      score2: incoming.score2,
      phase: incoming.phase,
      servingSide: incoming.servingSide,
      countdownSec: Math.ceil(incoming.countdownMs / 1000),
      lastScorer: incoming.lastScorer,
      winner: incoming.winner,
    });
  }, [mode, roomSnapshot, localSide]);

  // Listen to high-frequency online match_state ticks via window custom event bridged from App
  useEffect(() => {
    if (mode !== 'online') return;

    const handleServerTick = (e: Event) => {
      const detail = (e as CustomEvent<{ match: MatchState; events: PhysicsEvent[] }>).detail;
      if (!detail) return;
      const incoming = detail.match;
      serverMatchRef.current = incoming;

      // Update authoritative fields directly while keeping local striker responsive when held
      const cur = matchRef.current;
      cur.phase = incoming.phase;
      cur.score1 = incoming.score1;
      cur.score2 = incoming.score2;
      cur.servingSide = incoming.servingSide;
      cur.countdownMs = incoming.countdownMs;
      cur.goalBannerTimerMs = incoming.goalBannerTimerMs;
      cur.lastScorer = incoming.lastScorer;
      cur.winner = incoming.winner;
      cur.tick = incoming.tick;

      // Puck follows server smoothly (snap if teleport/serve reset, blend otherwise)
      const puckJump = Math.hypot(cur.puck.x - incoming.puck.x, cur.puck.y - incoming.puck.y);
      if (puckJump > 120 || incoming.phase !== 'PLAYING') {
        cur.puck = { ...incoming.puck };
        if (puckJump > 120) puckTrailRef.current = [];
      } else {
        cur.puck.x = incoming.puck.x;
        cur.puck.y = incoming.puck.y;
        cur.puck.vx = incoming.puck.vx;
        cur.puck.vy = incoming.puck.vy;
      }

      // Remote striker follows server; local striker reconciles gently unless not held
      if (localSide === 1) {
        cur.striker2 = { ...incoming.striker2 };
        if (!isHoldingRef.current || incoming.phase === 'MATCH_OVER' || incoming.phase === 'PAUSED_DISCONNECT') {
          cur.striker1 = { ...incoming.striker1 };
          localTargetRef.current = { x: incoming.striker1.x, y: incoming.striker1.y };
        }
      } else {
        cur.striker1 = { ...incoming.striker1 };
        if (!isHoldingRef.current || incoming.phase === 'MATCH_OVER' || incoming.phase === 'PAUSED_DISCONNECT') {
          cur.striker2 = { ...incoming.striker2 };
          localTargetRef.current = { x: incoming.striker2.x, y: incoming.striker2.y };
        }
      }

      handlePhysicsEvents(detail.events, localSide);
    };

    window.addEventListener('neon-hockey-server-tick', handleServerTick);
    return () => window.removeEventListener('neon-hockey-server-tick', handleServerTick);
  }, [mode, localSide]);

  const spawnSparks = (x: number, y: number, color: string, count: number, speedScale = 1) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = (90 + Math.random() * 260) * speedScale;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 0.28 + Math.random() * 0.25,
        maxLife: 0.5,
        color,
        size: 1.8 + Math.random() * 2.4,
      });
    }
    if (particlesRef.current.length > 90) {
      particlesRef.current.splice(0, particlesRef.current.length - 90);
    }
  };

  const handlePhysicsEvents = (events: PhysicsEvent[], mySide: PlayerSide) => {
    for (const ev of events) {
      if (ev.type === 'striker_hit') {
        soundEngine.playStrikerHit(ev.intensity);
        spawnSparks(ev.x, ev.y, '#38BDF8', Math.round(5 + ev.intensity * 8), 0.7 + ev.intensity * 0.6);
      } else if (ev.type === 'wall_hit') {
        soundEngine.playWallHit(ev.intensity);
        spawnSparks(ev.x, ev.y, '#94A3B8', 4, 0.5);
      } else if (ev.type === 'goal' && ev.scorer) {
        soundEngine.playGoal(ev.scorer === mySide);
        goalFlashAlphaRef.current = 1;
        goalFlashSideRef.current = ev.scorer;
        const burstColor = ev.scorer === 1 ? COLORS.p1Cyan : COLORS.p2Pink;
        spawnSparks(ev.x, ev.y, burstColor, 26, 1.5);
        puckTrailRef.current = [];
      }
    }
  };

  // Main 60/120fps render & physics loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    let lastHudSync = 0;

    const loop = (now: number) => {
      const frameDt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const state = matchRef.current;

      // Countdown / Match Start / Match End sound cues
      if (state.phase === 'SERVE_COUNTDOWN') {
        const sec = Math.max(1, Math.ceil(state.countdownMs / 1000));
        if (sec !== lastCountdownBeepRef.current && state.countdownMs > 0) {
          lastCountdownBeepRef.current = sec;
          soundEngine.playCountdownTick(false);
        }
      } else if (state.phase === 'PLAYING') {
        if (lastCountdownBeepRef.current !== 0) {
          lastCountdownBeepRef.current = 0;
          if (!matchStartedSoundPlayedRef.current) {
            matchStartedSoundPlayedRef.current = true;
            soundEngine.playMatchStart();
          } else {
            soundEngine.playCountdownTick(true);
          }
        }
      } else if (state.phase === 'MATCH_OVER' && !matchEndSoundPlayedRef.current) {
        matchEndSoundPlayedRef.current = true;
        if (state.winner === localSide) {
          soundEngine.playVictory();
        } else {
          soundEngine.playDefeat();
        }
      }

      if (mode === 'bot') {
        accumulator += frameDt;
        while (accumulator >= FIXED_DT) {
          accumulator -= FIXED_DT;
          const stepMs = FIXED_DT * 1000;

          if (state.phase === 'SERVE_COUNTDOWN') {
            state.countdownMs = Math.max(0, state.countdownMs - stepMs);
            const botTarget = botAiRef.current.computeTarget(state, FIXED_DT);
            stepPhysics(state, localTargetRef.current, botTarget, FIXED_DT);
            if (state.countdownMs <= 0) {
              state.phase = 'PLAYING';
            }
          } else if (state.phase === 'GOAL_CELEBRATION') {
            state.goalBannerTimerMs = Math.max(0, state.goalBannerTimerMs - stepMs);
            const botTarget = botAiRef.current.computeTarget(state, FIXED_DT);
            stepPhysics(state, localTargetRef.current, botTarget, FIXED_DT);
            if (state.goalBannerTimerMs <= 0) {
              const nextServe: PlayerSide = state.lastScorer === 1 ? 2 : 1;
              resetPositionsForServe(state, nextServe);
              localTargetRef.current = { x: state.striker1.x, y: state.striker1.y };
              state.phase = 'SERVE_COUNTDOWN';
              state.countdownMs = SERVE_COUNTDOWN_MS;
            }
          } else if (state.phase === 'PLAYING') {
            const botTarget = botAiRef.current.computeTarget(state, FIXED_DT);
            const events = stepPhysics(state, localTargetRef.current, botTarget, FIXED_DT);
            handlePhysicsEvents(events, 1);

            const goalEv = events.find((e) => e.type === 'goal' && e.scorer);
            if (goalEv && goalEv.scorer) {
              if (goalEv.scorer === 1) {
                state.score1 += 1;
              } else {
                state.score2 += 1;
              }
              state.lastScorer = goalEv.scorer;

              if (state.score1 >= WINNING_SCORE || state.score2 >= WINNING_SCORE) {
                state.phase = 'MATCH_OVER';
                state.winner = state.score1 >= WINNING_SCORE ? 1 : 2;
                state.puck.vx = 0;
                state.puck.vy = 0;
              } else {
                state.phase = 'GOAL_CELEBRATION';
                state.goalBannerTimerMs = GOAL_CELEBRATION_MS;
                state.puck.vx = 0;
                state.puck.vy = 0;
              }
            }
          }
        }
      } else {
        // Online mode: keep local striker immediately responsive under the player's finger
        if (
          isHoldingRef.current &&
          state.phase !== 'MATCH_OVER' &&
          state.phase !== 'PAUSED_DISCONNECT'
        ) {
          const clamped = clampStrikerPosition(localSide, localTargetRef.current.x, localTargetRef.current.y);
          if (localSide === 1) {
            state.striker1.x = clamped.x;
            state.striker1.y = clamped.y;
          } else {
            state.striker2.x = clamped.x;
            state.striker2.y = clamped.y;
          }
        }
      }

      // Update trail & visual particles
      if (state.phase === 'PLAYING') {
        const puckSpd = Math.hypot(state.puck.vx, state.puck.vy);
        if (puckSpd > 160) {
          puckTrailRef.current.push({ x: state.puck.x, y: state.puck.y });
          if (puckTrailRef.current.length > 10) puckTrailRef.current.shift();
        } else if (puckTrailRef.current.length > 0) {
          puckTrailRef.current.shift();
        }
      }

      if (goalFlashAlphaRef.current > 0) {
        goalFlashAlphaRef.current = Math.max(0, goalFlashAlphaRef.current - frameDt * 1.4);
      }

      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx * frameDt;
        p.y += p.vy * frameDt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= frameDt;
        if (p.life <= 0) {
          particlesRef.current.splice(i, 1);
        }
      }

      // Render canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const targetW = Math.round(rect.width * dpr);
          const targetH = Math.round(rect.height * dpr);
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }
          const ctx = canvas.getContext('2d');
          if (ctx) {
            viewportRef.current = renderAirHockeyTable(ctx, rect.width, rect.height, dpr, {
              state,
              localSide,
              isHoldingStriker: isHoldingRef.current,
              puckTrail: puckTrailRef.current,
              particles: particlesRef.current,
              goalFlashAlpha: goalFlashAlphaRef.current,
              goalFlashSide: goalFlashSideRef.current,
              timeSec: now / 1000,
            });
          }
        }
      }

      // Sync React HUD state cleanly (~20Hz or immediately on state transitions)
      if (now - lastHudSync > 50) {
        lastHudSync = now;
        const cSec = Math.max(0, Math.ceil(state.countdownMs / 1000));
        setHud((prev) => {
          if (
            prev.score1 === state.score1 &&
            prev.score2 === state.score2 &&
            prev.phase === state.phase &&
            prev.servingSide === state.servingSide &&
            prev.countdownSec === cSec &&
            prev.lastScorer === state.lastScorer &&
            prev.winner === state.winner
          ) {
            return prev;
          }
          return {
            score1: state.score1,
            score2: state.score2,
            phase: state.phase,
            servingSide: state.servingSide,
            countdownSec: cSec,
            lastScorer: state.lastScorer,
            winner: state.winner,
          };
        });
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [mode, localSide]);

  // Finger-Holding Striker Touch / Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    soundEngine.unlock();
    const state = matchRef.current;
    if (state.phase === 'MATCH_OVER' || state.phase === 'PAUSED_DISCONNECT') return;

    // Ignore secondary touches if already holding striker
    if (activePointerIdRef.current !== null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touchPos = clientToTableCoords(e.clientX, e.clientY, rect, viewportRef.current);

    const myStriker = localSide === 1 ? state.striker1 : state.striker2;
    const distToStriker = Math.hypot(touchPos.x - myStriker.x, touchPos.y - myStriker.y);

    // Must touch on or near own striker (generous grab hitbox for mobile thumbs, strictly on own half)
    const onOwnHalf = localSide === 1 ? touchPos.x <= CENTER_X + 40 : touchPos.x >= CENTER_X - 40;
    const maxGrabRadius = STRIKER_RADIUS * 2.6;

    if (!onOwnHalf && distToStriker > maxGrabRadius) return;

    if (distToStriker <= maxGrabRadius) {
      activePointerIdRef.current = e.pointerId;
      isHoldingRef.current = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture unsupported
      }

      // Preserve exact finger offset when touching directly on striker so it never jumps;
      // gently center if grabbed slightly outside rim
      if (distToStriker <= STRIKER_RADIUS * 1.15) {
        grabOffsetRef.current = {
          x: myStriker.x - touchPos.x,
          y: myStriker.y - touchPos.y,
        };
      } else {
        grabOffsetRef.current = { x: 0, y: 0 };
        const nextPos = clampStrikerPosition(localSide, touchPos.x, touchPos.y);
        localTargetRef.current = nextPos;
        if (mode === 'online' && multiplayerClient) {
          inputSeqRef.current += 1;
          multiplayerClient.sendStrikerInput(nextPos.x, nextPos.y, inputSeqRef.current);
        }
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== e.pointerId || !isHoldingRef.current) return;
    const state = matchRef.current;
    if (state.phase === 'MATCH_OVER' || state.phase === 'PAUSED_DISCONNECT') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touchPos = clientToTableCoords(e.clientX, e.clientY, rect, viewportRef.current);

    const nextPos = clampStrikerPosition(
      localSide,
      touchPos.x + grabOffsetRef.current.x,
      touchPos.y + grabOffsetRef.current.y
    );

    localTargetRef.current = nextPos;

    if (mode === 'online' && multiplayerClient) {
      inputSeqRef.current += 1;
      multiplayerClient.sendStrikerInput(nextPos.x, nextPos.y, inputSeqRef.current);
    }
  };

  const releaseHold = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    activePointerIdRef.current = null;
    isHoldingRef.current = false;
    const state = matchRef.current;
    const myStriker = localSide === 1 ? state.striker1 : state.striker2;
    localTargetRef.current = { x: myStriker.x, y: myStriker.y };
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleBotPlayAgain = () => {
    soundEngine.playMenuClick();
    botAiRef.current.reset();
    const fresh = createInitialMatchState(1);
    matchRef.current = fresh;
    localTargetRef.current = { x: fresh.striker1.x, y: fresh.striker1.y };
    puckTrailRef.current = [];
    particlesRef.current = [];
    goalFlashAlphaRef.current = 0;
    lastCountdownBeepRef.current = -1;
    matchStartedSoundPlayedRef.current = false;
    matchEndSoundPlayedRef.current = false;
    setHud({
      score1: 0,
      score2: 0,
      phase: fresh.phase,
      servingSide: 1,
      countdownSec: Math.ceil(fresh.countdownMs / 1000),
      lastScorer: null,
      winner: null,
    });
  };

  const handleOnlineRematchVote = () => {
    soundEngine.playMenuClick();
    if (!multiplayerClient) return;
    const myInfo = localSide === 1 ? roomSnapshot?.player1 : roomSnapshot?.player2;
    multiplayerClient.sendRematchVote(!(myInfo?.rematchVote ?? false));
  };

  const myRematchVote =
    localSide === 1 ? roomSnapshot?.player1?.rematchVote : roomSnapshot?.player2?.rematchVote;
  const oppRematchVote =
    localSide === 1 ? roomSnapshot?.player2?.rematchVote : roomSnapshot?.player1?.rematchVote;
  const oppConnected =
    localSide === 1 ? roomSnapshot?.player2?.connected : roomSnapshot?.player1?.connected;

  const statusText = (() => {
    if (hud.phase === 'PAUSED_DISCONNECT') return 'Paused · Waiting for Opponent';
    if (hud.phase === 'MATCH_OVER') return 'Match Complete';
    if (hud.phase === 'GOAL_CELEBRATION') return 'Goal Scored';
    if (hud.phase === 'SERVE_COUNTDOWN') {
      return `Serve: ${hud.servingSide === 1 ? player1Name : player2Name}`;
    }
    return `First to ${WINNING_SCORE}`;
  })();

  const didLocalWin = hud.winner === localSide;

  return (
    <div className="relative flex h-full w-full flex-col bg-[#07090F] overflow-hidden">
      {/* Unobstructed Compact Top Scoreboard HUD */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#0D111C]/95 px-3 sm:px-5">
        {/* Player 1 (Cyan) */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]" />
            <span className="truncate max-w-[95px] sm:max-w-[160px] text-xs sm:text-sm font-semibold text-slate-100">
              {player1Name}
              {mode === 'online' && localSide === 1 ? ' (You)' : ''}
            </span>
          </div>
          <span
            className="font-mono-nums text-xl sm:text-2xl font-bold text-[#00E5FF]"
            style={{ textShadow: '0 0 12px rgba(0, 229, 255, 0.5)' }}
          >
            {hud.score1}
          </span>
        </div>

        {/* Center Match Telemetry */}
        <div className="flex items-center gap-2 text-[11px] sm:text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
          <span className="text-slate-200 font-semibold">{statusText}</span>
          {mode === 'online' && (
            <>
              <span aria-hidden="true">·</span>
              <span
                className={`inline-flex items-center gap-1 ${
                  connectionStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {connectionStatus === 'connected' ? (
                  <Wifi className="h-3.5 w-3.5" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5" />
                )}
                <span>
                  {connectionStatus === 'connected'
                    ? latencyMs
                      ? `${latencyMs}ms`
                      : 'Online'
                    : 'Reconnecting'}
                </span>
              </span>
            </>
          )}
          {mode === 'bot' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-slate-400">Offline AI</span>
            </>
          )}
        </div>

        {/* Player 2 / Bot (Pink) + Compact Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="font-mono-nums text-xl sm:text-2xl font-bold text-[#FF2A85]"
              style={{ textShadow: '0 0 12px rgba(255, 42, 133, 0.5)' }}
            >
              {hud.score2}
            </span>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate max-w-[95px] sm:max-w-[160px] text-xs sm:text-sm font-semibold text-slate-100">
                {player2Name}
                {mode === 'online' && localSide === 2 ? ' (You)' : ''}
              </span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#FF2A85] shadow-[0_0_8px_#FF2A85]" />
            </div>
          </div>

          <div className="flex items-center gap-1 border-l border-white/10 pl-2">
            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuClick();
                onOpenSettings();
              }}
              aria-label="Settings"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuClick();
                onExitToMenu();
              }}
              aria-label="Exit Match"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
            >
              <Home className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Playable 2D Table Canvas */}
      <div className="relative flex-1 min-h-0 w-full">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={releaseHold}
          onPointerCancel={releaseHold}
          onContextMenu={(e) => e.preventDefault()}
          className="block h-full w-full touch-none select-none cursor-grab active:cursor-grabbing"
        />

        {/* Serve Countdown Indicator */}
        {hud.phase === 'SERVE_COUNTDOWN' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border border-white/15 bg-[#07090F]/80 px-6 py-3 text-center backdrop-blur-sm">
              <div className="text-xs font-medium text-slate-300">
                {hud.servingSide === localSide ? 'Your Serve · Touch & Hold Striker' : `${hud.servingSide === 1 ? player1Name : player2Name} Serves`}
              </div>
              <div className="font-display mt-0.5 text-3xl font-bold text-amber-300 font-mono-nums">
                {Math.max(1, hud.countdownSec)}
              </div>
            </div>
          </div>
        )}

        {/* GOAL! Banner Overlay */}
        {hud.phase === 'GOAL_CELEBRATION' && hud.lastScorer && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="rounded-2xl border px-8 py-4 text-center backdrop-blur-md"
              style={{
                borderColor: hud.lastScorer === 1 ? 'rgba(0, 229, 255, 0.55)' : 'rgba(255, 42, 133, 0.55)',
                backgroundColor: 'rgba(7, 9, 15, 0.85)',
                boxShadow:
                  hud.lastScorer === 1
                    ? '0 0 40px rgba(0, 229, 255, 0.3)'
                    : '0 0 40px rgba(255, 42, 133, 0.3)',
              }}
            >
              <div
                className="font-display text-3xl sm:text-4xl font-bold tracking-wider"
                style={{ color: hud.lastScorer === 1 ? '#00E5FF' : '#FF2A85' }}
              >
                GOAL!
              </div>
              <div className="mt-1 text-xs sm:text-sm font-medium text-slate-200">
                {hud.lastScorer === 1 ? player1Name : player2Name} scores ·{' '}
                <span className="font-mono-nums font-bold">
                  {hud.score1} – {hud.score2}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Online Disconnect Pause Overlay */}
        {hud.phase === 'PAUSED_DISCONNECT' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#07090F]/80 backdrop-blur-sm px-4">
            <div className="max-w-sm rounded-2xl border border-amber-400/35 bg-[#0D111C] p-5 text-center">
              <WifiOff className="mx-auto mb-2.5 h-7 w-7 text-amber-400" />
              <h2 className="font-display text-lg font-bold text-white">
                {!oppConnected ? 'Opponent Disconnected' : 'Reconnecting Match'}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                {!oppConnected
                  ? 'Score, puck position, and serve state are preserved while waiting for reconnection.'
                  : hud.countdownSec > 0
                    ? `Both players connected. Resuming in ${hud.countdownSec}...`
                    : 'Synchronizing match state...'}
              </p>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuClick();
                  onExitToMenu();
                }}
                className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0"
              >
                Leave Match
              </button>
            </div>
          </div>
        )}

        {/* Match End Overlay (First to 11) */}
        {hud.phase === 'MATCH_OVER' && hud.winner && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#07090F]/85 backdrop-blur-md px-4">
            <div
              className="w-full max-w-md rounded-2xl border bg-[#0D111C] p-5 sm:p-6 text-center"
              style={{
                borderColor: didLocalWin ? 'rgba(0, 229, 255, 0.45)' : 'rgba(255, 42, 133, 0.45)',
                boxShadow: didLocalWin
                  ? '0 0 50px rgba(0, 229, 255, 0.2)'
                  : '0 0 50px rgba(255, 42, 133, 0.2)',
              }}
            >
              <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Trophy
                  className="h-5 w-5"
                  style={{ color: didLocalWin ? '#00E5FF' : '#FF2A85' }}
                />
              </div>

              <h2
                className="font-display text-2xl sm:text-3xl font-bold tracking-wide"
                style={{ color: didLocalWin ? '#00E5FF' : '#FF2A85' }}
              >
                {didLocalWin ? 'VICTORY' : 'DEFEAT'}
              </h2>

              <p className="mt-1 text-sm font-medium text-slate-300">
                {hud.winner === 1 ? player1Name : player2Name} wins first to {WINNING_SCORE}
              </p>

              {/* Verified Final Score */}
              <div className="my-4 flex items-center justify-center gap-6 rounded-xl border border-white/10 bg-[#07090F]/70 py-3 px-4">
                <div className="text-right">
                  <div className="text-[11px] font-medium text-slate-400 truncate max-w-[110px]">
                    {player1Name}
                  </div>
                  <div className="font-mono-nums text-3xl font-bold text-[#00E5FF]">
                    {hud.score1}
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-500">—</span>
                <div className="text-left">
                  <div className="text-[11px] font-medium text-slate-400 truncate max-w-[110px]">
                    {player2Name}
                  </div>
                  <div className="font-mono-nums text-3xl font-bold text-[#FF2A85]">
                    {hud.score2}
                  </div>
                </div>
              </div>

              {mode === 'online' && (
                <div className="mb-3 text-xs text-slate-400">
                  {!oppConnected
                    ? 'Opponent disconnected — rematch unavailable.'
                    : myRematchVote && !oppRematchVote
                      ? 'Rematch requested · Waiting for opponent to accept...'
                      : !myRematchVote && oppRematchVote
                        ? 'Opponent wants a rematch! Tap Play Again to start.'
                        : 'Both players must agree to start a rematch.'}
                </div>
              )}

              <div className="flex items-center justify-center gap-3">
                {mode === 'bot' ? (
                  <button
                    type="button"
                    onClick={handleBotPlayAgain}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-4 py-2.5 text-sm font-bold text-[#07090F] transition-transform hover:brightness-110 active:scale-[0.98] whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Play Again</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!oppConnected}
                    onClick={handleOnlineRematchVote}
                    className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all whitespace-nowrap shrink-0 ${
                      !oppConnected
                        ? 'cursor-not-allowed bg-slate-800 text-slate-500'
                        : myRematchVote
                          ? 'border border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                          : 'bg-[#00E5FF] text-[#07090F] hover:brightness-110 active:scale-[0.98]'
                    }`}
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>{myRematchVote ? 'Rematch Ready' : 'Play Again'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuClick();
                    onExitToMenu();
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap shrink-0"
                >
                  <Home className="h-4 w-4" />
                  <span>Return to Menu</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
