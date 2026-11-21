import {
  CENTER_X,
  CENTER_Y,
  CORNER_RADIUS,
  GOAL_HALF_HEIGHT,
  MAX_PUCK_SPEED,
  MIN_PUCK_STOP_SPEED,
  PHYSICS_SUBSTEPS,
  POST_RADIUS,
  POST_RESTITUTION,
  PUCK_FRICTION,
  PUCK_RADIUS,
  STRIKER_RADIUS,
  STRIKER_RESTITUTION,
  STRIKER_VELOCITY_TRANSFER,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  WALL_RESTITUTION,
} from './constants.ts';
import type { MatchState, PhysicsEvent, PlayerSide, PuckState, StrikerState, Vec2 } from './types.ts';

const GOAL_TOP = CENTER_Y - GOAL_HALF_HEIGHT;
const GOAL_BOTTOM = CENTER_Y + GOAL_HALF_HEIGHT;

const GOAL_POSTS: Vec2[] = [
  { x: 0, y: GOAL_TOP },
  { x: 0, y: GOAL_BOTTOM },
  { x: TABLE_WIDTH, y: GOAL_TOP },
  { x: TABLE_WIDTH, y: GOAL_BOTTOM },
];

const CORNER_CENTERS: Vec2[] = [
  { x: CORNER_RADIUS, y: CORNER_RADIUS },
  { x: TABLE_WIDTH - CORNER_RADIUS, y: CORNER_RADIUS },
  { x: CORNER_RADIUS, y: TABLE_HEIGHT - CORNER_RADIUS },
  { x: TABLE_WIDTH - CORNER_RADIUS, y: TABLE_HEIGHT - CORNER_RADIUS },
];

export function clampStrikerPosition(side: PlayerSide, x: number, y: number): Vec2 {
  const minX = side === 1 ? STRIKER_RADIUS : CENTER_X + STRIKER_RADIUS;
  const maxX = side === 1 ? CENTER_X - STRIKER_RADIUS : TABLE_WIDTH - STRIKER_RADIUS;
  const minY = STRIKER_RADIUS;
  const maxY = TABLE_HEIGHT - STRIKER_RADIUS;

  let cx = Number.isFinite(x) ? Math.max(minX, Math.min(maxX, x)) : side === 1 ? 140 : TABLE_WIDTH - 140;
  let cy = Number.isFinite(y) ? Math.max(minY, Math.min(maxY, y)) : CENTER_Y;

  // Enforce rounded table corners for strikers
  const inLeftCornerZone = cx < CORNER_RADIUS;
  const inRightCornerZone = cx > TABLE_WIDTH - CORNER_RADIUS;
  const inTopCornerZone = cy < CORNER_RADIUS;
  const inBottomCornerZone = cy > TABLE_HEIGHT - CORNER_RADIUS;

  if ((inLeftCornerZone || inRightCornerZone) && (inTopCornerZone || inBottomCornerZone)) {
    const cornerX = inLeftCornerZone ? CORNER_RADIUS : TABLE_WIDTH - CORNER_RADIUS;
    const cornerY = inTopCornerZone ? CORNER_RADIUS : TABLE_HEIGHT - CORNER_RADIUS;
    const dx = cx - cornerX;
    const dy = cy - cornerY;
    const dist = Math.hypot(dx, dy);
    const maxCornerDist = CORNER_RADIUS - STRIKER_RADIUS;
    if (dist > maxCornerDist && dist > 1e-6) {
      const scale = maxCornerDist / dist;
      cx = cornerX + dx * scale;
      cy = cornerY + dy * scale;
      // Re-clamp half boundary just in case
      cx = Math.max(minX, Math.min(maxX, cx));
    }
  }

  return { x: cx, y: cy };
}

export function createInitialMatchState(startingServe: PlayerSide = 1): MatchState {
  return {
    phase: 'SERVE_COUNTDOWN',
    score1: 0,
    score2: 0,
    servingSide: startingServe,
    countdownMs: 1200,
    goalBannerTimerMs: 0,
    lastScorer: null,
    winner: null,
    puck: createServePuck(startingServe),
    striker1: { x: 140, y: CENTER_Y, vx: 0, vy: 0 },
    striker2: { x: TABLE_WIDTH - 140, y: CENTER_Y, vx: 0, vy: 0 },
    tick: 0,
  };
}

export function createServePuck(servingSide: PlayerSide): PuckState {
  // Place puck slightly on the serving player's side of the center circle, stationary
  const offset = servingSide === 1 ? -46 : 46;
  return {
    x: CENTER_X + offset,
    y: CENTER_Y,
    vx: 0,
    vy: 0,
  };
}

export function resetPositionsForServe(state: MatchState, servingSide: PlayerSide): void {
  state.servingSide = servingSide;
  state.puck = createServePuck(servingSide);
  state.striker1 = { x: 140, y: CENTER_Y, vx: 0, vy: 0 };
  state.striker2 = { x: TABLE_WIDTH - 140, y: CENTER_Y, vx: 0, vy: 0 };
}

function resolvePuckWallCollisions(puck: PuckState, events: PhysicsEvent[], allowEvents: boolean): void {
  const inGoalMouthY = puck.y > GOAL_TOP + POST_RADIUS * 0.4 && puck.y < GOAL_BOTTOM - POST_RADIUS * 0.4;

  // 1. Top and Bottom rails (or goal chute top/bottom when inside goal pocket)
  if (puck.x < 0 || puck.x > TABLE_WIDTH) {
    // Inside goal pocket chute
    const chuteMinY = GOAL_TOP + PUCK_RADIUS;
    const chuteMaxY = GOAL_BOTTOM - PUCK_RADIUS;
    if (puck.y < chuteMinY) {
      puck.y = chuteMinY;
      if (puck.vy < 0) puck.vy = -puck.vy * WALL_RESTITUTION;
    } else if (puck.y > chuteMaxY) {
      puck.y = chuteMaxY;
      if (puck.vy > 0) puck.vy = -puck.vy * WALL_RESTITUTION;
    }
  } else {
    if (puck.y < PUCK_RADIUS) {
      puck.y = PUCK_RADIUS;
      if (puck.vy < 0) {
        const speed = Math.abs(puck.vy);
        puck.vy = -puck.vy * WALL_RESTITUTION;
        if (allowEvents && speed > 65) {
          events.push({ type: 'wall_hit', intensity: Math.min(1, speed / 950), x: puck.x, y: puck.y });
        }
      }
    } else if (puck.y > TABLE_HEIGHT - PUCK_RADIUS) {
      puck.y = TABLE_HEIGHT - PUCK_RADIUS;
      if (puck.vy > 0) {
        const speed = Math.abs(puck.vy);
        puck.vy = -puck.vy * WALL_RESTITUTION;
        if (allowEvents && speed > 65) {
          events.push({ type: 'wall_hit', intensity: Math.min(1, speed / 950), x: puck.x, y: puck.y });
        }
      }
    }
  }

  // 2. Left and Right end walls outside the goal opening
  if (!inGoalMouthY) {
    if (puck.x < PUCK_RADIUS && puck.x > -PUCK_RADIUS * 0.5) {
      puck.x = PUCK_RADIUS;
      if (puck.vx < 0) {
        const speed = Math.abs(puck.vx);
        puck.vx = -puck.vx * WALL_RESTITUTION;
        if (allowEvents && speed > 65) {
          events.push({ type: 'wall_hit', intensity: Math.min(1, speed / 950), x: puck.x, y: puck.y });
        }
      }
    } else if (puck.x > TABLE_WIDTH - PUCK_RADIUS && puck.x < TABLE_WIDTH + PUCK_RADIUS * 0.5) {
      puck.x = TABLE_WIDTH - PUCK_RADIUS;
      if (puck.vx > 0) {
        const speed = Math.abs(puck.vx);
        puck.vx = -puck.vx * WALL_RESTITUTION;
        if (allowEvents && speed > 65) {
          events.push({ type: 'wall_hit', intensity: Math.min(1, speed / 950), x: puck.x, y: puck.y });
        }
      }
    }
  }

  // 3. Rounded Corners (4 quadrants)
  const inLeftC = puck.x < CORNER_RADIUS && puck.x >= 0;
  const inRightC = puck.x > TABLE_WIDTH - CORNER_RADIUS && puck.x <= TABLE_WIDTH;
  const inTopC = puck.y < CORNER_RADIUS;
  const inBottomC = puck.y > TABLE_HEIGHT - CORNER_RADIUS;

  if ((inLeftC || inRightC) && (inTopC || inBottomC)) {
    const cornerIndex = (inRightC ? 1 : 0) + (inBottomC ? 2 : 0);
    const corner = CORNER_CENTERS[cornerIndex];
    const dx = puck.x - corner.x;
    const dy = puck.y - corner.y;
    const dist = Math.hypot(dx, dy);
    const maxDist = CORNER_RADIUS - PUCK_RADIUS;

    if (dist > maxDist && dist > 1e-6) {
      const nx = dx / dist;
      const ny = dy / dist;
      puck.x = corner.x + nx * maxDist;
      puck.y = corner.y + ny * maxDist;

      const vn = puck.vx * nx + puck.vy * ny;
      if (vn > 0) {
        puck.vx -= (1 + WALL_RESTITUTION) * vn * nx;
        puck.vy -= (1 + WALL_RESTITUTION) * vn * ny;
        if (allowEvents && vn > 65) {
          events.push({ type: 'wall_hit', intensity: Math.min(1, vn / 950), x: puck.x, y: puck.y });
        }
      }
    }
  }

  // 4. Goal Posts (4 solid circular posts at goal mouth edges)
  for (const post of GOAL_POSTS) {
    const dx = puck.x - post.x;
    const dy = puck.y - post.y;
    const dist = Math.hypot(dx, dy);
    const minDist = PUCK_RADIUS + POST_RADIUS;
    if (dist < minDist && dist > 1e-6) {
      const nx = dx / dist;
      const ny = dy / dist;
      puck.x = post.x + nx * minDist;
      puck.y = post.y + ny * minDist;

      const vn = puck.vx * nx + puck.vy * ny;
      if (vn < 0) {
        puck.vx -= (1 + POST_RESTITUTION) * vn * nx;
        puck.vy -= (1 + POST_RESTITUTION) * vn * ny;
        if (allowEvents && Math.abs(vn) > 65) {
          events.push({ type: 'wall_hit', intensity: Math.min(1, Math.abs(vn) / 900), x: puck.x, y: puck.y });
        }
      }
    }
  }
}

function resolvePuckStrikerCollision(
  puck: PuckState,
  striker: StrikerState,
  events: PhysicsEvent[],
  allowEvents: boolean
): void {
  const dx = puck.x - striker.x;
  const dy = puck.y - striker.y;
  const dist = Math.hypot(dx, dy);
  const minDist = PUCK_RADIUS + STRIKER_RADIUS;

  if (dist < minDist) {
    let nx = 1;
    let ny = 0;
    if (dist > 1e-5) {
      nx = dx / dist;
      ny = dy / dist;
    } else {
      // Fallback separation direction toward table center if exact overlap
      const toCenterX = CENTER_X - striker.x;
      const toCenterY = CENTER_Y - striker.y;
      const cLen = Math.hypot(toCenterX, toCenterY) || 1;
      nx = toCenterX / cLen;
      ny = toCenterY / cLen;
    }

    // Separate puck outside striker
    const overlap = minDist - dist;
    puck.x += nx * (overlap + 0.4);
    puck.y += ny * (overlap + 0.4);

    // Relative velocity along contact normal
    const rvx = puck.vx - striker.vx;
    const rvy = puck.vy - striker.vy;
    const velAlongNormal = rvx * nx + rvy * ny;

    if (velAlongNormal < 0) {
      const impulse = -(1 + STRIKER_RESTITUTION) * velAlongNormal;
      puck.vx += impulse * nx;
      puck.vy += impulse * ny;

      // Add subtle striker tangential transfer for realistic spin/cut shots
      const tx = -ny;
      const ty = nx;
      const strikerTangential = striker.vx * tx + striker.vy * ty;
      puck.vx += strikerTangential * 0.14 * tx;
      puck.vy += strikerTangential * 0.14 * ty;

      // Ensure energetic striker hits feel crisp
      const strikerSpeed = Math.hypot(striker.vx, striker.vy);
      if (strikerSpeed > 80) {
        const boost = Math.min(260, strikerSpeed * 0.15) * STRIKER_VELOCITY_TRANSFER;
        puck.vx += nx * boost;
        puck.vy += ny * boost;
      }

      if (allowEvents && Math.abs(velAlongNormal) > 30) {
        events.push({
          type: 'striker_hit',
          intensity: Math.min(1, Math.abs(velAlongNormal) / 1000),
          x: puck.x - nx * PUCK_RADIUS,
          y: puck.y - ny * PUCK_RADIUS,
        });
      }
    } else {
      // Anti-pinning push if striker moved softly into puck
      puck.vx += striker.vx * 0.35 + nx * 40;
      puck.vy += striker.vy * 0.35 + ny * 40;
    }

    // Clamp max puck speed
    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed > MAX_PUCK_SPEED) {
      const scale = MAX_PUCK_SPEED / speed;
      puck.vx *= scale;
      puck.vy *= scale;
    }
  }
}

export function stepPhysics(
  state: MatchState,
  target1: Vec2,
  target2: Vec2,
  dt: number
): PhysicsEvent[] {
  const events: PhysicsEvent[] = [];

  const clamped1 = clampStrikerPosition(1, target1.x, target1.y);
  const clamped2 = clampStrikerPosition(2, target2.x, target2.y);

  const start1X = state.striker1.x;
  const start1Y = state.striker1.y;
  const start2X = state.striker2.x;
  const start2Y = state.striker2.y;

  const invDt = dt > 1e-6 ? 1 / dt : 60;
  state.striker1.vx = (clamped1.x - start1X) * invDt;
  state.striker1.vy = (clamped1.y - start1Y) * invDt;
  state.striker2.vx = (clamped2.x - start2X) * invDt;
  state.striker2.vy = (clamped2.y - start2Y) * invDt;

  // During countdown, goal celebration, disconnect pause, or match over:
  // allow strikers to position smoothly (except frozen on match over) and keep puck locked
  if (state.phase === 'MATCH_OVER' || state.phase === 'PAUSED_DISCONNECT') {
    state.striker1.vx = 0;
    state.striker1.vy = 0;
    state.striker2.vx = 0;
    state.striker2.vy = 0;
    return events;
  }

  if (state.phase === 'SERVE_COUNTDOWN') {
    state.striker1.x = clamped1.x;
    state.striker1.y = clamped1.y;
    state.striker2.x = clamped2.x;
    state.striker2.y = clamped2.y;
    // Prevent striker from touching stationary serve puck before countdown ends
    state.puck = createServePuck(state.servingSide);
    return events;
  }

  if (state.phase === 'GOAL_CELEBRATION') {
    state.striker1.x = clamped1.x;
    state.striker1.y = clamped1.y;
    state.striker2.x = clamped2.x;
    state.striker2.y = clamped2.y;
    return events;
  }

  // Active PLAYING physics with substeps
  const subDt = dt / PHYSICS_SUBSTEPS;
  const frictionPerSubstep = Math.pow(PUCK_FRICTION, (dt * 60) / PHYSICS_SUBSTEPS);
  let scoredThisStep: PlayerSide | null = null;

  for (let step = 1; step <= PHYSICS_SUBSTEPS; step++) {
    const t = step / PHYSICS_SUBSTEPS;
    state.striker1.x = start1X + (clamped1.x - start1X) * t;
    state.striker1.y = start1Y + (clamped1.y - start1Y) * t;
    state.striker2.x = start2X + (clamped2.x - start2X) * t;
    state.striker2.y = start2Y + (clamped2.y - start2Y) * t;

    state.puck.x += state.puck.vx * subDt;
    state.puck.y += state.puck.vy * subDt;

    state.puck.vx *= frictionPerSubstep;
    state.puck.vy *= frictionPerSubstep;

    // Resolve walls, striker collisions, and walls again to prevent wall-pin tunneling
    resolvePuckWallCollisions(state.puck, events, step === 1 || events.length < 3);
    resolvePuckStrikerCollision(state.puck, state.striker1, events, true);
    resolvePuckStrikerCollision(state.puck, state.striker2, events, true);
    resolvePuckWallCollisions(state.puck, events, false);

    // Clamp max puck speed
    const speed = Math.hypot(state.puck.vx, state.puck.vy);
    if (speed > MAX_PUCK_SPEED) {
      const s = MAX_PUCK_SPEED / speed;
      state.puck.vx *= s;
      state.puck.vy *= s;
    }

    // Check valid goal: puck completely crosses the goal line inside the goal opening
    const inGoalMouth = state.puck.y > GOAL_TOP && state.puck.y < GOAL_BOTTOM;
    if (inGoalMouth && state.puck.x <= -PUCK_RADIUS) {
      scoredThisStep = 2; // Player 2 scored in Player 1's (left) goal
      break;
    }
    if (inGoalMouth && state.puck.x >= TABLE_WIDTH + PUCK_RADIUS) {
      scoredThisStep = 1; // Player 1 scored in Player 2's (right) goal
      break;
    }

    // Out-of-bounds safety recovery
    if (
      !Number.isFinite(state.puck.x) ||
      !Number.isFinite(state.puck.y) ||
      !Number.isFinite(state.puck.vx) ||
      !Number.isFinite(state.puck.vy) ||
      state.puck.y < -40 ||
      state.puck.y > TABLE_HEIGHT + 40 ||
      state.puck.x < -110 ||
      state.puck.x > TABLE_WIDTH + 110
    ) {
      state.puck = { x: CENTER_X, y: CENTER_Y, vx: 0, vy: 0 };
      events.push({ type: 'oob_recover', intensity: 1, x: CENTER_X, y: CENTER_Y });
      break;
    }
  }

  // Snap nearly-stopped puck to 0
  if (Math.hypot(state.puck.vx, state.puck.vy) < MIN_PUCK_STOP_SPEED) {
    state.puck.vx = 0;
    state.puck.vy = 0;
  }

  if (scoredThisStep) {
    events.push({
      type: 'goal',
      intensity: 1,
      x: state.puck.x,
      y: state.puck.y,
      scorer: scoredThisStep,
    });
  }

  state.tick += 1;
  return events;
}
