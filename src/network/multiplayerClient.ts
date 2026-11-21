import {
  ClientWsMessage,
  MatchState,
  PhysicsEvent,
  PlayerSide,
  RoomSnapshot,
  ServerWsMessage,
} from '../game/types';

const TOKEN_STORAGE_KEY = 'neon_air_hockey_player_token';
const ACTIVE_ROOM_STORAGE_KEY = 'neon_air_hockey_active_room';
const PLAYER_NAME_STORAGE_KEY = 'neon_air_hockey_player_name';

export function getOrCreatePlayerToken(): string {
  try {
    let token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      token = `p_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
    return token;
  } catch {
    return `p_${Math.random().toString(36).slice(2)}`;
  }
}

export function getSavedPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name.slice(0, 16));
  } catch {
    // ignore
  }
}

export function saveActiveRoomCode(code: string | null): void {
  try {
    if (code) {
      sessionStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, code);
    } else {
      sessionStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function getSavedActiveRoomCode(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_ROOM_STORAGE_KEY);
  } catch {
    return null;
  }
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface MultiplayerCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onRoomJoined: (side: PlayerSide, room: RoomSnapshot) => void;
  onRoomUpdate: (room: RoomSnapshot) => void;
  onMatchState: (match: MatchState, events: PhysicsEvent[], serverTime: number) => void;
  onMatchEnd: (match: MatchState, winner: PlayerSide) => void;
  onRoomClosed: (reason: string) => void;
  onError: (message: string, code?: string) => void;
  onLatencyUpdate: (ms: number) => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private callbacks: MultiplayerCallbacks;
  private status: ConnectionStatus = 'disconnected';
  private pendingMessage: ClientWsMessage | null = null;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private activeRoomCode: string | null = null;
  private activePlayerName = 'Player';
  private intentionalClose = false;
  private lastInputSentAt = 0;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.callbacks.onStatusChange(status);
  }

  private getWsUrl(): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  private connect(initialMessage?: ClientWsMessage): void {
    this.intentionalClose = false;
    if (initialMessage) {
      this.pendingMessage = initialMessage;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.ws.readyState === WebSocket.OPEN && this.pendingMessage) {
        this.send(this.pendingMessage);
        this.pendingMessage = null;
      }
      return;
    }

    this.setStatus(this.activeRoomCode ? 'reconnecting' : 'connecting');

    const ws = new WebSocket(this.getWsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.setStatus('connected');
      if (this.pendingMessage) {
        this.send(this.pendingMessage);
        this.pendingMessage = null;
      } else if (this.activeRoomCode) {
        this.send({
          type: 'rejoin_room',
          code: this.activeRoomCode,
          name: this.activePlayerName,
          playerToken: getOrCreatePlayerToken(),
        });
      }
      this.startPingLoop();
    };

    ws.onmessage = (ev) => {
      let msg: ServerWsMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerWsMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'pong': {
          const rtt = Math.max(1, Math.round(Date.now() - msg.ts));
          this.callbacks.onLatencyUpdate(rtt);
          break;
        }
        case 'room_joined': {
          this.activeRoomCode = msg.room.code;
          saveActiveRoomCode(msg.room.code);
          this.callbacks.onRoomJoined(msg.side, msg.room);
          break;
        }
        case 'room_update': {
          this.callbacks.onRoomUpdate(msg.room);
          break;
        }
        case 'match_state': {
          this.callbacks.onMatchState(msg.match, msg.events, msg.serverTime);
          break;
        }
        case 'match_end': {
          this.callbacks.onMatchEnd(msg.match, msg.winner);
          break;
        }
        case 'room_closed': {
          this.activeRoomCode = null;
          saveActiveRoomCode(null);
          this.callbacks.onRoomClosed(msg.reason);
          this.disconnect();
          break;
        }
        case 'error': {
          if (msg.code === 'ROOM_NOT_FOUND' || msg.code === 'SESSION_EXPIRED') {
            this.activeRoomCode = null;
            saveActiveRoomCode(null);
          }
          this.callbacks.onError(msg.message, msg.code);
          break;
        }
      }
    };

    ws.onclose = () => {
      this.stopPingLoop();
      this.ws = null;
      if (!this.intentionalClose && this.activeRoomCode) {
        this.setStatus('reconnecting');
        if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => {
          this.connect();
        }, 1200);
      } else {
        this.setStatus('disconnected');
      }
    };

    ws.onerror = () => {
      // Close event handles reconnect
    };
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', ts: Date.now() });
      }
    }, 3000);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private send(msg: ClientWsMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public createRoom(name: string): void {
    this.activePlayerName = name.trim() || 'Player 1';
    savePlayerName(this.activePlayerName);
    this.activeRoomCode = null;
    this.connect({
      type: 'create_room',
      name: this.activePlayerName,
      playerToken: getOrCreatePlayerToken(),
    });
  }

  public joinRoom(code: string, name: string): void {
    const normalized = code.toUpperCase().trim();
    this.activePlayerName = name.trim() || 'Player 2';
    savePlayerName(this.activePlayerName);
    this.activeRoomCode = normalized;
    this.connect({
      type: 'join_room',
      code: normalized,
      name: this.activePlayerName,
      playerToken: getOrCreatePlayerToken(),
    });
  }

  public tryRejoinSavedRoom(code: string, name: string): void {
    this.activePlayerName = name.trim() || 'Player';
    this.activeRoomCode = code.toUpperCase().trim();
    this.connect({
      type: 'rejoin_room',
      code: this.activeRoomCode,
      name: this.activePlayerName,
      playerToken: getOrCreatePlayerToken(),
    });
  }

  public toggleReady(ready: boolean): void {
    this.send({ type: 'toggle_ready', ready });
  }

  public startMatch(): void {
    this.send({ type: 'start_match' });
  }

  public sendStrikerInput(x: number, y: number, seq: number): void {
    const now = performance.now();
    // Cap outbound input to ~62Hz to prevent flooding mobile WebSocket queues
    if (now - this.lastInputSentAt < 15) return;
    this.lastInputSentAt = now;
    this.send({ type: 'striker_input', x, y, seq });
  }

  public sendRematchVote(vote: boolean): void {
    this.send({ type: 'rematch_vote', vote });
  }

  public leaveRoom(): void {
    this.activeRoomCode = null;
    saveActiveRoomCode(null);
    this.send({ type: 'leave_room' });
    this.disconnect();
  }

  public disconnect(): void {
    this.intentionalClose = true;
    this.stopPingLoop();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnect');
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }
}
