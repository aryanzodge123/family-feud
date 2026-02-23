# Display & Game Logic (index.html, script.js, styles.css)

**Last Updated:** 2026-02-23
**Files:** index.html (947 lines), script.js (4089 lines), styles.css (106KB)

---

## Overview

The display is the main game view that all players see. It shows:
- Game board with questions and answers
- Team scores and strike count
- Timer and entry log
- Round summaries and end game screen
- Party mode: battle announcements, buzzer results, turn order

The display works in all three game modes but shows different subsets of UI.

---

## Screen Flow (index.html Screens)

### 1. Mode Selection Screen (#mode-screen)
- **Shows:** Three mode buttons (Single Device, Display Mode, Party Mode)
- **Button IDs:**
  - #single-device-btn
  - #display-mode-btn
  - #party-mode-btn
  - #how-to-play-mode-btn
- **Transitions to:**
  - Single Device → Setup Screen
  - Display Mode → QR Code Screen
  - Party Mode → Party Mode Host QR Screen

### 2. QR Code Screens (Display Mode)

#### Display Mode Host QR (#qr-screen)
- **Shows:** QR code for host to scan
- **URL:** https://HOST/host.html?room=ROOMCODE
- **Updates:**
  - #qr-code-img — QR code image (generated via /api/qr-code)
  - #qr-room-code — displays room code
  - #host-status-indicator / #host-status-text — connection status
- **Buttons:**
  - #back-to-mode-btn — go back
  - #how-to-play-qr-btn — show tutorial

#### Party Mode Host QR (#party-host-qr-screen)
- **Shows:** QR for host login (first step of party mode)
- **Contains:** Same QR + room code display
- **Buttons:**
  - #party-back-to-mode-btn
  - #party-host-next-btn — proceed after host connects

#### Party Mode Player Join QR (#party-player-join-screen)
- **Shows:** Player join QR + live player list
- **Left side:** QR code for players
- **Right side:** #party-player-list — shows joined players
- **Buttons:**
  - #party-player-back-btn
  - #party-player-next-btn — proceed to team assignment

### 3. Tutorial Screen (#tutorial-screen)
- **Shows:** How-to-play guide with tabs for Single Device / Display Mode
- **Video:** Embedded YouTube video (Jqx6a3eIn6M?start=54)
- **Sections:**
  - The Questions — survey-based answers
  - Playing the Main Game — face-off, strikes, steal
  - Smart Answer Checker — AI validation
  - Timer — countdown management
  - Next Round — round summaries
  - Mode-specific sections for Single Device / Display Mode
  - Keyboard shortcuts for Single Device mode
- **Buttons:**
  - #back-to-mode-from-tutorial-btn
  - #continue-to-setup-btn

### 4. Setup Screen (#setup-screen)
- **Single Device / Display Mode setup**
- **Inputs:**
  - #team1-name-input, #team2-name-input
  - Round count buttons (3, 5, 7, 10 presets)
  - #custom-rounds-input for custom round count
- **Buttons:**
  - #back-to-tutorial-btn
  - #start-game-btn

### 5. Party Mode Setup Screens

#### Team Assignment (#party-team-assignment-screen)
- **Shows:** Drag/drop UI for assigning players to teams
- **Columns:**
  - Team 1: #party-team1-players (with name input)
  - Unassigned: #party-unassigned-players
  - Team 2: #party-team2-players (with name input)
- **Buttons:**
  - #party-team-back-btn
  - #party-start-game-btn

#### Configure Game (#party-config-screen)
- **Shows:** Rounds, timer settings (read-only during config)
- **Displays:**
  - #config-rounds-display
  - #config-timer-status
  - Timer details: buzzer time, after-buzzer, regular, steal

### 6. Main Game Screen (#game-container, shown after setup)

#### Question Display
- #question-text — "Name something that smells bad"
- #current-turn-display — "Current Turn: Player Name" (party mode)
- Round counter: "Round 1 of 7"

#### Team Scores
- #team1-display-name / #team1-score
- #team2-display-name / #team2-score

#### Strikes Display
- #strike-1, #strike-2, #strike-3 — visual strike markers

#### Answer Board (3x2 grid)
- 6 answer slots with data-index="0" through "5"
- Each slot has:
  - .answer-number (1-6)
  - #answer-0 through #answer-5 (the answer text)
  - #points-0 through #points-5 (the points)
- Click to reveal (display mode only)

#### Timer Panel (Left Side, Desktop)
- #timer-display — shows MM:SS
- #timer-controls-desktop — seconds input
- Timer buttons: start, pause, reset

#### Entry Log (Right Side)
- #entry-log-list — shows all player guesses this round
- #clear-log-btn — clear the log
- Format: "Player Name: Answer → Wrong" or "→ Correct"

#### Host Controls (Single Device Mode Only)
- #host-panel — shown/hidden via toggle
- Controls:
  - #new-question-btn
  - #reveal-answer-btn
  - #add-strike-btn / #remove-strike-btn
  - #add-points-btn
  - #reset-round-btn / #reset-game-btn
  - #end-game-btn
- Points input: #points-input
- Team selector: #team-select (Team 1 or 2)
- #show-summary-btn — "→ Next Round"

#### Answer Check Panel (Single Device Mode)
- #answer-panel — hidden by default
- #player-answer-input — text input for answer
- #check-answer-btn — validate answer
- #check-status — shows result (correct/incorrect)

#### Mobile Toggles (Responsive)
- #host-toggle-btn — toggle controls (⚙ icon)
- #timer-toggle-btn — toggle timer (⏱ icon)
- #entry-log-toggle-btn — toggle entry log (📋 icon)
- #answer-toggle-btn — toggle answer check (✎ icon)

#### Party Mode Extras
- #players-btn — show player list (👥 icon)
- #qr-codes-btn — show QR codes panel (📱 icon)
- #players-panel — side panel showing teams and current turn
- #qr-codes-panel — side panel with host + player QRs

### 7. Popups (Displayed Over Game)

#### Battle Announcement (#battle-popup)
- **Shows:** "FACE-OFF!" with two battle players
- **When:** Party mode, face-off phase starts
- **Updates:**
  - #battle-player1-name / #battle-player2-name
  - Team colors: .team-1-battle / .team-2-battle

#### Buzzer Winner (#buzzer-winner-popup)
- **Shows:** "Player pressed the button first!"
- **When:** Party mode, after buzzer pressed
- **Duration:** 1-2 seconds then auto-dismiss

#### Steal Phase (#steal-popup)
- **Shows:** "Team X gets to steal!"
- **When:** Party mode, after 3 strikes

#### Countdown (#countdown-popup)
- **Shows:** Large number "3 2 1 GO"
- **When:** Game starting
- **Duration:** ~3 seconds

#### Player Says (#player-says-popup)
- **Shows:** "Player says 'Answer' Survey says..."
- **When:** Party mode, answer submitted
- **Reveals answer after animation**

### 8. Round Summary (#round-summary-screen)
- **Shows:** Points awarded, correct guesses, missed answers, stats
- #summary-round-number
- #summary-winning-team / #summary-points-value
- #summary-question
- #summary-correct-answers / #summary-missed-answers
- #summary-answers-found (count), #summary-strikes
- Final scores displayed
- #next-round-btn to continue

### 9. End Game Screen (#end-screen)
- **Shows:** Winner announcement with trophy
- #winner-text — "TEAM NAME WINS!"
- Final scores displayed
- #play-again-btn to restart

---

## script.js Key Functions

### Initialization (Top of File)
- Initialize Socket.IO connection
- Set up event listeners for buttons
- Load questions from CSV files

### Screen Transitions
- `showScreen(screenId)` — hide all, show one
- `goToMode()` — return to mode selection
- `goToQR()` — show QR code screen
- `goToTutorial()` — show how-to-play

### Setup & Start Game
- `startSetup()` — show setup screen
- `startSingleDevice()` — mode selection
- `startDisplayMode()` — mode selection
- `startPartyMode()` — mode selection
- `handleStartGame()` — validate and start

### Question & Answer Management
- `loadQuestion()` — get random question, update display
- `revealAnswer(index)` — animate answer reveal
- `checkAnswer()` — validate via server/OpenAI
- `addStrike()` / `removeStrike()` — update strike display
- `addPoints()` — award points to team

### Display Updates
- `updateTeamNames()` — set team name displays
- `updateScores()` — update team score displays
- `updateStrikesDisplay()` — visual strike indicators
- `updateEntryLog()` — add entry to log
- `updateTimer()` — display timer seconds

### Timer Management
- `startTimer(seconds)` — begin countdown
- `pauseTimer()` — pause running timer
- `resetTimer(seconds)` — reset timer
- `updateTimerDisplay()` — update every second

### Animation Functions
- `animateReveal(index)` — card flip effect
- `triggerConfetti()` — celebration animation
- `showBigStrike()` — large X appears
- `showTimesUp()` — "TIME'S UP!" display

### Party Mode Functions
- `showBattlePopup(player1, player2)` — face-off announcement
- `showBuzzerWinner(playerName)` — buzzer result
- `showStealPhase(teamName)` — steal announcement
- `updatePlayersList()` — show teams and current player
- `showCurrentTurn()` — highlight whose turn it is

### Socket.IO Event Listeners
- `socket.on('display:joined', ...)` — display connected to room
- `socket.on('game:started', ...)` — game initialization
- `socket.on('question:loaded', ...)` — new question received
- `socket.on('answer:revealed', ...)` — reveal animation
- `socket.on('answer:correct/incorrect', ...)` — answer result
- `socket.on('strike:updated', ...)` — strike change
- `socket.on('points:updated', ...)` — score change
- `socket.on('timer:started/paused/tick', ...)` — timer updates
- `socket.on('entryLog:updated', ...)` — entry log change
- `socket.on('round:summary', ...)` — show round stats
- `socket.on('round:continue', ...)` — next round
- `socket.on('game:ended', ...)` — end game screen

### Party Mode Events
- `socket.on('turn:changed', ...)` — update turn display
- `socket.on('buzzer:pressed', ...)` — show buzzer winner
- `socket.on('steal:phase', ...)` — show steal announcement
- `socket.on('partyGame:nextBattle', ...)` — new face-off
- `socket.on('players:updated', ...)` — player list change

---

## Styling (styles.css)

### Layout Structure
```
.container (main game area)
  ├─ .question-container (question + team scores)
  ├─ .strikes-container (strike display)
  └─ .game-board-wrapper
      ├─ .timer-panel (left side)
      ├─ .answers-container (3x2 grid)
      │   └─ .answer-row (2 answers per row)
      │       └─ .answer-slot (individual answer)
      └─ .entry-log-panel (right side)
```

### Animation Keyframes
- `@keyframes reveal` — answer card flip (rotate + scale)
- `@keyframes confetti` — falling confetti pieces
- `@keyframes strike-appear` — strike X appears
- `@keyframes popup-appear` — popup scales in
- `@keyframes pulse` — highlight pulse effect

### Color Scheme
```css
--team1-color: rgb(255, 107, 107)  /* Red for Team 1 */
--team2-color: rgb(58, 134, 255)   /* Blue for Team 2 */
--correct-color: #4caf50           /* Green */
--wrong-color: #f44336             /* Dark Red */
```

### Responsive Breakpoints
- **Mobile (< 768px):** Single column, toggleable panels
- **Tablet (768-1024px):** 2-column layout
- **Desktop (> 1024px):** Full 3-panel layout visible

### Key Classes
- `.answer-revealed` — answer text/points shown, background color
- `.strike-active` — strike X is visible and filled
- `.current-turn` — highlighted player in party mode
- `.team-1` / `.team-2` — team-specific styling (colors)
- `.mobile-only` / `.desktop-only` — responsive visibility

---

## Single Device Mode Features

### Keyboard Shortcuts
- **N** — New Question
- **R** — Reveal Answer
- **S** — Add Strike
- **A** — Add Points
- **ESC** — Reset Round

### Control Panel Toggle
- Click ⚙ (Controls) to show/hide control buttons
- Click ✎ (Answer) to show/hide answer input
- Buttons appear/disappear to save screen space

### Answer Checking (Single Device Only)
- Host types player's answer in popup
- Click "Check Answer"
- OpenAI validates via /api/check-answer endpoint
- Result shows inline (correct/incorrect + matched answer)

---

## Display Mode Features

### Display-Only View
- Game board visible, no controls
- Timer syncs from host
- Answers reveal in sequence
- Entry log updates automatically
- All results broadcast from host

### Answer Board in Display Mode
- Each answer slot can be clicked to reveal (host choice in host.html)
- Host controls all reveals from phone
- Display shows animations only

---

## Party Mode Features

### Players Panel
- Shows all players split by team
- Highlights current player whose turn it is
- Updates in real-time as teams change

### QR Codes Panel
- Shows host QR (for new hosts to join)
- Shows player QR (for new players to join)
- Room codes displayed

### Battle Announcement
- Two players chosen for face-off
- Large "FACE-OFF!" popup
- Shows both player names and team colors

### Buzzer Winner Display
- Shows who pressed buzzer first
- Screen rings effect
- "You weren't fast enough!" for losers

### Steal Phase Animation
- "Team X gets to steal!" popup
- Highlighted so everyone knows

### Turn Indicator
- "Current Turn: Player Name"
- Updates after each guess
- Helps players know who's next

---

## Connection & Sync

### Initial Connection (Display Mode)
1. Display shows QR with room code
2. emits `display:join` with room code
3. Receives `display:joined` with full gameState
4. Sets up Socket.IO listeners

### Initial Connection (Single Device)
1. User selects Single Device mode
2. Creates room via /api/create-room
3. Shows setup screen (no server communication needed)
4. Uses /api/check-answer for answer validation only

### State Sync
- Server broadcasts `gameState:update` after any change
- Display listens for specific events (question:loaded, answer:revealed, etc.)
- Heartbeat every 10s catches any missed updates
- On reconnect, display calls `requestState` to get full state

---

## Common Issues & Solutions

### Answers Not Revealing
- Check: Host calling revealAnswer event (host.js)
- Check: Server emitting answer:revealed to room
- Check: script.js listening for answer:revealed event

### Timer Not Syncing
- Check: host.js emitting timer:start/pause/update
- Check: script.js listening for timer:* events
- Check: Timer display updated on timer:tick

### Strikes Not Displaying
- Check: Host calling addStrike event
- Check: script.js listening for strike:updated
- Check: updateStrikesDisplay() function updating DOM

### Entry Log Not Updating
- Check: server.js emitting entryLog:updated
- Check: script.js listening for entryLog:updated
- Check: updateEntryLog() function adding entries to DOM

---

## Testing Checklist

- [ ] Single Device: Can load question, reveal answers, add strikes, check answers
- [ ] Display Mode: Host QR works, host can control display
- [ ] Party Mode: Players can buzz, submit answers, see their turn
- [ ] Timer: Countdown displays, syncs across all clients
- [ ] Entry Log: All guesses recorded, "Clear Log" works
- [ ] Round Summary: Shows correct/missed answers, statistics
- [ ] End Game: Winner announced, final scores displayed
- [ ] Responsive: Mobile buttons (⚙ ✎ ⏱ 📋) work on small screens
- [ ] Animations: Reveals, confetti, popups work smoothly
