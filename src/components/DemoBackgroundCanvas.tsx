import React, { useEffect, useRef } from 'react';
import { UnbeatableBotAI } from '../game/botAi';
import {
  CENTER_X,
  CENTER_Y,
  COLORS,
  FIXED_DT,
  PUCK_RADIUS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
} from '../game/constants';
import { createInitialMatchState, resetPositionsForServe, stepPhysics } from '../game/physics';
import { renderAirHockeyTable, SparkParticle } from '../game/tableRenderer';
import { MatchState, PlayerSide, Vec2 } from '../game/types';

function mirrorStateForLeftBot(state: MatchState): MatchState {
  return {
    ...state,
    servingSide: state.servingSide === 1 ? 2 : 1,
    puck: {
      x: TABLE_WIDTH - state.puck.x,
      y: state.puck.y,
      vx: -state.puck.vx,
      vy: state.puck.vy,
    },
    striker1: {
      x: TABLE_WIDTH - state.striker2.x,
      y: state.striker2.y,
      vx: -state.striker2.vx,
      vy: state.striker2.vy,
    },
    striker2: {
      x: TABLE_WIDTH - state.striker1.x,
      y: state.striker1.y,
      vx: -state.striker1.vx,
      vy: state.striker1.vy,
    },
  };
}

export const DemoBackgroundCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const state = createInitialMatchState(1);
    state.phase = 'PLAYING';
    state.puck = { x: CENTER_X, y: CENTER_Y, vx: 520, vy: 280 };

    const botLeft = new UnbeatableBotAI();
    const botRight = new UnbeatableBotAI();
    const puckTrail: Vec2[] = [];
    const particles: SparkParticle[] = [];
    let goalFlashAlpha = 0;
    let goalFlashSide: PlayerSide | null = null;
    let goalResetTimer = 0;
    let stallTimer = 0;

    let rafId = 0;
    let lastTime = performance.now();
    let accumulator = 0;

    const spawnSparks = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 80 + Math.random() * 240;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 0.28 + Math.random() * 0.2,
          maxLife: 0.45,
          color,
          size: 1.8 + Math.random() * 2.2,
        });
      }
      if (particles.length > 70) {
        particles.splice(0, particles.length - 70);
      }
    };

    const kickOff = (serveSide: PlayerSide) => {
      resetPositionsForServe(state, serveSide);
      state.phase = 'PLAYING';
      const dir = serveSide === 1 ? 1 : -1;
      const angle = (Math.random() - 0.5) * 1.1;
      const speed = 560 + Math.random() * 220;
      state.puck = {
        x: CENTER_X + dir * 20,
        y: CENTER_Y + (Math.random() - 0.5) * 80,
        vx: Math.cos(angle) * speed * dir,
        vy: Math.sin(angle) * speed,
      };
      puckTrail.length = 0;
    };

    const loop = (now: number) => {
      const frameDt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      accumulator += frameDt;
      while (accumulator >= FIXED_DT) {
        accumulator -= FIXED_DT;

        if (state.phase === 'GOAL_CELEBRATION') {
          goalResetTimer -= FIXED_DT;
          if (goalResetTimer <= 0) {
            const nextServe: PlayerSide = state.lastScorer === 1 ? 2 : 1;
            kickOff(nextServe);
          }
        } else {
          const mirrored = mirrorStateForLeftBot(state);
          const leftTargetMirrored = botLeft.computeTarget(mirrored, FIXED_DT);
          const target1 = {
            x: TABLE_WIDTH - leftTargetMirrored.x,
            y: leftTargetMirrored.y,
          };
          const target2 = botRight.computeTarget(state, FIXED_DT);

          const events = stepPhysics(state, target1, target2, FIXED_DT);
          for (const ev of events) {
            if (ev.type === 'striker_hit') {
              spawnSparks(ev.x, ev.y, '#38BDF8', 6);
            } else if (ev.type === 'wall_hit') {
              spawnSparks(ev.x, ev.y, '#94A3B8', 3);
            } else if (ev.type === 'goal' && ev.scorer) {
              goalFlashAlpha = 1;
              goalFlashSide = ev.scorer;
              state.lastScorer = ev.scorer;
              state.phase = 'GOAL_CELEBRATION';
              goalResetTimer = 0.85;
              spawnSparks(
                ev.x,
                ev.y,
                ev.scorer === 1 ? COLORS.p1Cyan : COLORS.p2Pink,
                22
              );
              break;
            }
          }

          // Keep demo rallies lively if puck slows down in the corners
          const spd = Math.hypot(state.puck.vx, state.puck.vy);
          if (spd < 90) {
            stallTimer += FIXED_DT;
            if (stallTimer > 1.2) {
              stallTimer = 0;
              const toCenterX = CENTER_X - state.puck.x;
              const toCenterY = CENTER_Y - state.puck.y;
              const len = Math.hypot(toCenterX, toCenterY) || 1;
              state.puck.vx = (toCenterX / len) * 620;
              state.puck.vy = (toCenterY / len) * 620 + (Math.random() - 0.5) * 180;
            }
          } else {
            stallTimer = 0;
          }

          // Safety bounds
          if (
            state.puck.x < -PUCK_RADIUS * 2 ||
            state.puck.x > TABLE_WIDTH + PUCK_RADIUS * 2 ||
            state.puck.y < 0 ||
            state.puck.y > TABLE_HEIGHT
          ) {
            if (state.phase === 'PLAYING') {
              kickOff(1);
            }
          }
        }
      }

      if (state.phase === 'PLAYING') {
        const spd = Math.hypot(state.puck.vx, state.puck.vy);
        if (spd > 150) {
          puckTrail.push({ x: state.puck.x, y: state.puck.y });
          if (puckTrail.length > 12) puckTrail.shift();
        }
      }

      if (goalFlashAlpha > 0) {
        goalFlashAlpha = Math.max(0, goalFlashAlpha - frameDt * 1.4);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * frameDt;
        p.y += p.vy * frameDt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= frameDt;
        if (p.life <= 0) particles.splice(i, 1);
      }

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
            renderAirHockeyTable(ctx, rect.width, rect.height, dpr, {
              state,
              localSide: 1,
              isHoldingStriker: false,
              puckTrail,
              particles,
              goalFlashAlpha,
              goalFlashSide,
              timeSec: now / 1000,
            });
          }
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-65"
    />
  );
};
