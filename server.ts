import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  CENTER_Y,
  DISCONNECT_RESUME_COUNTDOWN_MS,
  FIXED_DT,
  GOAL_CELEBRATION_MS,
  SERVE_COUNTDOWN_MS,
  TABLE_WIDTH,
  WINNING_SCORE,
} from './src/game/constants.ts';
import {
  clampStrikerPosition,
  createInitialMatchState,
  resetPositionsForServe,
  stepPhysics,
} from './src/game/physics.ts';
import type {
  ClientWsMessage,
  MatchPhase,
  MatchState,
  PhysicsEvent,
  PlayerInfo,
  PlayerSide,
  RoomSnapshot,
  ServerWsMessage,
  Vec2,
} from './src/game/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_ABANDON_TTL_MS = 5 * 60 * 1000;

interface PlayerSlot {
  side: PlayerSide;
  name: string;
  token: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  rematchVote: boolean;
  ws: WebSocket | null;
  target: Vec2;
  lastSeenAt: number;
}

interface RoomInternal {
  code: string;
  locked: boolean;
  inMatch: boolean;
  createdAt: number;
  lastActivityAt: number;
  player1: PlayerSlot | null;
  player2: PlayerSlot | null;
  match: MatchState | null;
  savedPhaseBeforeDisconnect: MatchPhase | null;
  savedPuckVelBeforeDisconnect: Vec2 | null;
  loopInterval: NodeJS.Timeout | null;
  lastTickTime: number;
}

const rooms = new Map<string, RoomInternal>();
const wsToSession = new WeakMap<WebSocket, { roomCode: string; side: PlayerSide; token: string }>();

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function sanitizeName(raw: string, fallback: string): string {
  const cleaned = (raw || '').replace(/[^\w\s-]/g, '').trim().slice(0, 16);
  return cleaned.length > 0 ? cleaned : fallback;
}

function toPlayerInfo(slot: PlayerSlot | null): PlayerInfo | null {
  if (!slot) return null;
  return {
    side: slot.side,
    name: slot.name,
    isHost: slot.isHost,
    connected: slot.connected,
    ready: slot.ready,
    rematchVote: slot.rematchVote,
  };
}

function toRoomSnapshot(room: RoomInternal): RoomSnapshot {
  return {
    code: room.code,
    locked: room.locked,
    inMatch: room.inMatch,
    player1: toPlayerInfo(room.player1),
    player2: toPlayerInfo(room.player2),
    match: room.match,
    serverTime: Date.now(),
  };
}

function sendToWs(ws: WebSocket | null, payload: ServerWsMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // Ignore socket send errors
  }
}

function broadcastRoom(room: RoomInternal, payload: ServerWsMessage): void {
  if (room.player1?.connected) sendToWs(room.player1.ws, payload);
  if (room.player2?.connected) sendToWs(room.player2.ws, payload);
}

function stopRoomLoop(room: RoomInternal): void {
  if (room.loopInterval) {
    clearInterval(room.loopInterval);
    room.loopInterval = null;
  }
}

function destroyRoom(code: string, reason?: string): void {
  const room = rooms.get(code);
  if (!room) return;
  stopRoomLoop(room);
  if (reason) {
    broadcastRoom(room, { type: 'room_closed', reason });
  }
  rooms.delete(code);
}

function startMatchSimulation(room: RoomInternal, startingServe: PlayerSide = 1): void {
  stopRoomLoop(room);

  room.locked = true;
  room.inMatch = true;
  room.savedPhaseBeforeDisconnect = null;
  room.savedPuckVelBeforeDisconnect = null;
  room.match = createInitialMatchState(startingServe);
  room.match.countdownMs = SERVE_COUNTDOWN_MS;

  if (room.player1) {
    room.player1.target = { x: 140, y: CENTER_Y };
    room.player1.rematchVote = false;
  }
  if (room.player2) {
    room.player2.target = { x: TABLE_WIDTH - 140, y: CENTER_Y };
    room.player2.rematchVote = false;
  }

  broadcastRoom(room, { type: 'room_update', room: toRoomSnapshot(room) });

  room.lastTickTime = Date.now();
  room.loopInterval = setInterval(() => tickRoom(room), 1000 / 60);
}

function tickRoom(room: RoomInternal): void {
  const match = room.match;
  if (!match || !room.inMatch) return;

  const now = Date.now();
  const elapsedMs = Math.min(50, Math.max(1, now - room.lastTickTime));
  room.lastTickTime = now;
  const dt = elapsedMs / 1000;

  if (match.phase === 'PAUSED_DISCONNECT') {
    // If both players are connected and countdown > 0, count down to resume
    if (room.player1?.connected && room.player2?.connected) {
      if (match.countdownMs > 0) {
        match.countdownMs = Math.max(0, match.countdownMs - elapsedMs);
        broadcastRoom(room, {
          type: 'match_state',
          match,
          events: [],
          serverTime: now,
        });
      }
      if (match.countdownMs <= 0) {
        const restorePhase = room.savedPhaseBeforeDisconnect || 'PLAYING';
        match.phase = restorePhase;
        if (room.savedPuckVelBeforeDisconnect) {
          match.puck.vx = room.savedPuckVelBeforeDisconnect.x;
          match.puck.vy = room.savedPuckVelBeforeDisconnect.y;
        }
        room.savedPhaseBeforeDisconnect = null;
        room.savedPuckVelBeforeDisconnect = null;
        broadcastRoom(room, { type: 'room_update', room: toRoomSnapshot(room) });
      }
    }
    return;
  }

  if (match.phase === 'MATCH_OVER') {
    return;
  }

  let events: PhysicsEvent[] = [];

  if (match.phase === 'SERVE_COUNTDOWN') {
    match.countdownMs = Math.max(0, match.countdownMs - elapsedMs);
    const t1 = room.player1?.target ?? { x: match.striker1.x, y: match.striker1.y };
    const t2 = room.player2?.target ?? { x: match.striker2.x, y: match.striker2.y };
    stepPhysics(match, t1, t2, FIXED_DT);

    if (match.countdownMs <= 0) {
      match.phase = 'PLAYING';
      broadcastRoom(room, { type: 'room_update', room: toRoomSnapshot(room) });
    }
  } else if (match.phase === 'GOAL_CELEBRATION') {
    match.goalBannerTimerMs = Math.max(0, match.goalBannerTimerMs - elapsedMs);
    const t1 = room.player1?.target ?? { x: match.striker1.x, y: match.striker1.y };
    const t2 = room.player2?.target ?? { x: match.striker2.x, y: match.striker2.y };
    stepPhysics(match, t1, t2, FIXED_DT);

    if (match.goalBannerTimerMs <= 0) {
      const nextServe: PlayerSide = match.lastScorer === 1 ? 2 : 1;
      resetPositionsForServe(match, nextServe);
      if (room.player1) room.player1.target = { x: match.striker1.x, y: match.striker1.y };
      if (room.player2) room.player2.target = { x: match.striker2.x, y: match.striker2.y };
      match.phase = 'SERVE_COUNTDOWN';
      match.countdownMs = SERVE_COUNTDOWN_MS;
      broadcastRoom(room, { type: 'room_update', room: toRoomSnapshot(room) });
    }
  } else if (match.phase === 'PLAYING') {
    const t1 = room.player1?.target ?? { x: match.striker1.x, y: match.striker1.y };
    const t2 = room.player2?.target ?? { x: match.striker2.x, y: match.striker2.y };
    events = stepPhysics(match, t1, t2, dt);

    const goalEvent = events.find((e) => e.type === 'goal' && e.scorer);
    if (goalEvent && goalEvent.scorer) {
      const scorer = goalEvent.scorer;
      if (scorer === 1) {
        match.score1 += 1;
      } else {
        match.score2 += 1;
      }
      match.lastScorer = scorer;
      room.lastActivityAt = now;

      if (match.score1 >= WINNING_SCORE || match.score2 >= WINNING_SCORE) {
        match.phase = 'MATCH_OVER';
        match.winner = match.score1 >= WINNING_SCORE ? 1 : 2;
        match.puck.vx = 0;
        match.puck.vy = 0;
        broadcastRoom(room, {
          type: 'match_state',
          match,
          events,
          serverTime: now,
        });
        broadcastRoom(room, {
          type: 'match_end',
          match,
          winner: match.winner,
        });
        broadcastRoom(room, { type: 'room_update', room: toRoomSnapshot(room) });
        return;
      } else {
        match.phase = 'GOAL_CELEBRATION';
        match.goalBannerTimerMs = GOAL_CELEBRATION_MS;
        match.puck.vx = 0;
        match.puck.vy = 0;
      }
    }
  }

  broadcastRoom(room, {
    type: 'match_state',
    match,
    events,
    serverTime: now,
  });
}

function handleDisconnect(ws: WebSocket): void {
  const session = wsToSession.get(ws);
  if (!session) return;
  wsToSession.delete(ws);

  const room = rooms.get(session.roomCode);
  if (!room) return;

  const slot = session.side === 1 ? room.player1 : room.player2;
  if (!slot || slot.ws !== ws) return;

  slot.connected = false;
  slot.ws = null;
  slot.lastSeenAt = Date.now();
  room.lastActivityAt = Date.now();

  if (room.inMatch && room.match && room.match.phase !== 'MATCH_OVER') {
    if (room.match.phase !== 'PAUSED_DISCONNECT') {
      room.savedPhaseBeforeDisconnect = room.match.phase;
      room.savedPuckVelBeforeDisconnect = {
        x: room.match.puck.vx,
        y: room.match.puck.vy,
      };
      room.match.phase = 'PAUSED_DISCONNECT';
      room.match.countdownMs = 0;
      room.match.puck.vx = 0;
      room.match.puck.vy = 0;
    }
  } else if (!room.inMatch) {
    // In lobby before match starts: reset ready state if disconnected
    slot.ready = false;
  }

  broadcastRoom(room, { type: 'room_update', room: toRoomSnapshot(room) });
}

// Cleanup abandoned rooms periodically
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const p1Connected = Boolean(room.player1?.connected);
    const p2Connected = Boolean(room.player2?.connected);
    if (!p1Connected && !p2Connected && now - room.lastActivityAt > ROOM_ABANDON_TTL_MS) {
      destroyRoom(code);
    } else if (now - room.lastActivityAt > 30 * 60 * 1000) {
      destroyRoom(code, 'Room expired due to inactivity.');
    }
  }
}, 30_000);

async function bootstrap() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = (req.params.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ exists: false, message: 'Room not found' });
      return;
    }
    res.json({
      exists: true,
      locked: room.locked,
      inMatch: room.inMatch,
      hasP1: Boolean(room.player1),
      hasP2: Boolean(room.player2),
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientWsMessage;
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        sendToWs(ws, { type: 'pong', ts: msg.ts, serverTime: Date.now() });
        return;
      }

      if (msg.type === 'create_room') {
        const code = generateRoomCode();
        const token = msg.playerToken || Math.random().toString(36).slice(2);
        const name = sanitizeName(msg.name, 'Player 1');

        const p1: PlayerSlot = {
          side: 1,
          name,
          token,
          isHost: true,
          connected: true,
          ready: false,
          rematchVote: false,
          ws,
          target: { x: 140, y: CENTER_Y },
          lastSeenAt: Date.now(),
        };

        const room: RoomInternal = {
          code,
          locked: false,
          inMatch: false,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          player1: p1,
          player2: null,
          match: null,
          savedPhaseBeforeDisconnect: null,
          savedPuckVelBeforeDisconnect: null,
          loopInterval: null,
          lastTickTime: Date.now(),
        };

        rooms.set(code, room);
        wsToSession.set(ws, { roomCode: code, side: 1, token });
        sendToWs(ws, { type: 'room_joined', side: 1, room: toRoomSnapshot(room) });
        return;
      }

      if (msg.type === 'join_room' || msg.type === 'rejoin_room') {
        const code = (msg.code || '').toUpperCase().trim();
        if (!/^[A-Z0-9]{6}$/.test(code)) {
          sendToWs(ws, {
            type: 'error',
            code: 'INVALID_CODE',
            message: 'Enter a valid 6-character room code.',
          });
          return;
        }

        const room = rooms.get(code);
        if (!room) {
          sendToWs(ws, {
            type: 'error',
            code: 'ROOM_NOT_FOUND',
            message: 'Room not found. Verify the 6-character code.',
          });
          return;
        }

        const token = msg.playerToken || '';
        const now = Date.now();
        room.lastActivityAt = now;

        // Reconnection path for existing Player 1 or Player 2 token
        const existingSlot =
          room.player1 && room.player1.token === token
            ? room.player1
            : room.player2 && room.player2.token === token
              ? room.player2
              : null;

        if (existingSlot) {
          if (existingSlot.ws && existingSlot.ws !== ws) {
            try {
              existingSlot.ws.close(1000, 'Reconnected from another session');
            } catch {
              // ignore
            }
          }
          existingSlot.ws = ws;
          existingSlot.connected = true;
          existingSlot.lastSeenAt = now;
          if (msg.name) {
            existingSlot.name = sanitizeName(msg.name, existingSlot.name);
          }

          wsToSession.set(ws, { roomCode: code, side: existingSlot.side, token });

          // If match was paused on disconnect and both players are now connected, initiate brief resume countdown
          if (
            room.inMatch &&
            room.match &&
            room.match.phase === 'PAUSED_DISCONNECT' &&
            room.player1?.connected &&
            room.player2?.connected
          ) {
            room.match.countdownMs = DISCONNECT_RESUME_COUNTDOWN_MS;
          }

          const snapshot = toRoomSnapshot(room);
          sendToWs(ws, { type: 'room_joined', side: existingSlot.side, room: snapshot });
          broadcastRoom(room, { type: 'room_update', room: snapshot });
          return;
        }

        if (msg.type === 'rejoin_room') {
          sendToWs(ws, {
            type: 'error',
            code: 'SESSION_EXPIRED',
            message: 'Previous session could not be restored.',
          });
          return;
        }

        if (room.locked || room.inMatch) {
          sendToWs(ws, {
            type: 'error',
            code: 'ROOM_LOCKED',
            message: 'Match already in progress. Room is locked.',
          });
          return;
        }

        if (room.player2) {
          sendToWs(ws, {
            type: 'error',
            code: 'ROOM_FULL',
            message: 'This room already has two players.',
          });
          return;
        }

        const name = sanitizeName(msg.name, 'Player 2');
        const p2: PlayerSlot = {
          side: 2,
          name,
          token: token || Math.random().toString(36).slice(2),
          isHost: false,
          connected: true,
          ready: false,
          rematchVote: false,
          ws,
          target: { x: TABLE_WIDTH - 140, y: CENTER_Y },
          lastSeenAt: now,
        };

        room.player2 = p2;
        wsToSession.set(ws, { roomCode: code, side: 2, token: p2.token });

        const snapshot = toRoomSnapshot(room);
        sendToWs(ws, { type: 'room_joined', side: 2, room: snapshot });
        broadcastRoom(room, { type: 'room_update', room: snapshot });
        return;
      }

      const session = wsToSession.get(ws);
      if (!session) return;
      const room = rooms.get(session.roomCode);
      if (!room) return;
      const slot = session.side === 1 ? room.player1 : room.player2;
      if (!slot) return;

      room.lastActivityAt = Date.now();
      slot.lastSeenAt = Date.now();

      if (msg.type === 'toggle_ready') {
        if (room.inMatch) return;
        slot.ready = Boolean(msg.ready);
        broadcastRoom(room, { type: 'room_update', room: toRoomSnapshot(room) });
        return;
      }

      if (msg.type === 'start_match') {
        if (!slot.isHost) {
          sendToWs(ws, { type: 'error', message: 'Only the host can start the match.' });
          return;
        }
        if (!room.player1?.connected || !room.player2?.connected) {
          sendToWs(ws, { type: 'error', message: 'Both players must be connected to start.' });
          return;
        }
        if (!room.player1.ready || !room.player2.ready) {
          sendToWs(ws, { type: 'error', message: 'Both players must be ready before starting.' });
          return;
        }
        startMatchSimulation(room, 1);
        return;
      }

      if (msg.type === 'striker_input') {
        if (!room.inMatch || !room.match) return;
        if (
          room.match.phase === 'MATCH_OVER' ||
          room.match.phase === 'PAUSED_DISCONNECT'
        ) {
          return;
        }
        // Strictly clamp to this player's own half!
        slot.target = clampStrikerPosition(slot.side, msg.x, msg.y);
        return;
      }

      if (msg.type === 'rematch_vote') {
        if (!room.match || room.match.phase !== 'MATCH_OVER') return;
        slot.rematchVote = Boolean(msg.vote);
        broadcastRoom(room, { type: 'room_update', room: toRoomSnapshot(room) });

        if (
          room.player1?.connected &&
          room.player2?.connected &&
          room.player1.rematchVote &&
          room.player2.rematchVote
        ) {
          startMatchSimulation(room, 1);
        }
        return;
      }

      if (msg.type === 'leave_room') {
        wsToSession.delete(ws);
        if (!room.inMatch) {
          if (slot.isHost) {
            destroyRoom(room.code, 'Host closed the room.');
          } else {
            room.player2 = null;
            if (room.player1) room.player1.ready = false;
            broadcastRoom(room, { type: 'room_update', room: toRoomSnapshot(room) });
          }
        } else {
          // Leaving mid-match or post-match closes room gracefully for remaining player
          slot.connected = false;
          slot.ws = null;
          const other = slot.side === 1 ? room.player2 : room.player1;
          if (other?.connected) {
            sendToWs(other.ws, {
              type: 'room_closed',
              reason: `${slot.name} left the match.`,
            });
          }
          destroyRoom(room.code);
        }
        return;
      }
    });

    ws.on('close', () => handleDisconnect(ws));
    ws.on('error', () => handleDisconnect(ws));
  });

  if (process.env.NODE_ENV !== 'production') {
    app.use(express.static(path.resolve(__dirname, 'public')));
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Neon Air Hockey server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
