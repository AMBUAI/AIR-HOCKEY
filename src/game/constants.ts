import type { AudioSettings } from './types.ts';

export const TABLE_WIDTH = 1000;
export const TABLE_HEIGHT = 540;
export const CENTER_X = TABLE_WIDTH / 2;
export const CENTER_Y = TABLE_HEIGHT / 2;

export const CORNER_RADIUS = 64;
export const GOAL_HALF_HEIGHT = 96; // Total goal mouth = 192px
export const GOAL_DEPTH = 38;
export const POST_RADIUS = 8;

export const PUCK_RADIUS = 20;
export const STRIKER_RADIUS = 34;

export const WINNING_SCORE = 11;

export const FIXED_DT = 1 / 60;
export const PHYSICS_SUBSTEPS = 6;

// Physics feel constants
export const PUCK_FRICTION = 0.994; // Per 60Hz frame air cushion glide
export const WALL_RESTITUTION = 0.86;
export const POST_RESTITUTION = 0.84;
export const STRIKER_RESTITUTION = 0.90;
export const STRIKER_VELOCITY_TRANSFER = 0.88;
export const MAX_PUCK_SPEED = 1650;
export const MIN_PUCK_STOP_SPEED = 4;

// Serve & celebration timing
export const SERVE_COUNTDOWN_MS = 1200;
export const GOAL_CELEBRATION_MS = 1350;
export const DISCONNECT_RESUME_COUNTDOWN_MS = 1800;

// Striker movement limits (shared physically between human interpolation & Bot AI)
export const BOT_MAX_SPEED = 1320;
export const HUMAN_MAX_STEP_SPEED = 3200;

// Colors
export const COLORS = {
  bgDeep: '#07090F',
  surface: '#0D111C',
  tableSurface: '#090D16',
  p1Cyan: '#00E5FF',
  p1Glow: 'rgba(0, 229, 255, 0.55)',
  p2Pink: '#FF2A85',
  p2Glow: 'rgba(255, 42, 133, 0.55)',
  puckCore: '#F8FAFC',
  puckRing: '#38BDF8',
  lineNeutral: 'rgba(148, 163, 184, 0.22)',
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  sfxEnabled: true,
  musicEnabled: true,
  masterVolume: 0.85,
  sfxVolume: 0.9,
  musicVolume: 0.45,
};
