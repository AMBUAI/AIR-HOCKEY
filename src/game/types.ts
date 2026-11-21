export type GameMode = 'bot' | 'online';

export type ScreenView =
  | 'menu'
  | 'online_hub'
  | 'lobby'
  | 'playing'
  | 'settings'
  | 'rulebook'
  | 'about';

export type MatchPhase =
  | 'WAITING'
  | 'SERVE_COUNTDOWN'
  | 'PLAYING'
  | 'GOAL_CELEBRATION'
  | 'PAUSED_DISCONNECT'
  | 'MATCH_OVER';

export type PlayerSide = 1 | 2;

export interface Vec2 {
  x: number;
  y: number;
}

export interface PuckState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface StrikerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PhysicsEvent {
  type: 'striker_hit' | 'wall_hit' | 'goal' | 'oob_recover';
  intensity: number;
  x: number;
  y: number;
  scorer?: PlayerSide;
}

export interface MatchState {
  phase: MatchPhase;
  score1: number;
  score2: number;
  servingSide: PlayerSide;
  countdownMs: number;
  goalBannerTimerMs: number;
  lastScorer: PlayerSide | null;
  winner: PlayerSide | null;
  puck: PuckState;
  striker1: StrikerState;
  striker2: StrikerState;
  tick: number;
}

export interface AudioSettings {
  sfxEnabled: boolean;
  musicEnabled: boolean;
  masterVolume: number; // 0 to 1
  sfxVolume: number; // 0 to 1
  musicVolume: number; // 0 to 1
}

export interface PlayerInfo {
  side: PlayerSide;
  name: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  rematchVote: boolean;
}

export interface RoomSnapshot {
  code: string;
  locked: boolean;
  inMatch: boolean;
  player1: PlayerInfo | null;
  player2: PlayerInfo | null;
  match: MatchState | null;
  serverTime: number;
}

export type ClientWsMessage =
  | { type: 'create_room'; name: string; playerToken: string }
  | { type: 'join_room'; code: string; name: string; playerToken: string }
  | { type: 'rejoin_room'; code: string; name: string; playerToken: string }
  | { type: 'toggle_ready'; ready: boolean }
  | { type: 'start_match' }
  | { type: 'striker_input'; x: number; y: number; seq: number }
  | { type: 'rematch_vote'; vote: boolean }
  | { type: 'leave_room' }
  | { type: 'ping'; ts: number };

export type ServerWsMessage =
  | { type: 'room_joined'; side: PlayerSide; room: RoomSnapshot }
  | { type: 'room_update'; room: RoomSnapshot }
  | { type: 'match_state'; match: MatchState; events: PhysicsEvent[]; serverTime: number }
  | { type: 'match_end'; match: MatchState; winner: PlayerSide }
  | { type: 'room_closed'; reason: string }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong'; ts: number; serverTime: number };
