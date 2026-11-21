import {
  CENTER_X,
  CENTER_Y,
  COLORS,
  CORNER_RADIUS,
  GOAL_DEPTH,
  GOAL_HALF_HEIGHT,
  POST_RADIUS,
  PUCK_RADIUS,
  STRIKER_RADIUS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
} from './constants';
import { MatchState, PlayerSide, Vec2 } from './types';

export interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface TableViewport {
  scale: number;
  offsetX: number;
  offsetY: number;
  logicalWidth: number;
  logicalHeight: number;
}

// Logical view includes goal pockets and outer neon frame glow margin
export const VIEW_PAD_X = GOAL_DEPTH + 18;
export const VIEW_PAD_Y = 18;
export const LOGICAL_WIDTH = TABLE_WIDTH + VIEW_PAD_X * 2;
export const LOGICAL_HEIGHT = TABLE_HEIGHT + VIEW_PAD_Y * 2;

export function computeTableViewport(canvasCssWidth: number, canvasCssHeight: number): TableViewport {
  const scaleX = canvasCssWidth / LOGICAL_WIDTH;
  const scaleY = canvasCssHeight / LOGICAL_HEIGHT;
  const scale = Math.min(scaleX, scaleY);

  const renderedW = LOGICAL_WIDTH * scale;
  const renderedH = LOGICAL_HEIGHT * scale;

  const offsetX = (canvasCssWidth - renderedW) / 2 + VIEW_PAD_X * scale;
  const offsetY = (canvasCssHeight - renderedH) / 2 + VIEW_PAD_Y * scale;

  return {
    scale,
    offsetX,
    offsetY,
    logicalWidth: LOGICAL_WIDTH,
    logicalHeight: LOGICAL_HEIGHT,
  };
}

export function clientToTableCoords(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  viewport: TableViewport
): Vec2 {
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  return {
    x: (localX - viewport.offsetX) / viewport.scale,
    y: (localY - viewport.offsetY) / viewport.scale,
  };
}

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export interface RenderOptions {
  state: MatchState;
  localSide: PlayerSide;
  isHoldingStriker: boolean;
  puckTrail: Vec2[];
  particles: SparkParticle[];
  goalFlashAlpha: number;
  goalFlashSide: PlayerSide | null;
  timeSec: number;
}

export function renderAirHockeyTable(
  ctx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  opts: RenderOptions
): TableViewport {
  const viewport = computeTableViewport(cssWidth, cssHeight);
  const { state, localSide, isHoldingStriker, puckTrail, particles, goalFlashAlpha, goalFlashSide, timeSec } = opts;

  ctx.save();
  ctx.scale(dpr, dpr);

  // Clear outer background
  ctx.fillStyle = COLORS.bgDeep;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  // Transform into table coordinates (0..TABLE_WIDTH, 0..TABLE_HEIGHT)
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  const goalTop = CENTER_Y - GOAL_HALF_HEIGHT;
  const goalBottom = CENTER_Y + GOAL_HALF_HEIGHT;

  // 1. Goal Pockets (recessed behind left & right goal mouths)
  // Left Goal Pocket (Player 1 defends, Cyan)
  ctx.save();
  ctx.fillStyle = '#060A14';
  ctx.strokeStyle = COLORS.p1Cyan;
  ctx.lineWidth = 3;
  ctx.shadowColor = COLORS.p1Cyan;
  ctx.shadowBlur = goalFlashSide === 2 && goalFlashAlpha > 0 ? 28 : 12;
  ctx.beginPath();
  ctx.roundRect(-GOAL_DEPTH, goalTop, GOAL_DEPTH + 4, GOAL_HALF_HEIGHT * 2, [10, 0, 0, 10]);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Right Goal Pocket (Player 2 defends, Pink)
  ctx.save();
  ctx.fillStyle = '#0F0614';
  ctx.strokeStyle = COLORS.p2Pink;
  ctx.lineWidth = 3;
  ctx.shadowColor = COLORS.p2Pink;
  ctx.shadowBlur = goalFlashSide === 1 && goalFlashAlpha > 0 ? 28 : 12;
  ctx.beginPath();
  ctx.roundRect(TABLE_WIDTH - 4, goalTop, GOAL_DEPTH + 4, GOAL_HALF_HEIGHT * 2, [0, 10, 10, 0]);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 2. Main Table Surface
  ctx.save();
  traceRoundedRect(ctx, 0, 0, TABLE_WIDTH, TABLE_HEIGHT, CORNER_RADIUS);
  const surfaceGrad = ctx.createLinearGradient(0, 0, TABLE_WIDTH, 0);
  surfaceGrad.addColorStop(0, '#08101E');
  surfaceGrad.addColorStop(0.5, '#090D16');
  surfaceGrad.addColorStop(1, '#14091A');
  ctx.fillStyle = surfaceGrad;
  ctx.fill();
  ctx.clip();

  // Subtle air-cushion table micro perforations
  ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
  for (let gx = 40; gx < TABLE_WIDTH; gx += 40) {
    for (let gy = 30; gy < TABLE_HEIGHT; gy += 40) {
      ctx.fillRect(gx - 1, gy - 1, 2, 2);
    }
  }

  // Subtle half-court ambient glow
  const leftAmbient = ctx.createRadialGradient(0, CENTER_Y, 10, 0, CENTER_Y, 320);
  leftAmbient.addColorStop(0, 'rgba(0, 229, 255, 0.14)');
  leftAmbient.addColorStop(1, 'rgba(0, 229, 255, 0)');
  ctx.fillStyle = leftAmbient;
  ctx.fillRect(0, 0, CENTER_X, TABLE_HEIGHT);

  const rightAmbient = ctx.createRadialGradient(TABLE_WIDTH, CENTER_Y, 10, TABLE_WIDTH, CENTER_Y, 320);
  rightAmbient.addColorStop(0, 'rgba(255, 42, 133, 0.14)');
  rightAmbient.addColorStop(1, 'rgba(255, 42, 133, 0)');
  ctx.fillStyle = rightAmbient;
  ctx.fillRect(CENTER_X, 0, CENTER_X, TABLE_HEIGHT);

  // Center line & center faceoff markings
  const pulse = 0.72 + Math.sin(timeSec * 2.4) * 0.12;
  ctx.strokeStyle = `rgba(148, 163, 184, ${0.28 * pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CENTER_X, 0);
  ctx.lineTo(CENTER_X, TABLE_HEIGHT);
  ctx.stroke();

  // Center circle
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y, 76, 0, Math.PI * 2);
  ctx.stroke();

  // Inner faceoff ring
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y, 18, 0, Math.PI * 2);
  ctx.stroke();

  // Goal Crease Arcs
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.38)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, CENTER_Y, GOAL_HALF_HEIGHT + 18, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 42, 133, 0.38)';
  ctx.beginPath();
  ctx.arc(TABLE_WIDTH, CENTER_Y, GOAL_HALF_HEIGHT + 18, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.stroke();

  // Goal flash overlay when a point is scored
  if (goalFlashAlpha > 0 && goalFlashSide) {
    const flashColor = goalFlashSide === 1 ? 'rgba(0, 229, 255,' : 'rgba(255, 42, 133,';
    ctx.fillStyle = `${flashColor} ${(goalFlashAlpha * 0.22).toFixed(3)})`;
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
  }

  ctx.restore();

  // 3. Illuminated Table Boundary Rails (split Cyan left / Pink right, leaving goal mouths open)
  ctx.save();
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';

  // Left half rail (Cyan): Top-center -> Top-left corner -> Left-top post, and Bottom-center -> Bottom-left corner -> Left-bottom post
  ctx.strokeStyle = COLORS.p1Cyan;
  ctx.shadowColor = COLORS.p1Cyan;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(CENTER_X, 0);
  ctx.lineTo(CORNER_RADIUS, 0);
  ctx.arcTo(0, 0, 0, CORNER_RADIUS, CORNER_RADIUS);
  ctx.lineTo(0, goalTop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, goalBottom);
  ctx.lineTo(0, TABLE_HEIGHT - CORNER_RADIUS);
  ctx.arcTo(0, TABLE_HEIGHT, CORNER_RADIUS, TABLE_HEIGHT, CORNER_RADIUS);
  ctx.lineTo(CENTER_X, TABLE_HEIGHT);
  ctx.stroke();

  // Right half rail (Pink)
  ctx.strokeStyle = COLORS.p2Pink;
  ctx.shadowColor = COLORS.p2Pink;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(CENTER_X, 0);
  ctx.lineTo(TABLE_WIDTH - CORNER_RADIUS, 0);
  ctx.arcTo(TABLE_WIDTH, 0, TABLE_WIDTH, CORNER_RADIUS, CORNER_RADIUS);
  ctx.lineTo(TABLE_WIDTH, goalTop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(TABLE_WIDTH, goalBottom);
  ctx.lineTo(TABLE_WIDTH, TABLE_HEIGHT - CORNER_RADIUS);
  ctx.arcTo(TABLE_WIDTH, TABLE_HEIGHT, TABLE_WIDTH - CORNER_RADIUS, TABLE_HEIGHT, CORNER_RADIUS);
  ctx.lineTo(CENTER_X, TABLE_HEIGHT);
  ctx.stroke();
  ctx.restore();

  // Subtle dashed neon goal line thresholds
  ctx.save();
  ctx.setLineDash([7, 7]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
  ctx.beginPath();
  ctx.moveTo(0, goalTop + POST_RADIUS);
  ctx.lineTo(0, goalBottom - POST_RADIUS);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 42, 133, 0.45)';
  ctx.beginPath();
  ctx.moveTo(TABLE_WIDTH, goalTop + POST_RADIUS);
  ctx.lineTo(TABLE_WIDTH, goalBottom - POST_RADIUS);
  ctx.stroke();
  ctx.restore();

  // 4. Goal Posts
  const posts: { x: number; y: number; color: string }[] = [
    { x: 0, y: goalTop, color: COLORS.p1Cyan },
    { x: 0, y: goalBottom, color: COLORS.p1Cyan },
    { x: TABLE_WIDTH, y: goalTop, color: COLORS.p2Pink },
    { x: TABLE_WIDTH, y: goalBottom, color: COLORS.p2Pink },
  ];
  for (const post of posts) {
    ctx.save();
    ctx.fillStyle = '#F8FAFC';
    ctx.shadowColor = post.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(post.x, post.y, POST_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 5. Puck Velocity Trail
  if (puckTrail.length > 1) {
    for (let i = 0; i < puckTrail.length - 1; i++) {
      const pt = puckTrail[i];
      const frac = (i + 1) / puckTrail.length;
      ctx.fillStyle = `rgba(56, 189, 248, ${(frac * 0.24).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, PUCK_RADIUS * (0.45 + frac * 0.48), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 6. Spark Particles
  for (const sp of particles) {
    const alpha = Math.max(0, sp.life / sp.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = sp.color;
    ctx.shadowColor = sp.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 7. Puck
  drawPuck(ctx, state.puck.x, state.puck.y, state.phase === 'SERVE_COUNTDOWN', timeSec);

  // 8. Strikers
  drawStriker(
    ctx,
    state.striker1.x,
    state.striker1.y,
    COLORS.p1Cyan,
    localSide === 1,
    localSide === 1 && isHoldingStriker,
    timeSec
  );
  drawStriker(
    ctx,
    state.striker2.x,
    state.striker2.y,
    COLORS.p2Pink,
    localSide === 2,
    localSide === 2 && isHoldingStriker,
    timeSec
  );

  ctx.restore();
  return viewport;
}

function drawPuck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isServeLocked: boolean,
  timeSec: number
): void {
  ctx.save();

  // Outer glow
  ctx.shadowColor = isServeLocked ? '#FACC15' : '#38BDF8';
  ctx.shadowBlur = isServeLocked ? 20 + Math.sin(timeSec * 10) * 6 : 16;

  // Puck disc
  const grad = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, PUCK_RADIUS);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(0.65, '#E2E8F0');
  grad.addColorStop(1, '#38BDF8');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, PUCK_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Crisp inner ring
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isServeLocked ? '#FACC15' : '#0284C7';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, PUCK_RADIUS * 0.62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawStriker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  accentColor: string,
  isLocal: boolean,
  isHeld: boolean,
  timeSec: number
): void {
  ctx.save();

  // Active finger-hold feedback halo or idle local prompt ring
  if (isHeld) {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.arc(x, y, STRIKER_RADIUS + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (isLocal) {
    const idlePulse = 0.3 + Math.sin(timeSec * 4) * 0.15;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.globalAlpha = idlePulse;
    ctx.beginPath();
    ctx.arc(x, y, STRIKER_RADIUS + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Main striker base
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = isHeld ? 24 : 15;

  const baseGrad = ctx.createRadialGradient(x - 6, y - 6, 4, x, y, STRIKER_RADIUS);
  baseGrad.addColorStop(0, '#1E293B');
  baseGrad.addColorStop(0.75, '#0F172A');
  baseGrad.addColorStop(1, accentColor);

  ctx.fillStyle = baseGrad;
  ctx.beginPath();
  ctx.arc(x, y, STRIKER_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Outer neon rim
  ctx.shadowBlur = 0;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(x, y, STRIKER_RADIUS - 1.5, 0, Math.PI * 2);
  ctx.stroke();

  // Inner grip ring
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, STRIKER_RADIUS * 0.56, 0, Math.PI * 2);
  ctx.stroke();

  // Center cap
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.arc(x, y, STRIKER_RADIUS * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
