# Server Architecture (server.js)

**Last Updated:** 2026-02-23
**File:** server.js (2245 lines)
**Dependencies:** http, socket.io, qrcode, OpenAI API

---

## Overview

The server is the orchestrator for all three game modes. It maintains game state, manages Socket.IO connections, validates answers via OpenAI, and serves static files.

---

## Initialization & Configuration

### Lines 1-50: Module Imports & API Key
```javascript
require('http', 'fs', 'path', 'https', 'socket.io', 'qrcode')

// Load API key from env variable or config.json
let OPENAI_API_KEY = process.env.OPENAI_API_KEY || config.json
if (!OPENAI_API_KEY) {
  console.error('Error: OpenAI API key not found')
  process.exit(1)
}

const PORT = process.env.PORT || 3000
const HOST_PASSWORD = '654-SteveHarveyIsCool!-321'
```

### Global Data Structures
```javascript
const gameRooms = new Map()  // roomCode → room object
const roomAnswerProcessing = new Map()  // roomCode → boolean (prevents concurrent OpenAI calls)
```

---

## Core Functions

### generateRoomCode() [Line 44]
- Creates a unique 6-character room code
- Uses characters: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no I, O, L, 1)
- Loop ensures code doesn't already exist in gameRooms Map
- **Returns:** String like "A1B2C3"

### createGameRoom() [Line 54]
- Creates new game room with full initial state
- **Returns:** Room object with:
  - `code` — unique room code
  - `displaySocketId` — Socket ID of connected display
  - `hostSocketId` — Socket ID of connected host
  - `createdAt` — timestamp
  - `gameState` — full game state object (see INDEX.md)
  - `heartbeatInterval` — setInterval reference

### getRoom(roomCode) [Line 126]
- Retrieves room from gameRooms Map
- **Args:** roomCode string
- **Returns:** Room object or undefined

### startHeartbeat(roomCode) [Line 131]
- Starts periodic state sync (5-10s interval)
- Interval varies based on player count (>8 players = 5s, else 10s)
- Broadcasts key state fields to all clients in room:
  - team1Score, team2Score
  - strikes, currentRound
  - faceOffActive, buzzerWinner
  - etc.
- **Purpose:** Catch any missed state updates

### stopHeartbeat(roomCode) [Line 169]
- Clears heartbeat interval for a room
- Called on disconnect or game reset

### getCurrentTurnPlayer(room) [Line 178]
- Returns playerId of player whose turn it is
- Uses `currentTurnPlayer` field or null if none
- Called before broadcasting turn:changed

### getNextConnectedPlayerOnTeam(room, teamNumber, currentPlayerId) [Line 190]
- Finds next connected player on specified team
- Skips specified playerId
- Rotates through team using `playerTurnIndex`
- **Returns:** playerId or null if no players

### getNextChainPlayer(room) [Line 214]
- Complex face-off chain logic for party mode
- After buzzer loser's attempt, tries other team
- Returns next player to attempt chain answer
- **Logic:**
  1. If faceOffPhase='buzzer': Try same team (chain)
  2. If wrong: Try other team (interleaving chain)
  3. Track attempts in faceOffAttempts array
  4. When one team gets answer right, resolve to that team

### serveStaticFile(filePath, res) [Line 281]
- Serves HTML, CSS, JS, CSV files
- Sets correct Content-Type headers
- Handles 404 errors
- **Prevents:** Directory traversal attacks

### callOpenAI(question, answers, playerAnswer) [Line 310]
- Makes HTTPS request to OpenAI API
- **Endpoint:** https://api.openai.com/v1/chat/completions
- **Model:** gpt-4o-mini
- **Prompt:** "Does this answer match any of these Family Feud answers?"
- **Timeout:** 30 seconds
- **Returns:** Promise resolving to OpenAI response object
- **Error Handling:** Rejects on timeout/network error

---

## HTTP Server [Line 411]

### Static File Serving
- GET /index.html, /host.html, /player.html, etc.
- GET /styles.css, /host.css, /player.css, etc.
- Uses serveStaticFile() helper

### API Endpoints

#### POST /api/check-answer [Line 426]
- **Payload:** { question, answers, playerAnswer }
- **Response:** { result, matchedAnswer, answerIndex }
- **Process:**
  1. Validate required fields
  2. Call OpenAI (gpt-4o-mini)
  3. Parse JSON response
  4. Return result to client
- **Error:** 400/500 with error message

#### POST /api/create-room [Line 467]
- **Response:** { roomCode }
- **Process:** Create new game room via createGameRoom()
- **Used by:** index.html to start new game

#### GET /api/qr-code [Line 473]
- **Query:** ?room=ROOMCODE
- **Response:** { qrCode, hostUrl }
- **Purpose:** Generate QR code for host login
- **URL Format:** https://HOST/host.html?room=ROOMCODE
- **QR Size:** 300x300, margin=2

#### GET /api/player-qr-code [Line 497]
- **Query:** ?room=ROOMCODE
- **Response:** { qrCode, playerUrl }
- **Purpose:** Generate QR code for player join
- **URL Format:** https://HOST/player.html?room=ROOMCODE
- **QR Size:** 300x300, margin=2

---

## Socket.IO Connection Handling [Line 545]

### Connection Lifecycle
```
Client connects
  → 'display:join' OR 'host:authenticate' OR 'player:join'
  → socket.join(roomCode)  — joins Socket.IO room
  → socket.roomCode = roomCode
  → socket.isDisplay/isHost/isPlayer = true

During game:
  → Relays events to all clients in room via io.to(roomCode).emit()

Client disconnects:
  → 'disconnect' event
  → Clean up player from players array (party mode)
  → Check if room now empty
```

### Display Connection [Line 549]
```javascript
socket.on('display:join', (roomCode) => {
  const room = getRoom(roomCode)
  if (!room) {
    socket.emit('error', { message: 'Room not found' })
    return
  }
  
  room.displaySocketId = socket.id
  socket.join(roomCode)
  socket.roomCode = roomCode
  socket.isDisplay = true
  
  socket.emit('display:joined', { roomCode, gameState: room.gameState })
})
```

### Host Authentication [Line 566]
```javascript
socket.on('host:authenticate', ({ roomCode, password }) => {
  const room = getRoom(roomCode)
  
  // Check password
  if (password !== HOST_PASSWORD) {
    socket.emit('host:authResult', { success: false, error: 'Invalid password' })
    return
  }
  
  // Check if another host already connected
  if (room.hostSocketId && room.hostSocketId !== socket.id) {
    const existingHostSocket = io.sockets.sockets.get(room.hostSocketId)
    if (existingHostSocket) {
      socket.emit('host:authResult', {
        success: false,
        error: 'Another host is already connected',
        canTakeOver: true
      })
      return
    }
  }
  
  room.hostSocketId = socket.id
  socket.join(roomCode)
  socket.emit('host:authResult', { success: true, gameState: room.gameState })
  io.to(roomCode).emit('host:connected')
})
```

### Player Join [Line 1214]
```javascript
socket.on('player:join', ({ roomCode, playerName }) => {
  const room = getRoom(roomCode)
  
  // Generate unique player ID
  const playerId = 'player_' + Date.now() + '_' + Math.random()
  
  // Create player object
  const player = {
    id: playerId,
    name: playerName,
    socketId: socket.id,
    team: null
  }
  
  room.gameState.players.push(player)
  socket.roomCode = roomCode
  socket.playerId = playerId
  socket.join(roomCode)
  
  socket.emit('player:joined', { playerId })
  io.to(roomCode).emit('players:updated', { players: room.gameState.players })
})
```

---

## Game State Management

### startGame Event [Line 650]
- **From:** Host
- **Payload:** { team1Name, team2Name, totalRounds }
- **Actions:**
  1. Update gameState with team names, round count
  2. Reset scores, round counter
  3. Set screen to 'game'
  4. Clear used question indices
  5. Start heartbeat
  6. Broadcast to all clients

### newQuestion Event [Line 679]
- **From:** Host
- **Payload:** { question, incrementRound }
- **Actions:**
  1. Set currentQuestion
  2. Clear revealedAnswers, strikes, entryLog
  3. Reset roundPointsEarned
  4. Optionally increment currentRound
  5. Broadcast question:loaded

### revealAnswer Event [Line 712]
- **From:** Host
- **Payload:** { index }
- **Actions:**
  1. Add index to revealedAnswers
  2. Calculate roundPointsEarned from revealed answers
  3. Mark answer as revealed
  4. Broadcast answer:revealed

### checkAnswer Event [Line 895]
- **From:** Host or Display
- **Payload:** { playerAnswer }
- **Actions:**
  1. Check if already processing (roomAnswerProcessing)
  2. Call callOpenAI() with question, answers, playerAnswer
  3. Parse response
  4. If correct:
     - Add to correctGuessesThisRound
     - Broadcast answer:correct
  5. If incorrect:
     - Broadcast answer:incorrect
  6. Add to entryLog
  7. Broadcast entryLog:updated

### addStrike / removeStrike [Line 726, 740]
- Increment/decrement strikes (0-3 range)
- Broadcast strike:updated
- On 3rd strike: Trigger steal phase

### addPoints Event [Line 754]
- **From:** Host
- **Payload:** { team, points }
- **Actions:**
  1. Add points to specified team's score
  2. Set lastWinningTeam and lastPointsAwarded
  3. Broadcast points:updated

---

## Party Mode Logic

### Player Assignment [Line 1402]
```javascript
socket.on('player:assignTeam', ({ playerId, team }) => {
  const room = getRoom(socket.roomCode)
  const player = room.gameState.players.find(p => p.id === playerId)
  
  player.team = team
  if (team === 1) {
    room.gameState.team1Players.push(playerId)
  } else {
    room.gameState.team2Players.push(playerId)
  }
  
  io.to(socket.roomCode).emit('teams:updated', { teams: room.gameState })
})
```

### Buzzer Logic [Line 1388]
- Player clicks buzzer during face-off
- Server records buzzer winner (first to emit)
- Emits buzzer:pressed to all
- Sets buzzerWinner in gameState
- Triggers next logic: winner's team takes turn

### Turn Chain Logic [Line 214]
- After buzzer phase, players alternate taking turns
- Uses getNextChainPlayer() to determine next player
- Each wrong answer moves to next team
- First correct answer wins control and points

### Steal Phase [Line 777]
- Triggered when striking team hits 3 strikes
- Other team gets ONE chance to guess
- If correct: steal all round points
- If wrong: striking team keeps points

---

## Timer Management [Line 981]

### timer:start
- Sets timerSeconds, timerRunning = true
- Broadcasts timer:started

### timer:pause
- Sets timerRunning = false
- Broadcasts timer:paused

### timer:update (from display tick)
- Updates timerCurrentSeconds
- Broadcasts timer:tick to sync all clients

### Automatic Timer in Party Mode [Line 1382]
- Host can enable auto-timer during setup
- Different times for different phases:
  - buzzerTime: 7s (buzzer phase)
  - afterBuzzerTime: 15s (after buzzer, before chain)
  - regularTime: 35s (normal play)
  - stealTime: 120s (steal phase)

---

## Error Handling

### Room Not Found
- **Response:** socket.emit('error', { message: 'Room not found' })
- **Triggers:** Any event with invalid roomCode

### Invalid Password
- **Response:** socket.emit('host:authResult', { success: false, error: 'Invalid password' })
- **Triggered:** host:authenticate with wrong password

### Answer Processing Error
- **Response:** socket.emit('answer:error', { error: error.message })
- **Triggered:** OpenAI API timeout or parse error

### Concurrent Answer Processing
- **Prevention:** roomAnswerProcessing Map
- Only one OpenAI call per room at a time
- Prevents multiple identical calls

---

## Performance Optimizations

1. **Answer Processing Queue** (line 41)
   - roomAnswerProcessing Map prevents concurrent OpenAI calls
   - Reduces API cost and latency

2. **Heartbeat Interval** (line 140)
   - Scales based on player count (5s for >8, 10s otherwise)
   - Balances sync frequency vs network load

3. **Static File Caching**
   - No explicit caching headers (rely on browser cache)
   - Could add: Cache-Control headers in serveStaticFile()

4. **Room Cleanup**
   - Rooms stay in memory indefinitely
   - In production, could add timeout to remove inactive rooms

---

## Configuration Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| PORT | 3000 (default) | Server port |
| HOST_PASSWORD | '654-SteveHarveyIsCool!-321' | Host login password |
| OpenAI Model | gpt-4o-mini | Answer validation |
| OpenAI Timeout | 30s | Max wait for API |
| Heartbeat Interval | 5-10s | State sync frequency |
| Room Code Length | 6 characters | Room identifier |

---

## Testing Endpoints

### Create a Room
```bash
curl -X POST http://localhost:3000/api/create-room
# Returns: {"roomCode":"A1B2C3"}
```

### Check an Answer
```bash
curl -X POST http://localhost:3000/api/check-answer \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Name a popular pet",
    "answers": ["Dog|50", "Cat|40", "Fish|10"],
    "playerAnswer": "Dog"
  }'
# Returns: {"result": "match", "matchedAnswer": "Dog", "answerIndex": 0}
```

### Get QR Code
```bash
curl "http://localhost:3000/api/qr-code?room=A1B2C3"
# Returns: {"qrCode": "data:image/png;base64,...", "hostUrl": "https://..."}
```

---

## Debugging

### Enable Logging
- Server logs all Socket.IO connections: console.log('Client connected:', socket.id)
- Logs room joins, host auth, player joins

### Common Issues
- **"Room not found"** — Display/Host/Player trying to join non-existent room
- **"Invalid password"** — Wrong host password entered
- **OpenAI timeout** — Network issue or API key invalid
- **Buzzer not working** — Check player's turn detection in player.js
- **Answer not validating** — Check OpenAI API response format
