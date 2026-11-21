import {
  BOT_MAX_SPEED,
  CENTER_X,
  CENTER_Y,
  CORNER_RADIUS,
  GOAL_HALF_HEIGHT,
  PUCK_FRICTION,
  PUCK_RADIUS,
  STRIKER_RADIUS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
} from './constants';
import { clampStrikerPosition } from './physics';
import { MatchState, Vec2 } from './types';

interface PredictedPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}

export class UnbeatableBotAI {
  private lastShotPattern = 0;
  private attackCooldown = 0;
  private strikePhase: 'ready' | 'windup' | 'swing' | 'recover' = 'ready';
  private strikeTimer = 0;

  public reset(): void {
    this.lastShotPattern = 0;
    this.attackCooldown = 0;
    this.strikePhase = 'ready';
    this.strikeTimer = 0;
  }

  /**
   * Predicts the puck trajectory forward up to horizonSec, accounting for top/bottom walls,
   * end walls outside the goal mouth, and air friction.
   */
  private predictPuckPath(state: MatchState, horizonSec = 1.15): PredictedPoint[] {
    const path: PredictedPoint[] = [];
    const stepDt = 1 / 60;
    const steps = Math.round(horizonSec / stepDt);

    let x = state.puck.x;
    let y = state.puck.y;
    let vx = state.puck.vx;
    let vy = state.puck.vy;

    const goalTop = CENTER_Y - GOAL_HALF_HEIGHT;
    const goalBottom = CENTER_Y + GOAL_HALF_HEIGHT;

    for (let i = 1; i <= steps; i++) {
      x += vx * stepDt;
      y += vy * stepDt;
      vx *= PUCK_FRICTION;
      vy *= PUCK_FRICTION;

      if (y < PUCK_RADIUS) {
        y = PUCK_RADIUS;
        vy = Math.abs(vy) * 0.86;
      } else if (y > TABLE_HEIGHT - PUCK_RADIUS) {
        y = TABLE_HEIGHT - PUCK_RADIUS;
        vy = -Math.abs(vy) * 0.86;
      }

      // Corner approximation bounce
      const inLeftC = x < CORNER_RADIUS && x >= 0;
      const inRightC = x > TABLE_WIDTH - CORNER_RADIUS && x <= TABLE_WIDTH;
      const inTopC = y < CORNER_RADIUS;
      const inBottomC = y > TABLE_HEIGHT - CORNER_RADIUS;
      if ((inLeftC || inRightC) && (inTopC || inBottomC)) {
        const cx = inLeftC ? CORNER_RADIUS : TABLE_WIDTH - CORNER_RADIUS;
        const cy = inTopC ? CORNER_RADIUS : TABLE_HEIGHT - CORNER_RADIUS;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const maxD = CORNER_RADIUS - PUCK_RADIUS;
        if (dist > maxD && dist > 1e-5) {
          const nx = dx / dist;
          const ny = dy / dist;
          x = cx + nx * maxD;
          y = cy + ny * maxD;
          const vn = vx * nx + vy * ny;
          if (vn > 0) {
            vx -= 1.86 * vn * nx;
            vy -= 1.86 * vn * ny;
          }
        }
      }

      const inMouth = y > goalTop && y < goalBottom;
      if (!inMouth) {
        if (x < PUCK_RADIUS) {
          x = PUCK_RADIUS;
          vx = Math.abs(vx) * 0.86;
        } else if (x > TABLE_WIDTH - PUCK_RADIUS) {
          x = TABLE_WIDTH - PUCK_RADIUS;
          vx = -Math.abs(vx) * 0.86;
        }
      }

      path.push({ x, y, vx, vy, t: i * stepDt });

      // Stop simulating if puck enters either goal mouth deeply
      if (x < -PUCK_RADIUS || x > TABLE_WIDTH + PUCK_RADIUS) {
        break;
      }
    }

    return path;
  }

  /**
   * Computes the optimal legal attacking aim point inside Player 1's goal (x = 0),
   * factoring in Player 1's striker position and velocity, plus bank-shot openings.
   */
  private chooseAttackTarget(state: MatchState): Vec2 {
    const p1 = state.striker1;
    const puck = state.puck;

    // Predict where P1 striker will be ~0.18s from now
    const p1FutureY = Math.max(
      STRIKER_RADIUS,
      Math.min(TABLE_HEIGHT - STRIKER_RADIUS, p1.y + p1.vy * 0.18)
    );

    const topCornerY = CENTER_Y - GOAL_HALF_HEIGHT + PUCK_RADIUS + 10;
    const bottomCornerY = CENTER_Y + GOAL_HALF_HEIGHT - PUCK_RADIUS - 10;
    const centerGoalY = CENTER_Y;

    // Evaluate clearances from P1's predicted position
    const topClearance = Math.abs(p1FutureY - topCornerY);
    const botClearance = Math.abs(p1FutureY - bottomCornerY);

    // If P1 is camping directly in front of center goal, consider a sharp bank shot off top or bottom rail!
    const directBlocked = Math.abs(p1FutureY - CENTER_Y) < 48 && p1.x < 240;

    if (directBlocked && puck.x > CENTER_X + 60) {
      this.lastShotPattern = (this.lastShotPattern + 1) % 3;
      if (this.lastShotPattern !== 0) {
        // Virtual mirrored goal for 1-wall bank shot
        const useTopWall = topClearance >= botClearance;
        const virtualGoalY = useTopWall ? -centerGoalY + 35 : 2 * TABLE_HEIGHT - centerGoalY - 35;
        return { x: -12, y: virtualGoalY };
      }
    }

    // Otherwise fire accurately at the widest open goal corner
    const targetY = topClearance > botClearance ? topCornerY : bottomCornerY;
    return { x: -16, y: targetY };
  }

  public computeTarget(state: MatchState, dt: number): Vec2 {
    const bot = state.striker2;
    const puck = state.puck;
    const p1 = state.striker1;

    if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (this.strikeTimer > 0) this.strikeTimer = Math.max(0, this.strikeTimer - dt);

    // Guard position during serve countdown
    if (state.phase === 'SERVE_COUNTDOWN') {
      this.strikePhase = 'ready';
      const guardY = state.servingSide === 2 ? CENTER_Y : CENTER_Y;
      const guardX = state.servingSide === 2 ? TABLE_WIDTH - 135 : TABLE_WIDTH - 105;
      return this.moveToward(bot, { x: guardX, y: guardY }, dt, BOT_MAX_SPEED);
    }

    if (state.phase !== 'PLAYING') {
      return { x: bot.x, y: bot.y };
    }

    const path = this.predictPuckPath(state, 1.15);
    const goalX = TABLE_WIDTH;
    const defendLineX = TABLE_WIDTH - STRIKER_RADIUS - 36; // ~930
    const homeX = TABLE_WIDTH - 110; // ~890

    // Check if the predicted trajectory crosses the defense arc or threatens our goal
    let interceptPoint: PredictedPoint | null = null;
    let fastestThreat: PredictedPoint | null = null;

    for (const pt of path) {
      // Any point heading into our defensive zone
      if (pt.x >= CENTER_X + 30 && pt.vx > -40) {
        if (!fastestThreat && pt.x >= homeX - 40) {
          fastestThreat = pt;
        }
        if (pt.x >= defendLineX - 18) {
          interceptPoint = pt;
          break;
        }
      }
    }

    // Threat assessment: fast puck moving toward Bot's right goal
    const puckSpeed = Math.hypot(puck.vx, puck.vy);
    const incomingFast = puck.vx > 180 && (puck.x > CENTER_X - 120 || puck.vx > 480);

    let desiredTarget: Vec2;

    // 1. CRITICAL GOAL DEFENSE: Block any incoming shot before anything else
    if (incomingFast && (interceptPoint || fastestThreat)) {
      const targetPt = interceptPoint ?? fastestThreat!;
      // Clamp interception Y to defend the goal mouth tightly
      const maxDefendY = CENTER_Y + GOAL_HALF_HEIGHT - PUCK_RADIUS * 0.4;
      const minDefendY = CENTER_Y - GOAL_HALF_HEIGHT + PUCK_RADIUS * 0.4;

      // Also check if puck is coming straight toward the goal line
      const blockY = Math.max(minDefendY, Math.min(maxDefendY, targetPt.y));

      // Meet the puck cleanly on the line between puck & goal center, slightly in front of goal
      const blockX = Math.max(
        CENTER_X + STRIKER_RADIUS + 20,
        Math.min(TABLE_WIDTH - STRIKER_RADIUS - 14, targetPt.x - 14)
      );

      // If puck is very close and slow enough to counter-hit forward instead of just blocking:
      const distToPuck = Math.hypot(puck.x - bot.x, puck.y - bot.y);
      if (distToPuck < 105 && puck.x < bot.x - 8 && puck.vx < 620) {
        // Counter-punch directly toward open corner!
        const aim = this.chooseAttackTarget(state);
        const dirX = aim.x - puck.x;
        const dirY = aim.y - puck.y;
        const len = Math.hypot(dirX, dirY) || 1;
        desiredTarget = {
          x: puck.x + (dirX / len) * 26,
          y: puck.y + (dirY / len) * 26,
        };
      } else {
        desiredTarget = { x: blockX, y: blockY };
      }
    }
    // 2. PUCK IN BOT'S HALF: Attack or clear safely without ever own-goaling
    else if (puck.x >= CENTER_X + 6) {
      const puckBehindBot = puck.x > bot.x - 6;

      if (puckBehindBot) {
        // NEVER charge straight into a puck that is behind us (risk of own-goal)!
        // First drop back to goal-side (x > puck.x) and clear around the top/bottom.
        const goAbove = puck.y > CENTER_Y;
        const detourY = goAbove
          ? Math.max(STRIKER_RADIUS + 12, puck.y - (STRIKER_RADIUS + PUCK_RADIUS + 26))
          : Math.min(TABLE_HEIGHT - STRIKER_RADIUS - 12, puck.y + (STRIKER_RADIUS + PUCK_RADIUS + 26));
        const behindPuckX = Math.min(TABLE_WIDTH - STRIKER_RADIUS - 8, puck.x + STRIKER_RADIUS + PUCK_RADIUS + 16);

        // If we are already safely behind the puck on X, sweep in to clear it forward
        if (bot.x > puck.x + 18 && Math.abs(bot.y - puck.y) < 95) {
          desiredTarget = { x: puck.x - 24, y: puck.y };
        } else {
          desiredTarget = { x: behindPuckX, y: detourY };
        }
      } else {
        // Puck is in front of Bot in Bot's half -> Execute precision strike!
        const aim = this.chooseAttackTarget(state);
        const shotDx = aim.x - puck.x;
        const shotDy = aim.y - puck.y;
        const shotLen = Math.hypot(shotDx, shotDy) || 1;
        const nx = shotDx / shotLen;
        const ny = shotDy / shotLen;

        // Ideal contact offset behind puck along reverse shot vector
        const strikeBehind = {
          x: puck.x - nx * (PUCK_RADIUS + STRIKER_RADIUS + 34),
          y: puck.y - ny * (PUCK_RADIUS + STRIKER_RADIUS + 34),
        };

        // Predict puck 0.08s ahead for moving strikes
        const leadPuckX = puck.x + puck.vx * 0.075;
        const leadPuckY = puck.y + puck.vy * 0.075;

        const alignedBehind =
          bot.x > puck.x + 12 &&
          Math.abs((bot.y - puck.y) * nx - (bot.x - puck.x) * ny) < 32;

        if (alignedBehind && this.attackCooldown <= 0) {
          // Drive straight through the puck toward the aim vector!
          desiredTarget = {
            x: leadPuckX + nx * 52,
            y: leadPuckY + ny * 52,
          };
          if (Math.hypot(bot.x - puck.x, bot.y - puck.y) < STRIKER_RADIUS + PUCK_RADIUS + 14) {
            this.attackCooldown = 0.14;
          }
        } else {
          // Move cleanly behind the shot line first (never overshoot past center line)
          desiredTarget = {
            x: Math.max(CENTER_X + STRIKER_RADIUS + 8, strikeBehind.x),
            y: Math.max(STRIKER_RADIUS + 8, Math.min(TABLE_HEIGHT - STRIKER_RADIUS - 8, strikeBehind.y)),
          };
        }
      }
    }
    // 3. PUCK IN HUMAN'S HALF: Proactive shadow defense + steal/intercept if puck sits near center
    else {
      // Check if puck is slow near the center line so Bot can safely ambush?
      // Remember Bot CANNOT cross CENTER_X, so only ambush if puck is crossing into Bot's half soon
      const crossingSoon = path.find((pt) => pt.x >= CENTER_X + 10 && pt.t < 0.35);
      if (crossingSoon && crossingSoon.vx < 550) {
        const aim = this.chooseAttackTarget(state);
        const dx = aim.x - crossingSoon.x;
        const dy = aim.y - crossingSoon.y;
        const len = Math.hypot(dx, dy) || 1;
        desiredTarget = {
          x: Math.max(CENTER_X + STRIKER_RADIUS + 6, crossingSoon.x - (dx / len) * 28),
          y: crossingSoon.y - (dy / len) * 28,
        };
      } else {
        // Compute line from human striker through puck toward our goal!
        // Anticipate where the human could fire next and seal that lane dynamically.
        const vecX = puck.x - p1.x;
        const vecY = puck.y - p1.y;
        let threatY = CENTER_Y;

        if (vecX > 20 && Math.hypot(vecX, vecY) < 260) {
          const slope = vecY / vecX;
          const projectedY = puck.y + slope * (homeX - puck.x);
          // Clamp within goal guard zone
          threatY = Math.max(
            CENTER_Y - GOAL_HALF_HEIGHT + 16,
            Math.min(CENTER_Y + GOAL_HALF_HEIGHT - 16, projectedY)
          );
        } else {
          // Track puck Y gently weighted toward goal center
          const puckTrackY = CENTER_Y + (puck.y - CENTER_Y) * 0.42;
          threatY = Math.max(
            CENTER_Y - GOAL_HALF_HEIGHT + 20,
            Math.min(CENTER_Y + GOAL_HALF_HEIGHT - 20, puckTrackY)
          );
        }

        // Pull back slightly deeper if puck speed is high
        const guardX = puckSpeed > 650 ? TABLE_WIDTH - 86 : homeX;
        desiredTarget = { x: guardX, y: threatY };
      }
    }

    // Clamp strictly inside Bot's legal half and rounded corners, then move physically
    const clampedTarget = clampStrikerPosition(2, desiredTarget.x, desiredTarget.y);
    return this.moveToward(bot, clampedTarget, dt, BOT_MAX_SPEED);
  }

  private moveToward(current: Vec2, target: Vec2, dt: number, maxSpeed: number): Vec2 {
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    const dist = Math.hypot(dx, dy);
    const maxStep = maxSpeed * dt;

    if (dist <= maxStep || dist < 1e-4) {
      return clampStrikerPosition(2, target.x, target.y);
    }

    const scale = maxStep / dist;
    return clampStrikerPosition(2, current.x + dx * scale, current.y + dy * scale);
  }
}
