# Family Feud — Architecture Overview

**Last Updated:** 2026-02-23
**Version:** Party Mode with Display Mode Support

## Quick Summary

Family Feud is a real-time multiplayer web game built with vanilla JavaScript, Node.js, and Socket.IO. It supports three game modes:

1. **Single Device Mode** — One screen controls everything
2. **Display Mode** — TV display + host phone controller
3. **Party Mode** — TV display + host phone + multiple player phones

The game uses AI (OpenAI's gpt-4o-mini) to validate player answers against survey data in real-time.

---

## Game Modes Explained

### Single Device Mode
- **Use Case:** Projector + one laptop, or one screen with built-in controls
- **Components:** index.html (display + controls), script.js, styles.css
- **Server:** Minimal — answer validation via /api/check-answer only
- **Flow:** Host clicks buttons to control game on same screen

### Display Mode (2 Devices)
- **Use Case:** TV/projector display + host controls from phone
- **Components:**
  - Display: index.html + script.js (shows game only, no controls visible)
  - Host: host.html + host.js (tabbed control panel with answer checker)
- **Server:** Full Socket.IO — syncs display with host phone in real-time
- **Flow:**
  1. Display shows QR code for host to scan
  2. Host authenticates with password
  3. Host controls game from phone, display updates live

### Party Mode (3+ Devices)
- **Use Case:** TV/projector + host phone + multiple player phones
- **Components:**
  - Display: index.html + script.js (shows game board, buzzer results, turn order)
  - Host: host.html + host.js (controls game, manages teams, runs game logic)
  - Players: player.html + player.js (buzzer, answer submission, turn indicator)
- **Server:** Full Socket.IO with complex game state for turns, buzzer, steals
- **Flow:**
  1. Display shows host QR code
  2. Host scans and authenticates
  3. Display shows player join QR codes
  4. Players scan and enter names
  5. Host assigns players to teams
  6. Game starts with face-off, buzzer phases, team turns, and steal logic

---

## Communication Architecture

```
                    ┌─────────────────────────────┐
                    │      Node.js Server         │
                    │  (server.js, port 3000)     │
                    │  - Room management          │
                    │  - Socket.IO relay          │
                    │  - OpenAI answer validation │
                    │  - QR code generation       │
                    └─────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        v                    v                    v
   ┌─────────┐          ┌─────────┐         ┌──────────┐
   │ Display │          │  Host   │         │ Players  │
   │(index)  │◄─────────► (host)  │◄───────►│(player)  │
   │         │ Socket.IO  │       │         │          │
   │ script  │  (Room)    │ host  │         │ player   │
   └─────────┘          └─────────┘         └──────────┘
   (TV/Projector)    (Phone/Laptop)       (Phones x N)
```

**Key Points:**
- All devices in same "room" (identified by 6-letter room code)
- Server stores game state in gameRooms Map
- No direct peer-to-peer — all communication via server
- Server broadcasts state changes to all clients in room
- Each game mode uses different subset of components

---

## Core Data Structure: Game State

Located in server.js, created by createGameRoom():

```javascript
gameState: {
  // Basic game info
  screen: 'qr|tutorial|setup|game|end',
  team1Name: 'TEAM 1',
  team2Name: 'TEAM 2',
  team1Score: 0,
  team2Score: 0,
  totalRounds: 7,
  currentRound: 1,

  // Question & answers
  currentQuestion: { question: "...", answers: [{text, points}, ...] },
  revealedAnswers: [0, 1, ...],
  entryLog: [{playerName, answer, result}, ...],
  correctGuessesThisRound: [{text, points}, ...],

  // Round state
  strikes: 0,
  roundPointsEarned: 0,
  lastWinningTeam: 0,
  lastPointsAwarded: 0,

  // Timer
  timerSeconds: 30,
  timerRunning: false,
  timerCurrentSeconds: 0,
  timerConfig: {
    enabled: true,
    buzzerTime: 7,
    afterBuzzerTime: 15,
    regularTime: 35,
    stealTime: 120
  },

  // Party mode specific
  partyMode: false,
  partyScreen: 'qr|lobby|teams|game',
  players: [{id, name, socketId, team}, ...],
  team1Players: [playerId, ...],
  team2Players: [playerId, ...],

  // Face-off & turn management
  currentBattlePlayers: [team1PlayerId, team2PlayerId],
  currentTurnPlayer: playerId,
  playerTurnIndex: {team1: 0, team2: 0},
  faceOffActive: false,
  buzzerPhase: false,
  buzzerWinner: playerId,
  buzzerLoser: playerId,
  faceOffAttempts: [playerId, ...],
  faceOffPhase: 'buzzer|chain|resolved',
  controllingTeam: 1|2,

  // Steal phase
  stealPhase: false,
  stealingTeam: 1|2,
  stealPlayerId: playerId,
  roundWinningTeam: 1|2,

  // Used for animation sync
  pendingTurnChange: {oldPlayer, newPlayer},
  pendingStealPhase: {team, playerId}
}
```

---

## File Structure

### Backend (Server-Side)
- **server.js** (2245 lines)
  - HTTP server + static file serving
  - Socket.IO connection handling
  - Game state management (gameRooms Map)
  - Room creation, player joining, host authentication
  - Party mode logic: turns, buzzer, steals, face-off
  - OpenAI integration for answer validation
  - QR code generation

### Frontend - Display (Main Game View)
- **index.html** (947 lines)
  - Mode selection screen (single/display/party)
  - QR screens for joining
  - Tutorial/how-to-play guide
  - Setup screens (team names, rounds, configuration)
  - Game board: question, answer slots, strikes, scores
  - Entry log and timer panels
  - Round summary and end game screens
  - Popups: battle announcements, buzzer results, steal phases
  - Party mode: player list, QR codes panel

- **script.js** (4089 lines)
  - Main game logic for all modes
  - Socket.IO client for display
  - Screen transitions (mode → qr → tutorial → setup → game → end)
  - Answer board rendering and reveal animations
  - Entry log management
  - Timer display and sync
  - Answer checking popup (single device mode)
  - Party mode battle announcements, buzzer winner display
  - Confetti and visual feedback
  - Keyboard shortcuts for single device mode

- **styles.css** (106707 bytes)
  - Responsive design (mobile-first)
  - Animation keyframes (reveal, confetti, popups)
  - Theme variables for team colors
  - Grid layouts for answer board
  - Mobile-specific toggle buttons

### Frontend - Host Control Panel
- **host.html** (376 lines)
  - Host login screen (room code + password)
  - Main control panel with tabbed navigation
  - Game tab: answer board preview, control buttons
  - Teams tab: team management for party mode
  - Help tab: how-to-play guide
  - Setup screen: team names, rounds, timer config
  - Connection status bar

- **host.js** (1462 lines)
  - Socket.IO client for host
  - Authentication and reconnection logic
  - Tabbed UI navigation
  - Game controls: new question, reveal answer, add strike, etc.
  - Answer checking with AI validation
  - Timer controls (start, pause, reset)
  - Party mode: team management, player list display
  - Setup flow for single device / display / party modes
  - Take-over modal for host conflicts
  - Connection error handling

- **host.css** (29697 bytes)
  - Dark theme styling
  - Mobile-first responsive layout
  - Tab navigation styles
  - Control button groups
  - Connection status indicator
  - Answer preview grid
  - Modal styles

### Frontend - Player Interface (Party Mode)
- **player.html** (126 lines)
  - Join screen: player name input, room code display
  - Waiting screen: spinner while awaiting team assignment
  - Game screen: question, buzzer, answer input
  - Entry log: shows all guesses in round
  - Timer display: synced with server timer
  - Error popup

- **player.js** (1178 lines)
  - Socket.IO client for players
  - Join/reconnection logic
  - Buzzer button handling
  - Answer submission and validation
  - Screen transitions (join → waiting → game)
  - Turn detection: shows button only on player's turn
  - Buzzer winner/loser feedback
  - Entry log updates
  - Timer sync with server

- **player.css** (13797 bytes)
  - Large buzzer button styling
  - Answer input form
  - Turn message display
  - Entry log styling
  - Timer display
  - Animation: buzzer press, screen ring effect
  - Mobile-optimized touch targets

### Configuration & Data
- **package.json**
  - Dependencies: socket.io, qrcode
  - Start script: node server.js

- **questions.csv** / **questions1.csv**
  - Survey-style Family Feud questions
  - Format: question, answer1|points1, answer2|points2, ...
  - Loaded by server for game rounds

---

## Deployment

- **Platform:** Render (or any Node.js host)
- **Environment Variables:**
  - OPENAI_API_KEY (required) — OpenAI API key
  - PORT (optional) — Server port (default 3000)
- **Static Files:** Served from root directory
- **Procfile:** web: node server.js

---

## Related Documentation

- /docs/CODEMAPS/server.md — Backend architecture deep-dive
- /docs/CODEMAPS/display.md — Display & game logic
- /docs/CODEMAPS/host.md — Host control panel
- /docs/CODEMAPS/player.md — Player interface
- /docs/CODEMAPS/socket-events.md — Socket.IO event reference
