import { useEffect, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { AboutScreen } from './components/AboutScreen';
import { GameArena } from './components/GameArena';
import { LobbyScreen } from './components/LobbyScreen';
import { MainMenu } from './components/MainMenu';
import { OnlineHub } from './components/OnlineHub';
import { OrientationGate, requestLandscapeFullscreen } from './components/OrientationGate';
import { RuleBookScreen } from './components/RuleBookScreen';
import { SettingsScreen } from './components/SettingsScreen';
import {
  AudioSettings,
  GameMode,
  MatchState,
  PhysicsEvent,
  PlayerSide,
  RoomSnapshot,
  ScreenView,
} from './game/types';
import {
  ConnectionStatus,
  getSavedActiveRoomCode,
  getSavedPlayerName,
  MultiplayerClient,
  saveActiveRoomCode,
} from './network/multiplayerClient';

export default function App() {
  const [screen, setScreen] = useState<ScreenView>('menu');
  const [settingsReturnTo, setSettingsReturnTo] = useState<ScreenView>('menu');
  const [ruleBookReturnTo, setRuleBookReturnTo] = useState<ScreenView>('menu');

  const [gameMode, setGameMode] = useState<GameMode>('bot');
  const [localSide, setLocalSide] = useState<PlayerSide>(1);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    soundEngine.getSettings()
  );

  // Online multiplayer state
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const clientRef = useRef<MultiplayerClient | null>(null);

  // Track whether a live match session is active (so opening Settings/RuleBook preserves GameArena)
  const [activeMatchMounted, setActiveMatchMounted] = useState(false);

  const ensureClient = (): MultiplayerClient => {
    if (clientRef.current) return clientRef.current;

    const client = new MultiplayerClient({
      onStatusChange: (status) => {
        setConnectionStatus(status);
      },
      onRoomJoined: (side, room) => {
        setLocalSide(side);
        setRoomSnapshot(room);
        setOnlineError(null);
        setGameMode('online');
        if (room.inMatch) {
          setActiveMatchMounted(true);
          setScreen('playing');
        } else {
          setActiveMatchMounted(false);
          setScreen('lobby');
        }
      },
      onRoomUpdate: (room) => {
        setRoomSnapshot(room);
        if (room.inMatch) {
          setGameMode('online');
          setActiveMatchMounted(true);
          setScreen((prev) => (prev === 'lobby' ? 'playing' : prev));
        }
      },
      onMatchState: (match: MatchState, events: PhysicsEvent[]) => {
        window.dispatchEvent(
          new CustomEvent('neon-hockey-server-tick', {
            detail: { match, events },
          })
        );
      },
      onMatchEnd: (match: MatchState) => {
        setRoomSnapshot((prev) => (prev ? { ...prev, match } : prev));
      },
      onRoomClosed: (reason) => {
        setActiveMatchMounted(false);
        setRoomSnapshot(null);
        setOnlineError(reason);
        setScreen('online_hub');
      },
      onError: (message, code) => {
        setOnlineError(message);
        if (code === 'SESSION_EXPIRED' || code === 'ROOM_NOT_FOUND') {
          saveActiveRoomCode(null);
        }
      },
      onLatencyUpdate: (ms) => {
        setLatencyMs(ms);
      },
    });

    clientRef.current = client;
    return client;
  };

  // Automatic session restoration if page reloads during an active online room
  useEffect(() => {
    const savedCode = getSavedActiveRoomCode();
    if (savedCode) {
      const client = ensureClient();
      client.tryRejoinSavedRoom(savedCode, getSavedPlayerName() || 'Player');
    }
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  const handleUpdateAudioSettings = (partial: Partial<AudioSettings>) => {
    const updated = soundEngine.updateSettings(partial);
    setAudioSettings(updated);
  };

  const handleStartBotMatch = () => {
    requestLandscapeFullscreen();
    setGameMode('bot');
    setLocalSide(1);
    setRoomSnapshot(null);
    setActiveMatchMounted(true);
    setScreen('playing');
  };

  const handleOpenOnline = () => {
    setOnlineError(null);
    setScreen('online_hub');
  };

  const handleHostRoom = (playerName: string) => {
    requestLandscapeFullscreen();
    const client = ensureClient();
    client.createRoom(playerName);
  };

  const handleJoinRoom = (code: string, playerName: string) => {
    requestLandscapeFullscreen();
    const client = ensureClient();
    client.joinRoom(code, playerName);
  };

  const handleExitToMenu = () => {
    if (gameMode === 'online' && clientRef.current) {
      clientRef.current.leaveRoom();
    }
    setActiveMatchMounted(false);
    setRoomSnapshot(null);
    setOnlineError(null);
    setScreen('menu');
  };

  const handleOpenSettingsFrom = (from: ScreenView) => {
    setSettingsReturnTo(from);
    setScreen('settings');
  };

  const handleOpenRuleBookFrom = (from: ScreenView) => {
    setRuleBookReturnTo(from);
    setScreen('rulebook');
  };

  const p1Name =
    gameMode === 'online' ? roomSnapshot?.player1?.name || 'Player 1' : 'You';
  const p2Name =
    gameMode === 'online' ? roomSnapshot?.player2?.name || 'Player 2' : 'Neon Bot (AI)';

  return (
    <OrientationGate>
      <main className="relative h-dvh w-screen overflow-hidden bg-[#07090F]">
        {/* Keep active GameArena mounted underneath Settings/RuleBook if paused/inspected mid-match */}
        {activeMatchMounted && (
          <div className={screen === 'playing' ? 'h-full w-full' : 'hidden'}>
            <GameArena
              mode={gameMode}
              localSide={localSide}
              player1Name={p1Name}
              player2Name={p2Name}
              roomSnapshot={roomSnapshot}
              connectionStatus={connectionStatus}
              latencyMs={latencyMs}
              multiplayerClient={clientRef.current}
              onOpenSettings={() => handleOpenSettingsFrom('playing')}
              onExitToMenu={handleExitToMenu}
            />
          </div>
        )}

        {screen === 'menu' && (
          <MainMenu
            onPlayOnline={handleOpenOnline}
            onPlayBot={handleStartBotMatch}
            onOpenSettings={() => handleOpenSettingsFrom('menu')}
            onOpenRuleBook={() => handleOpenRuleBookFrom('menu')}
            onOpenAbout={() => setScreen('about')}
          />
        )}

        {screen === 'online_hub' && (
          <OnlineHub
            initialName={getSavedPlayerName()}
            connectionStatus={connectionStatus}
            errorMessage={onlineError}
            onClearError={() => setOnlineError(null)}
            onHostRoom={handleHostRoom}
            onJoinRoom={handleJoinRoom}
            onBack={() => {
              setOnlineError(null);
              setScreen('menu');
            }}
          />
        )}

        {screen === 'lobby' && roomSnapshot && (
          <LobbyScreen
            room={roomSnapshot}
            localSide={localSide}
            connectionStatus={connectionStatus}
            errorMessage={onlineError}
            onToggleReady={(ready) => clientRef.current?.toggleReady(ready)}
            onStartMatch={() => clientRef.current?.startMatch()}
            onLeaveRoom={() => {
              clientRef.current?.leaveRoom();
              setRoomSnapshot(null);
              setScreen('online_hub');
            }}
          />
        )}

        {screen === 'settings' && (
          <SettingsScreen
            settings={audioSettings}
            inActiveMatch={activeMatchMounted && settingsReturnTo === 'playing'}
            onUpdateSettings={handleUpdateAudioSettings}
            onOpenRuleBook={() => handleOpenRuleBookFrom('settings')}
            onBack={() => setScreen(settingsReturnTo)}
            onReturnToMenu={handleExitToMenu}
          />
        )}

        {screen === 'rulebook' && (
          <RuleBookScreen onBack={() => setScreen(ruleBookReturnTo)} />
        )}

        {screen === 'about' && <AboutScreen onBack={() => setScreen('menu')} />}
      </main>
    </OrientationGate>
  );
}
