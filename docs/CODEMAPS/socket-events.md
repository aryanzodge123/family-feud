# Socket.IO Event Reference

**Last Updated:** 2026-02-23
**Total Events:** 40+

This document describes all Socket.IO events used in Family Feud for real-time communication between server and clients.

---

## Connection & Authentication

### display:join
- **From:** Display (index.html/script.js)
- **To:** Server
- **Payload:** roomCode (string)
- **Response:** `display:joined` with gameState
- **Purpose:** Display connects to a room to show the game
- **Server Handler:** Line 549

### host:authenticate
- **From:** Host (host.html/host.js)
- **To:** Server
- **Payload:** { roomCode, password }
- **Response:** `host:authResult` with success flag
- **Purpose:** Host logs in with password to control game
- **Server Handler:** Line 566
- **Notes:** Password is hardcoded in server.js (line 35)

### host:takeOver
- **From:** Host (new connection)
- **To:** Server
- **Payload:** { roomCode, password }
- **Response:** `host:authResult` with success flag
- **Purpose:** New host takes control from existing host
- **Server Handler:** Line 607
- **Notes:** Disconnects existing host from room

### player:join
- **From:** Player (player.html/player.js)
- **To:** Server
- **Payload:** { roomCode, playerName }
- **Response:** `player:joined` with playerId
- **Purpose:** Player joins game (party mode only)
- **Server Handler:** Line 1214
- **Notes:** Generates unique playerId, adds to players array

### player:reconnect
- **From:** Player (after disconnect/network loss)
- **To:** Server
- **Payload:** { roomCode, playerId, playerName }
- **Response:** `player:reconnected` with gameState
- **Purpose:** Player reconnects to existing session
- **Server Handler:** Line 1253

### disconnect
- **From:** Any client
- **To:** Server
- **Payload:** None (automatic)
- **Purpose:** Clean up when client disconnects
- **Server Handler:** Line 1291
- **Notes:** Removes player from players array in party mode

---

## Game Setup & Flow

### startGame
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** { team1Name, team2Name, totalRounds }
- **Broadcast:** `game:started` with full gameState
- **Purpose:** Initialize game with team names and round count
- **Server Handler:** Line 650
- **Notes:** Starts heartbeat for state sync

### navigate
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** { screen }
- **Broadcast:** `gameState:update` with screen name
- **Purpose:** Change current screen (tutorial → setup → game → end)
- **Server Handler:** Line 639

### partyGame:start
- **From:** Server (internal logic)
- **To:** Display + Players
- **Broadcast:** Event to all clients
- **Purpose:** Start party mode game after team assignment
- **Server Handler:** Line 1325

### partyScreen:navigate
- **From:** Host
- **To:** Server → Display + Players
- **Payload:** { screen }
- **Broadcast:** `partyScreen:updated` with new screen
- **Purpose:** Navigate party mode screens (lobby → teams → game)
- **Server Handler:** Line 1357

---

## Question & Answer Management

### newQuestion
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** { question, incrementRound }
- **Broadcast:** `question:loaded` with question + answers
- **Purpose:** Load new question, reset reveals/strikes
- **Server Handler:** Line 679
- **Notes:** Clears entry log and strike count

### revealAnswer
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** { index }
- **Broadcast:** `answer:revealed` with index
- **Purpose:** Reveal a specific answer on board
- **Server Handler:** Line 712
- **Notes:** Adds index to revealedAnswers array, calculates points

### checkAnswer
- **From:** Host or Display (for answer validation)
- **To:** Server (calls OpenAI API)
- **Payload:** { playerAnswer }
- **Response:** `answer:result` with result
- **Purpose:** Validate player's answer against board answers
- **Server Handler:** Line 895
- **Notes:** Calls OpenAI API, emits correct/incorrect to all clients

### answer:correct
- **From:** Server (from checkAnswer logic)
- **To:** Display + Players (broadcast)
- **Payload:** { answerIndex, playerName }
- **Purpose:** Notify all clients that an answer is correct
- **Broadcast:** Line 950

### answer:incorrect
- **From:** Server (from checkAnswer logic)
- **To:** Display + Players (broadcast)
- **Payload:** { playerName }
- **Purpose:** Notify all clients that an answer is incorrect
- **Broadcast:** Line 964

---

## Strikes & Points

### addStrike
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** None
- **Broadcast:** `strike:updated` with strike count
- **Purpose:** Add one strike to current round
- **Server Handler:** Line 726
- **Notes:** Max 3 strikes, triggers steal phase on 3rd strike

### removeStrike
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** None
- **Broadcast:** `strike:updated` with strike count
- **Purpose:** Remove one strike (undo)
- **Server Handler:** Line 740

### addPoints
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** { team, points }
- **Broadcast:** `points:updated` with team scores
- **Purpose:** Award points to winning team
- **Server Handler:** Line 754
- **Notes:** Updates team score and round won flag

---

## Timer Management

### timer:start
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** { seconds }
- **Broadcast:** `timer:started` with duration
- **Purpose:** Start countdown timer
- **Server Handler:** Line 981

### timer:pause
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** None
- **Broadcast:** `timer:paused`
- **Purpose:** Pause running timer
- **Server Handler:** Line 995

### timer:reset
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** { seconds }
- **Broadcast:** `timer:reset` with new duration
- **Purpose:** Reset timer to specified seconds
- **Server Handler:** Line 1006

### timer:update
- **From:** Display (script.js, from setInterval)
- **To:** Server → Display + Players
- **Payload:** { seconds }
- **Broadcast:** `timer:tick` with current seconds
- **Purpose:** Update timer display every second
- **Server Handler:** Line 1021

### timer:stop
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** None
- **Broadcast:** `timer:stopped`
- **Purpose:** Stop/clear timer
- **Server Handler:** Line 1032

### timer:finished
- **From:** Display (when countdown reaches 0)
- **To:** Server → Display + Players
- **Payload:** None
- **Broadcast:** `timer:timesUp`
- **Purpose:** Notify all clients time is up
- **Server Handler:** Line 1038

### timerConfig:update
- **From:** Host (host.js, during setup)
- **To:** Server
- **Payload:** { buzzerTime, afterBuzzerTime, regularTime, stealTime, enabled }
- **Purpose:** Update timer configuration for game
- **Server Handler:** Line 1382
- **Notes:** Sets timerConfig in gameState

---

## Party Mode: Buzzer & Turns

### player:buzz
- **From:** Player (player.js, buzzer button)
- **To:** Server → Display + Host + All Players
- **Payload:** { playerId }
- **Broadcast:** `buzzer:pressed` with player info
- **Purpose:** Player presses buzzer during face-off
- **Server Handler:** Line 1388
- **Notes:** Determines buzzer winner, triggers chain logic

### player:submitAnswer
- **From:** Player (player.js, answer input)
- **To:** Server → All clients
- **Payload:** { playerId, answer }
- **Purpose:** Player submits answer during their turn
- **Server Handler:** Line 1441
- **Notes:** Validated via checkAnswer, updates turn

### partyGame:setTurn
- **From:** Host or Server
- **To:** Server → Display + Players
- **Broadcast:** `turn:changed` with player info
- **Purpose:** Set whose turn it is to answer
- **Server Handler:** Line 1466

### partyGame:nextBattle
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Broadcast:** `partyGame:nextBattle` with battle players
- **Purpose:** Start next face-off (two new battle players)
- **Server Handler:** Line 1496

---

## Round & Game Flow

### endRound
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** { team, points, correctGuesses }
- **Broadcast:** `round:summary` with stats
- **Purpose:** End current round, show summary
- **Server Handler:** Line 777

### showRoundSummary
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Broadcast:** `round:summary` with detailed stats
- **Purpose:** Display round statistics and results
- **Server Handler:** Line 817

### continueFromSummary
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Broadcast:** Either `game:ended` or `round:continue`
- **Purpose:** Move from summary to next round or end game
- **Server Handler:** Line 874

### resetRound
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Broadcast:** `round:reset` with fresh gameState
- **Purpose:** Reset current round (undo all progress)
- **Server Handler:** Line 1072

### resetGame
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Broadcast:** `game:reset` with fresh gameState
- **Purpose:** Reset entire game (new teams, new questions)
- **Server Handler:** Line 1087

### endGame
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Broadcast:** `game:ended` with final scores
- **Purpose:** End game, show final winner
- **Server Handler:** Line 1163

---

## Party Mode: Team Management

### player:assignTeam
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** { playerId, team }
- **Broadcast:** `teams:updated` with team assignments
- **Purpose:** Assign player to Team 1 or Team 2
- **Server Handler:** Line 1402

---

## UI & State Sync

### display:animationComplete
- **From:** Display (script.js)
- **To:** Server
- **Payload:** None
- **Purpose:** Notify server that animation finished
- **Server Handler:** Line 1045
- **Notes:** Used to sync pending turn changes and steal phases

### requestState
- **From:** Any client (on reconnect)
- **To:** Server
- **Payload:** None
- **Response:** `gameState:full` with entire game state
- **Purpose:** Get full current game state
- **Server Handler:** Line 1195

### gameState:update
- **From:** Server (after any state change)
- **To:** Display + Host + Players
- **Broadcast:** Emitted with updated fields
- **Purpose:** Keep all clients in sync
- **Server Handler:** Various (emitted by server)

### state:heartbeat
- **From:** Server (interval)
- **To:** All clients in room
- **Broadcast:** Every 5-10 seconds
- **Payload:** { team1Score, team2Score, strikes, ... }
- **Purpose:** Periodic state sync to catch missed updates
- **Server Handler:** Line 147

### panel:toggle
- **From:** Host (host.js)
- **To:** Server → Display
- **Broadcast:** `panel:toggle` with panel name
- **Purpose:** Show/hide panels on display (players, QR codes)
- **Server Handler:** Line 1205

---

## Entry Log

### clearEntryLog
- **From:** Host (host.js)
- **To:** Server → Display + Players
- **Payload:** None
- **Broadcast:** `entryLog:cleared`
- **Purpose:** Clear all entries from current round
- **Server Handler:** Line 1183

### entryLog:updated
- **From:** Server (after answer checked)
- **To:** Display + Players
- **Broadcast:** Event with new entry
- **Purpose:** Update entry log on all clients
- **Broadcast:** Line 970, 1053

---

## Connection Status

### host:authResult
- **From:** Server
- **To:** Host (direct emit)
- **Payload:** { success, gameState, error }
- **Response to:** `host:authenticate` or `host:takeOver`
- **Purpose:** Confirm host authentication success/failure

### host:connected
- **From:** Server (broadcast)
- **To:** Display + Players in room
- **Broadcast:** After successful host auth
- **Purpose:** Notify all clients that host is ready

### host:disconnected
- **From:** Server
- **To:** Old host (direct emit)
- **Payload:** { reason }
- **Purpose:** Notify host they've been disconnected
- **Use Case:** Host takeover, host timeout

### display:joined
- **From:** Server
- **To:** Display (direct emit)
- **Payload:** { roomCode, gameState }
- **Response to:** `display:join`
- **Purpose:** Confirm display joined successfully

### player:joined
- **From:** Server
- **To:** New player (direct emit)
- **Payload:** { playerId }
- **Response to:** `player:join`
- **Purpose:** Confirm player joined, give playerId

### player:reconnected
- **From:** Server
- **To:** Player (direct emit)
- **Payload:** { gameState }
- **Response to:** `player:reconnect`
- **Purpose:** Restore player to existing session

### player:error
- **From:** Server
- **To:** Player (direct emit)
- **Payload:** { message }
- **Purpose:** Inform player of error (room not found, etc.)

### error
- **From:** Server
- **To:** Client (direct emit)
- **Payload:** { message }
- **Purpose:** Generic error message

---

## Event Flow Examples

### Single Device Mode
```
User clicks "New Question"
  → script.js emits checkAnswer to server (or direct API call)
  → Server validates with OpenAI
  → Server emits answer:correct or answer:incorrect
  → script.js updates display
```

### Display Mode: Host Controls Game
```
Host clicks "New Question"
  → host.js emits newQuestion to server
  → Server updates gameState, emits question:loaded to room
  → script.js receives and displays question
  → Host clicks "Reveal Answer"
  → host.js emits revealAnswer
  → Server emits answer:revealed
  → script.js animates reveal
```

### Party Mode: Buzzer Winner
```
Player presses buzzer
  → player.js emits player:buzz with playerId
  → Server determines buzzer winner (fastest)
  → Server emits buzzer:pressed broadcast
  → Display shows buzzer winner with animation
  → Players see who won buzzer
  → Turn changes to buzzer winner
```

### Party Mode: Answer Validation
```
Player submits answer
  → player.js emits player:submitAnswer
  → Server calls checkAnswer, validates with OpenAI
  → Server emits answer:correct or answer:incorrect to all
  → Display reveals answer (if correct)
  → Points update if correct
  → Next player's turn begins
```

---

## Timing & Reliability Notes

- **Heartbeat interval:** 5-10 seconds (based on player count)
- **Connection timeout:** 30+ seconds (Socket.IO default)
- **Answer validation:** ~1-2 seconds (OpenAI API call)
- **Reconnection strategy:** Auto-reconnect with exponential backoff
- **Message queueing:** Socket.IO handles queuing during disconnects
- **Room cleanup:** Rooms remain until server restart
