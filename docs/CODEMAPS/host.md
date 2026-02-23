# Host Control Panel (host.html, host.js, host.css)

**Last Updated:** 2026-02-23
**Files:** host.html (376 lines), host.js (1462 lines), host.css (29697 bytes)

---

## Overview

The host control panel is where the game host controls everything. It works for:
- **Display Mode:** Host controls display from phone via Socket.IO
- **Party Mode:** Host manages teams, starts buzzer phases, controls game flow

The host panel has tabbed navigation for different views: Game, Teams, Help.

---

## Screens (host.html)

### 1. Host Login Screen (#host-login-screen)
- **Shows:** Login form when host.html first loads
- **Inputs:**
  - #room-code-input — 6-letter room code
  - #host-password-input — host password
- **Buttons:**
  - #host-login-btn — attempt login
- **Error display:** #host-login-error
- **Auto-fill:** Room code from URL parameter (?room=ROOMCODE)
- **Transitions to:** #host-control-screen on successful auth

### 2. Host Control Screen (#host-control-screen)
- **Shows after login** — main control panel with tabs
- **Connection Status Bar:**
  - #connection-bar (top of page)
  - #connection-indicator (dot, green when connected)
  - #connection-text (status message)

### 3. Navigation Tabs
- **Active Tab:** Highlighted with "active" class
- **All Tabs:**
  - 🎮 Game tab (data-tab="game") — controls
  - ❓ Help tab (data-tab="help") — how-to-play
  - 👥 Players (panel toggle) — show player list
  - 📱 Join Game (panel toggle) — show QR codes
  - 👥 Teams tab (party mode only, data-tab="teams")

### 4. Game Info Header
- **Always visible at top:**
  - #host-team1-name / #host-team1-score
  - #host-team2-name / #host-team2-score
  - #host-current-round / #host-total-rounds
  - Strike display: #host-strike-1, #host-strike-2, #host-strike-3
  - #host-turn-status-bar (party mode only, shows current player)

### 5. Tab Content: Game (#tab-game)

#### Current Question Display
- #host-question-text — shows loaded question
- Displays: "No question loaded" initially

#### Answer Board Preview
- List of 6 answer slots (data-index="0" through "5")
- Each shows:
  - Answer number (1-6)
  - Answer text: #host-answer-0 through #host-answer-5
  - Points: #host-points-0 through #host-points-5
  - "Reveal" button (individual reveal per answer in display mode)

#### Control Buttons
- **Primary:** #host-new-question-btn (📝 New Question)
- **Strike Controls:**
  - #host-add-strike-btn (❌ Add Strike)
  - #host-remove-strike-btn (↩ Remove Strike)
- **Flow Controls:**
  - #host-next-round-btn (End Round)
  - #host-reset-round-btn (Reset Round)
  - #host-end-game-btn (End Game)

### 6. Tab Content: Teams (#tab-teams, party mode only)
- **Shows:** Team management grid
- **Three columns:**
  - Team 1: #host-manage-team1-list (list of assigned players)
  - Unassigned: #host-manage-unassigned-list (players not on team)
  - Team 2: #host-manage-team2-list (list of assigned players)
- **Allows:** Drag/drop or click to assign players

### 7. Tab Content: Help (#tab-help)
- **Shows:** How-to-play guide for host
- **Sections:**
  - Game Controls
  - Display Controls
  - What Players See
  - Pro Tips

### 8. Setup Controls (#host-setup-controls, shown during setup)
- **Team Names:**
  - #host-team1-input
  - #host-team2-input
- **Rounds:**
  - Buttons for 3, 5, 7, 10 rounds
  - #host-custom-rounds input for custom
- **Timer Settings:** #timer-config-section
  - Toggle: #auto-timer-toggle (enable/disable)
  - Inputs: #buzzer-time-input, #after-buzzer-time-input, etc.
- **Buttons:**
  - #host-start-game-btn (START GAME)
  - #host-setup-help-btn (❓ How to Play)

### 9. Navigation Controls (bottom)
- **Always visible:**
  - #host-nav-setup-btn (⚙ Setup) — go to setup screen
  - #host-nav-game-btn (🎮 Game) — go to game screen
  - #host-reset-game-btn (🔄 Reset) — reset entire game

### 10. Disconnected Overlay (#disconnected-overlay)
- **Shows:** When connection lost
- #disconnect-reason — shows reason
- #reconnect-btn — manual reconnect button

### 11. Modals
- **Take Over Modal (#take-over-modal):**
  - Shows when another host is already connected
  - #take-over-btn — take control
  - #cancel-take-over-btn — cancel

---

## host.js Architecture

### Initialization (Top of File)
```javascript
const socket = io()  // Connect to server
let roomCode = new URLSearchParams(location.search).get('room')
let isHost = false
let gameState = null
let currentTab = 'game'
```

### Setup Functions

#### `initSocket()` [Line 245]
- Sets up all Socket.IO event listeners
- Called on page load
- Establishes connection and sets up handlers

#### `handleLogin()` [Line ~100]
- Reads #room-code-input and #host-password-input
- Emits `host:authenticate` to server
- On success: shows control screen, calls showGameTab()
- On error: displays error message, asks about takeover

#### `handleTakeover()` [Line ~150]
- If another host is connected, asks "Take over?"
- Emits `host:takeOver` to server
- Disconnects existing host
- Shows control screen

### Screen Navigation

#### `showSetup()` [Line ~200]
- Hides game controls
- Shows #host-setup-controls
- Populates team names, rounds
- Loads timer config

#### `showGameScreen()` [Line ~250]
- Hides setup controls
- Shows game tab content
- Updates question and answer preview

#### `showGameTab() / showTeamsTab() / showHelpTab()` [Line ~300-320]
- Switch active tab via data-tab attribute
- Hide all .tab-content, show selected one

### Game Control Functions

#### `emitNewQuestion()` [Line ~350]
- Gets random question from loaded questions array
- Emits `newQuestion` to server with full question object
- Server broadcasts to display + players
- Clears answer preview on host

#### `emitRevealAnswer(index)` [Line ~380]
- Emits `revealAnswer` with answer index
- Server broadcasts to all clients
- Updates host preview to show revealed answer

#### `emitAddStrike() / emitRemoveStrike()` [Line ~400-410]
- Emits `addStrike` or `removeStrike`
- Server increments/decrements strikes
- Updates strikes display
- After 3 strikes, server triggers steal phase

#### `emitCheckAnswer()` [Line ~430]
- Reads #player-answer-input
- Emits `checkAnswer` to server
- Server calls OpenAI API
- Receives answer:correct or answer:incorrect
- Shows result on host screen (doesn't display on audience screen)

#### `emitAddPoints()` [Line ~450]
- Reads #team-select (Team 1 or 2)
- Reads #points-input (number of points)
- Emits `addPoints` to server
- Server updates team score
- Broadcasts to all clients

#### `emitEndRound() / emitShowSummary()` [Line ~460-475]
- Emits `endRound` or `showRoundSummary`
- Server calculates round stats
- Broadcasts `round:summary` with details
- Display shows round stats screen

#### `emitContinue()` [Line ~480]
- After round summary, emits `continueFromSummary`
- If more rounds: broadcasts `round:continue`
- If last round: broadcasts `game:ended`

#### `emitResetRound() / emitResetGame()` [Line ~490-500]
- Resets round or entire game
- Clears all state on server
- Broadcasts to all clients

### Socket.IO Event Listeners

#### Connection Events
```javascript
socket.on('connect', () => {
  // Show connection bar as green
  updateConnectionStatus('connected')
})

socket.on('disconnect', () => {
  // Show connection bar as red
  updateConnectionStatus('disconnected')
})

socket.on('reconnect', (attemptNumber) => {
  // Re-authenticate if reconnected
  socket.emit('host:authenticate', { roomCode, password })
})
```

#### Game State Events
```javascript
socket.on('host:authResult', (data) => {
  if (data.success) {
    isHost = true
    gameState = data.gameState
    showGameScreen()
    updateGameDisplay()
  } else if (data.canTakeOver) {
    showTakeoverModal()
  } else {
    showError(data.error)
  }
})

socket.on('gameState:full', (state) => {
  gameState = state
  updateGameDisplay()
})

socket.on('game:started', (state) => {
  gameState = state
  updateGameDisplay()
})

socket.on('question:loaded', (data) => {
  gameState.currentQuestion = data.question
  updateAnswerPreview()
})

socket.on('answer:revealed', (data) => {
  gameState.revealedAnswers.push(data.index)
  updateAnswerPreview()
})

socket.on('answer:correct', (data) => {
  addEntryLog(`${data.playerName}: ${data.answer} ✓`)
})

socket.on('answer:incorrect', (data) => {
  addEntryLog(`${data.playerName}: ${data.answer} ✗`)
})

socket.on('strike:updated', (data) => {
  gameState.strikes = data.strikes
  updateStrikesDisplay()
})

socket.on('points:updated', (data) => {
  gameState.team1Score = data.team1Score
  gameState.team2Score = data.team2Score
  updateScoresDisplay()
})
```

#### Party Mode Events
```javascript
socket.on('players:updated', (data) => {
  gameState.players = data.players
  updatePlayersList()
})

socket.on('teams:updated', (data) => {
  gameState.team1Players = data.team1Players
  gameState.team2Players = data.team2Players
  updateTeamsDisplay()
})

socket.on('turn:changed', (data) => {
  gameState.currentTurnPlayer = data.newPlayer
  updateTurnDisplay()
})

socket.on('partyGame:nextBattle', (data) => {
  gameState.currentBattlePlayers = data.players
  updateBattleDisplay()
})
```

### Display Update Functions

#### `updateGameDisplay()` [Line ~550]
- Called after gameState changes
- Calls all sub-update functions:
  - updateScoresDisplay()
  - updateStrikesDisplay()
  - updateAnswerPreview()
  - updatePlayersList() (party mode)
  - updateTeamsDisplay() (party mode)
  - updateTurnDisplay() (party mode)

#### `updateScoresDisplay()` [Line ~560]
- Updates: #host-team1-score, #host-team2-score
- Updates: #host-team1-name, #host-team2-name

#### `updateStrikesDisplay()` [Line ~570]
- Updates: #host-strike-1, #host-strike-2, #host-strike-3
- Fills with X or hides based on gameState.strikes

#### `updateAnswerPreview()` [Line ~580]
- Shows all 6 answers in preview grid
- Marks revealed answers with color
- Shows points for revealed answers
- "Reveal" button next to unrevealed answers

#### `updatePlayersList()` [Line ~600]
- Party mode: updates player list in Teams tab
- Shows all players split by team
- Highlights current player

#### `updateTeamsDisplay()` [Line ~610]
- Party mode: updates team assignments UI
- Drag/drop interface for assigning players

#### `updateTurnDisplay()` [Line ~620]
- Party mode: shows "Current Turn: Player Name"
- In #host-turn-status-bar

### Helper Functions

#### `setupEventListeners()` [Line ~650]
- Attaches click handlers to all buttons
- Called on page load
- Listeners:
  - #host-login-btn → handleLogin()
  - #host-new-question-btn → emitNewQuestion()
  - .reveal-btn → emitRevealAnswer(index)
  - #host-add-strike-btn → emitAddStrike()
  - #host-check-answer-btn → emitCheckAnswer()
  - #host-next-round-btn → emitEndRound()
  - etc.

#### `loadQuestions()` [Line ~700]
- Fetch and parse questions.csv
- Convert to array for random selection
- Called on page load

#### `getRandomQuestion()` [Line ~710]
- Picks random question from array
- Ensures not already used in game
- Adds to usedQuestionIndices

#### `showError(message)` [Line ~720]
- Displays error message in #host-login-error or popup
- Auto-dismisses after 5 seconds

#### `safeEmit(event, data)` [Line ~235]
- Wrapper around socket.emit()
- Checks socket connection before emitting
- Prevents "emit on disconnected socket" errors

#### `updateConnectionStatus(status)` [Line ~730]
- Updates #connection-indicator color
- Updates #connection-text message
- Called on connect/disconnect/reconnect

---

## host.css Styling

### Layout Structure
```css
.host-screen (main container)
  ├─ .connection-bar (top status bar)
  ├─ .host-nav-tabs (tab buttons)
  ├─ .game-info-header (scores, round, strikes)
  ├─ .tab-content (scrollable content area)
  │   ├─ #tab-game
  │   ├─ #tab-teams
  │   └─ #tab-help
  └─ .nav-controls (bottom navigation)
```

### Color Scheme (Dark Theme)
```css
--bg-dark: #1a1a1a        /* Dark background */
--text-light: #ffffff     /* Light text */
--accent-primary: #3498db /* Blue */
--team1-color: #ff6b6b    /* Red */
--team2-color: #3a86ff    /* Blue */
--success-color: #4caf50  /* Green */
--danger-color: #f44336   /* Dark red */
```

### Key Classes

#### Tab Navigation
- `.nav-tab` — tab button
- `.nav-tab.active` — highlighted tab
- `.tab-content` — tab content container
- `.tab-content.active` — shown content

#### Control Buttons
- `.control-btn` — standard button
- `.control-btn.primary` — primary action (new question)
- `.control-btn.secondary` — secondary action (reveal)
- `.strike-btn.add / .strike-btn.remove` — strike controls
- `.flow-btn` — game flow buttons

#### Answer Preview
- `.answer-item` — individual answer preview
- `.answer-item .reveal-btn` — per-answer reveal button
- `.answer-text` — answer text
- `.answer-pts` — points display
- `.answer-revealed` — styling for revealed answer

#### Connection Status
- `.connection-bar` — top status bar
- `.connection-indicator` — color dot (red/green/yellow)
- `.connection-indicator.connected` — green
- `.connection-indicator.disconnected` — red
- `.connection-indicator.connecting` — yellow

#### Teams Grid
- `.teams-grid` — 3-column layout
- `.team-manage-column` — team column
- `.team-manage-list` — list of players in team
- `.unassigned-column` — center column

### Responsive Design

#### Mobile (< 768px)
- Tabs in horizontal scrollable list
- Content takes full width
- Buttons stack vertically in control sections
- Answer preview shows 1 per row

#### Tablet (768-1024px)
- Tabs on left side
- Content takes right side (side-by-side)
- Answer preview shows 2 per row

#### Desktop (> 1024px)
- Full layout with all panels visible
- Answer preview shows all 6 at once

### Animations
- `.button-press` — click effect
- `.fade-in` — content appears
- `.slide-in` — panel slides from side
- `.pulse` — highlight pulse on error

---

## Setup Flow (Single Device / Display Mode / Party Mode)

### Single Device Setup
1. User selects "Single Device" mode
2. display.js shows setup screen
3. Host enters team names, rounds
4. Clicks "START GAME"
5. display.js starts game directly (no server)

### Display Mode Setup
1. Display shows host QR code
2. Host scans and opens host.html?room=ROOMCODE
3. Host enters password
4. host.js authenticates via server
5. host.js shows setup controls
6. Host enters team names, rounds
7. Clicks "START GAME"
8. host.js emits startGame to server
9. Server broadcasts to display
10. display.js shows setup screen (synchronized)
11. Both proceed together

### Party Mode Setup
1. Display shows host QR code
2. Host scans, authenticates
3. Display shows player join QR codes
4. Host starts from host.html
5. Players scan player QR and join
6. Host sees player list updating
7. Host navigates to Teams tab
8. Host assigns players to teams (drag/drop)
9. Clicks "START GAME"
10. server.js starts party mode game logic
11. First face-off initialized
12. display.js shows battle announcement

---

## Common Issues & Solutions

### Host Can't Connect
- Check: Room code is correct (6 characters)
- Check: Host password is correct
- Check: Server is running
- Check: Network connection between devices

### Controls Not Working
- Check: socket.io connection is active (#connection-indicator green)
- Check: safeEmit() checks for connection
- Check: Browser console for errors

### Answer Check Always Wrong
- Check: OpenAI API key is valid
- Check: Server logs for API errors
- Check: Question format matches server expectations

### Players Not Appearing
- Check: Player join QR code is correct
- Check: Players entered their names
- Check: server.js emitting players:updated
- Check: host.js listening for players:updated

### Turn Not Changing
- Check: server.js emitting turn:changed
- Check: host.js listening for turn:changed
- Check: Player submitted answer (not just pressed buzzer)
