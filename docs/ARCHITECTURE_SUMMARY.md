# Family Feud — Architecture Summary

**Created:** 2026-02-23
**Version:** Party Mode with Display Mode Support
**Codebase:** ~9000 lines of JavaScript (4089 in script.js, 2245 in server.js, 1462 in host.js, 1178 in player.js)

---

## Quick Reference

### File Locations
- **Backend:** `/server.js` (2245 lines)
- **Display:** `/index.html`, `/script.js` (4089), `/styles.css`
- **Host:** `/host.html`, `/host.js` (1462), `/host.css`
- **Player:** `/player.html`, `/player.js` (1178), `/player.css`
- **Docs:** `/docs/CODEMAPS/` (5 markdown files, ~80KB)

### Technology Stack
- Node.js (no framework)
- Socket.IO 4.7.4 (real-time communication)
- Vanilla JavaScript, HTML, CSS (no build step)
- OpenAI API (gpt-4o-mini for answer validation)
- QRCode (for room joining)

### Game Modes
| Mode | Screens | Server | Key Feature |
|------|---------|--------|-------------|
| Single Device | 1 | Minimal (OpenAI only) | Host & display on same screen |
| Display Mode | 2 (display + host) | Full Socket.IO | Host controls display from phone |
| Party Mode | 3+ (display + host + players) | Full + complex logic | Multi-player, turn rotation, buzzer |

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Node.js Server (server.js, port 3000)      │
│  ┌────────────────────────────────────────┐ │
│  │ HTTP Server (static file serving)      │ │
│  │ Socket.IO (real-time relay)            │ │
│  │ Game State (gameRooms Map)             │ │
│  │ OpenAI Integration (answer validation) │ │
│  │ QR Code Generation                     │ │
│  └────────────────────────────────────────┘ │
└────────┬─────────────────────────────┬──────┘
         │                             │
         └──────────────┬──────────────┘
                        │ Socket.IO (room-based)
         ┌──────────────┼──────────────┐
         │              │              │
    ┌────▼────┐  ┌─────▼────┐  ┌──────▼───────┐
    │ DISPLAY  │  │  HOST    │  │  PLAYERS(x)  │
    │(index)   │  │(host)    │  │ (player)     │
    │ script   │◄─┤ host.js  ├─►│ player.js    │
    │ 4089 LOC │  │ 1462 LOC │  │ 1178 LOC     │
    └──────────┘  └──────────┘  └──────────────┘
    TV/Projector  Phone/Laptop  Phones (N)
```

### Data Flow

**Single Device Mode:**
- User selects Single Device → setup screen → game screen
- No server communication (except for OpenAI /api/check-answer calls)
- Everything happens on one screen

**Display Mode:**
1. Display shows QR code
2. Host scans → host.html?room=ROOMCODE
3. Host enters password → authenticated via server
4. Display waits for host connection
5. Host sends commands (new question, reveal, etc.)
6. Server broadcasts to display in real-time

**Party Mode:**
1. Display shows host QR
2. Host connects → display shows player QR
3. Players scan and join → names appear on display
4. Host assigns players to teams
5. Game starts → server manages turns, buzzer logic, steals
6. Players buzz/answer → validated on server → broadcast to all

---

## Core Game State (gameState Object)

Located in server.js, created by `createGameRoom()`. Key fields:

```javascript
{
  // Screen navigation
  screen: 'qr|tutorial|setup|game|end',
  
  // Teams & Scores
  team1Name: 'TEAM 1',
  team2Name: 'TEAM 2',
  team1Score: 0,
  team2Score: 0,
  
  // Question & Answers
  currentQuestion: { question: "...", answers: [{text, points}, ...] },
  revealedAnswers: [0, 1, ...],
  correctGuessesThisRound: [...],
  
  // Round State
  currentRound: 1,
  totalRounds: 7,
  strikes: 0,  // 0-3
  entryLog: [{playerName, answer, result}, ...],
  
  // Timer
  timerRunning: false,
  timerCurrentSeconds: 30,
  timerConfig: {enabled, buzzerTime, afterBuzzerTime, regularTime, stealTime},
  
  // Party Mode: Players
  players: [{id, name, socketId, team}, ...],
  team1Players: [playerId, ...],
  team2Players: [playerId, ...],
  
  // Party Mode: Turn Management
  currentTurnPlayer: playerId,
  currentBattlePlayers: [team1PlayerId, team2PlayerId],
  faceOffActive: false,
  buzzerPhase: false,
  buzzerWinner: playerId,
  faceOffPhase: 'buzzer|chain|resolved',
  
  // Party Mode: Steal Phase
  stealPhase: false,
  stealingTeam: 1|2,
  stealPlayerId: playerId,
  
  // Animation Sync
  pendingTurnChange: {...},
  pendingStealPhase: {...}
}
```

---

## Key Socket.IO Events (40+)

### Connection
- `display:join` → Display connects to room
- `host:authenticate` → Host logs in with password
- `host:takeOver` → New host takes control
- `player:join` → Player joins game

### Game Flow
- `startGame` → Initialize with team names, rounds
- `newQuestion` → Load new question
- `revealAnswer` → Reveal one answer
- `addStrike` / `removeStrike` → Adjust strikes
- `addPoints` → Award points to team

### Answer Validation
- `checkAnswer` → Validate player answer via OpenAI
- `answer:correct` / `answer:incorrect` → Result broadcast

### Party Mode: Buzzer & Turns
- `player:buzz` → Player presses buzzer
- `player:submitAnswer` → Player submits answer
- `player:assignTeam` → Host assigns player to team
- `turn:changed` → Next player's turn
- `steal:phase` → Steal phase activated

### Timer
- `timer:start` / `timer:pause` / `timer:reset` → Timer controls
- `timer:tick` → Timer countdown update
- `timer:finished` → Time's up

### State Sync
- `gameState:update` → Partial state update
- `state:heartbeat` → Periodic full state sync
- `gameState:full` → Complete state on reconnect

See `/docs/CODEMAPS/socket-events.md` for complete reference.

---

## Major Functions Reference

### server.js (Backend)

| Function | Lines | Purpose |
|----------|-------|---------|
| `generateRoomCode()` | 44 | Create unique 6-letter code |
| `createGameRoom()` | 54 | Initialize game room with state |
| `getRoom()` | 126 | Retrieve room from Map |
| `startHeartbeat()` | 131 | Periodic state sync (5-10s) |
| `getCurrentTurnPlayer()` | 178 | Get current player ID |
| `getNextChainPlayer()` | 214 | Face-off chain logic |
| `callOpenAI()` | 310 | HTTPS call to OpenAI API |

### script.js (Display)

| Function | Purpose |
|----------|---------|
| `loadQuestion()` | Fetch random question from CSV |
| `revealAnswer()` | Animate answer card flip |
| `checkAnswer()` | Validate via OpenAI or server |
| `updateStrikesDisplay()` | Visual strike indicators |
| `updateEntryLog()` | Add entry to log |
| `startTimer()` | Begin countdown |
| Socket listeners | Update display on events |

### host.js (Host Control)

| Function | Purpose |
|----------|---------|
| `initSocket()` | Set up Socket.IO listeners |
| `handleLogin()` | Authenticate host |
| `emitNewQuestion()` | Send question to server |
| `emitRevealAnswer()` | Reveal specific answer |
| `emitCheckAnswer()` | Validate player answer |
| `emitAddStrike()` / `emitRemoveStrike()` | Adjust strikes |
| `emitAddPoints()` | Award points to team |

### player.js (Player Interface)

| Function | Purpose |
|----------|---------|
| `handleJoin()` | Join game with name |
| `handleBuzzerPress()` | Emit buzzer press |
| `onTurnChanged()` | Enable/disable answer input |
| `handleAnswerSubmit()` | Submit answer to server |
| Socket listeners | Update player screen |

---

## Deployment Checklist

- [ ] Node.js installed (12+)
- [ ] Dependencies: `npm install`
- [ ] OpenAI API key set: `export OPENAI_API_KEY=sk-...`
- [ ] Server starts: `node server.js`
- [ ] Access http://localhost:3000
- [ ] Test mode selection, setup, game
- [ ] Deploy to Render/Railway/Heroku/etc
- [ ] Set `OPENAI_API_KEY` environment variable
- [ ] Verify HTTPS and Socket.IO connectivity

---

## Testing Scenario: Full Party Mode Game

1. **Host Setup (Server):** Running at http://localhost:3000
2. **Display (Device A - TV):** Open http://localhost:3000
   - Select "Party Mode"
   - See host QR code
3. **Host (Device B - Laptop):** Scan host QR
   - host.html?room=ABCDEF loads
   - Enter host password "654-SteveHarveyIsCool!-321"
   - Authenticated, see setup screen
4. **Players (Devices C, D, E - Phones):** Scan player QR codes
   - Join with names: "Alice", "Bob", "Charlie"
   - Wait on waiting screen
5. **Host assigns teams:**
   - Alice → Team 1
   - Bob → Team 2
   - Charlie → Team 1
6. **Game starts:**
   - Question: "Name a pet"
   - Face-off: Alice (Team 1) vs Bob (Team 2)
   - Alice clicks buzzer first → "You buzzed first!"
   - Alice answers "Dog" → Correct → Team 1 gets control
   - Charlie answers "Cat" → Correct → Points awarded
   - All 6 answers revealed → Round summary
   - Continue to next round
7. **Continue through all rounds** until winner announced

---

## Common Customizations

### Change Host Password
- Edit: `/server.js` line 35
- `const HOST_PASSWORD = '654-SteveHarveyIsCool!-321'`

### Change OpenAI Model
- Edit: `/server.js` line 350
- Change `gpt-4o-mini` to `gpt-4` or `gpt-3.5-turbo`

### Add More Questions
- Edit: `/questions.csv` or `/questions1.csv`
- Format: `Question|Answer1|Points1|Answer2|Points2|...`
- Example: `Name a pet|Dog|50|Cat|40|Fish|10`

### Change Team Colors
- Edit: `/styles.css` lines (search for `--team1-color`, `--team2-color`)
- Update RGB values to new colors

### Adjust Timer Defaults
- Edit: `/host.html` lines 279-291 (timer input defaults)
- Or edit programmatically in setup

### Host Password via Environment Variable
- Change `/server.js` line 35 to read `process.env.HOST_PASSWORD`
- Set env var in deployment

---

## Documentation Files

| File | Purpose | Lines |
|------|---------|-------|
| `/docs/CODEMAPS/INDEX.md` | Architecture overview, game modes, data structures | ~350 |
| `/docs/CODEMAPS/server.md` | Backend deep-dive: HTTP, Socket.IO, room management | ~400 |
| `/docs/CODEMAPS/display.md` | Display page: screens, popups, game logic | ~400 |
| `/docs/CODEMAPS/host.md` | Host control panel: auth, controls, setup | ~400 |
| `/docs/CODEMAPS/player.md` | Player interface: buzzer, turns, answers | ~350 |
| `/docs/CODEMAPS/socket-events.md` | Complete Socket.IO event reference | ~400 |

**Total Documentation:** ~2000 lines (~80KB)

---

## Known Limitations & Future Improvements

### Current Limitations
- Game state stored in-memory (lost on server restart)
- No database persistence
- No user accounts/authentication
- Single server instance (no horizontal scaling)
- Answer validation depends on OpenAI API (latency, cost)

### Potential Improvements
- Add database for persistent game history
- User accounts with saved games
- Load balancing for multiple servers
- Cache OpenAI responses for common answers
- Local answer matching (fallback if API down)
- Custom timer presets
- Host-controlled answer ordering (not just random)
- Multiplayer team battles (more than 2 teams)

---

## Support & Debugging

### Logs
- Server: `console.log()` statements in server.js (search for `console.log`)
- Client: Browser DevTools → Console tab

### Common Issues
- **"Room not found"** — Display/Host connecting to non-existent room
- **"Invalid password"** — Wrong host password entered
- **Buzzer not working** — Check player's turn detection in player.js
- **Answers not syncing** — Check Socket.IO connection (connection bar green?)
- **OpenAI timeout** — API key invalid or network issue

### Performance
- Handles 10-20 players on single server
- Heartbeat scales automatically (5s with 8+ players, 10s otherwise)
- Consider adding rate limiting for production

---

## License & Attribution

No external frameworks used — all vanilla JavaScript.
Built as a real-time game demo for Family Feud.

---

## Version History

- **v1.0** (2026-02-23) — Full Party Mode, Display Mode, Single Device Mode with documentation
- Previous versions: Display Mode only, then Single Device Mode

---

## Quick Links

- **Main:** http://localhost:3000
- **Host Login:** http://localhost:3000/host.html
- **Player Join:** http://localhost:3000/player.html
- **API Endpoints:**
  - POST /api/create-room → {roomCode}
  - POST /api/check-answer → {result, matchedAnswer, answerIndex}
  - GET /api/qr-code?room=CODE → {qrCode, hostUrl}
  - GET /api/player-qr-code?room=CODE → {qrCode, playerUrl}
