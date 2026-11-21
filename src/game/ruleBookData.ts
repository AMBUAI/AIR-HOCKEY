export interface RuleBookSection {
  number: string;
  title: string;
  summary: string;
  details: string[];
}

export const RULE_BOOK_SECTIONS: RuleBookSection[] = [
  {
    number: '01',
    title: 'Objective of Air Hockey',
    summary: 'Outscore your opponent by driving the puck cleanly into their defended goal slot.',
    details: [
      'Two opposing players compete head-to-head across a glowing low-friction arcade table.',
      'Use your striker to deflect incoming shots and launch high-speed direct or bank shots.',
      'The first competitor to reach 11 valid goals wins the match immediately.',
    ],
  },
  {
    number: '02',
    title: 'Table Layout',
    summary: 'Symmetric landscape arena divided by a glowing center line with rounded rebound corners.',
    details: [
      'Player 1 defends the left side (Electric Cyan) and attacks the right goal.',
      'Player 2 or the AI Bot defends the right side (Hot Pink) and attacks the left goal.',
      'Rounded corner rails curve the puck smoothly back into play, while goal posts frame each scoring opening.',
    ],
  },
  {
    number: '03',
    title: 'Player Controls',
    summary: 'Built exclusively for mobile landscape play with immediate 1:1 finger tracking.',
    details: [
      'Hold your phone horizontally in landscape orientation to view the entire arena unobstructed.',
      'You control only your own striker inside your assigned half of the table.',
      'Multi-touch stray taps are ignored while your active finger holds the striker.',
    ],
  },
  {
    number: '04',
    title: 'Finger-Holding Striker Movement',
    summary: 'Touch and hold your striker to move it smoothly anywhere inside your half.',
    details: [
      'Touch and hold on or around your striker to lock finger control onto it.',
      'While holding, the striker follows your finger continuously with zero lag or sluggish smoothing.',
      'Releasing your finger stops the striker immediately in place; touch and hold again anytime to resume.',
    ],
  },
  {
    number: '05',
    title: 'How to Hit the Puck',
    summary: 'Momentum transfers directly from striker speed and impact angle into the puck.',
    details: [
      'Sweep your finger swiftly through the puck to impart high forward velocity.',
      'Angled impacts and tangential flicks create sharp diagonal bank shots off the top and bottom neon rails.',
      'Blocking with a stationary striker absorbs speed and cushions rebounds for controlled counter-attacks.',
    ],
  },
  {
    number: '06',
    title: 'How Goals Are Scored',
    summary: 'A goal counts only when the entire puck completely crosses the opponent’s goal line.',
    details: [
      'Rebounding off a goal post or sitting partially on the goal line does not count as a score.',
      'Each valid goal awards 1 point, flashes a goal banner, and resets play for the next serve.',
      'In Online Multiplayer, every goal is verified exclusively by the authoritative game server.',
    ],
  },
  {
    number: '07',
    title: 'Serve System',
    summary: 'Matches open at center table and restart with the conceding player serving next.',
    details: [
      'Before every serve, the puck locks briefly on the serving side of the center circle during a short countdown.',
      'Neither striker can strike the puck prematurely before the serve countdown finishes.',
      'After any goal, the player who conceded receives the next serve to restore fair momentum.',
    ],
  },
  {
    number: '08',
    title: 'Fouls & Prohibited Actions',
    summary: 'Physical arena boundaries enforce fair half-table play automatically.',
    details: [
      'Crossing the center line into the opponent’s half is physically blocked for both human players and the Bot.',
      'Strikers cannot enter the goal pockets or leave the rounded table walls.',
      'Players cannot control or interfere with their opponent’s striker.',
    ],
  },
  {
    number: '09',
    title: 'Out-of-Bounds Recovery',
    summary: 'Automatic table safeguard restores displaced pucks without false points.',
    details: [
      'Sub-stepped collision physics keep the puck inside the rails even during maximum-velocity collisions.',
      'If an unexpected network glitch or extreme pinch forces the puck outside valid table space, it resets safely to center without awarding a goal.',
    ],
  },
  {
    number: '10',
    title: 'Winning Condition',
    summary: 'First player to 11 goals wins immediately—no two-goal margin required.',
    details: [
      'The match ends the instant either side reaches 11 valid goals.',
      'Both strikers and the puck freeze immediately and the verified final score is presented.',
      'You can challenge a rematch right away (both online players must confirm) or return to the main menu.',
    ],
  },
  {
    number: '11',
    title: 'Online Multiplayer Mode',
    summary: 'Real-time 2-player competition powered by 6-character room codes and server-validated physics.',
    details: [
      'Tap Play Online, then choose Host to generate a private 6-character alphanumeric room code, or Join to enter a friend’s code.',
      'Both players must mark Ready in the lobby before the Host starts and locks the room.',
      'If a player disconnects mid-match, the score, puck, strikers, and serve state are preserved so they can reconnect seamlessly.',
    ],
  },
  {
    number: '12',
    title: 'Play vs Bot Mode',
    summary: 'Offline-ready single-player duel against a grandmaster predictive AI opponent.',
    details: [
      'Launches immediately with no room code or second player required, running locally even offline once loaded.',
      'The AI continuously predicts multi-bounce puck trajectories, defends open angles, and executes bank-shot strikes.',
      'The Bot obeys the exact same half-table boundaries, physical movement speeds, and first-to-11 rules—no teleportation or fake scoring.',
    ],
  },
];
