# Player Interface (player.html, player.js, player.css)

**Last Updated:** 2026-02-23
**Files:** player.html (126 lines), player.js (1178 lines), player.css (13797 bytes)
**Mode:** Party Mode Only

---

## Overview

The player interface is for individual players in party mode. Players use their phones to:
- Buzz during face-off phase
- Submit answers during their turn
- See current question and entry log
- Receive visual feedback (correct/wrong, buzzer results)

Each player has a unique playerId and socket connection.

---

## Screens (player.html)

### 1. Join Screen (#join-screen)
- **Shows:** Player name input form
- **Inputs:**
  - #player-name-input — player's name (max 20 chars)
- **Display:**
  - #join-room-code — shows current room code
- **Buttons:**
  - #join-btn — join game with name
- **Error display:** #join-error
- **Auto-fill:** Room code from URL parameter (?room=ROOMCODE)
- **Transitions to:** #waiting-screen on successful join

### 2. Waiting Screen (#waiting-screen)
- **Shows:** While waiting to be assigned to a team
- **Display:**
  - .waiting-icon — spinning loader animation
  - #waiting-text — "Waiting to be added to a team..."
  - #display-player-name — confirms player's name
- **Stays on this screen:** Until host assigns player to team

### 3. Game Screen (#game-screen)
- **Shows:** All game information and controls

#### Round & Player Info (Top)
- .round-info — "Round 1/7"
- .game-player-name — "Playing as: Alice"

#### Question Display
- .question-box
- #player-question-text — current question being asked

#### Buzzer Section (#buzzer-section, hidden unless buzzer phase)
- #buzzer-message — "Get Ready!" or "BUZZ!" or "TOO SLOW!"
- #buzzer-btn — large button for buzzing in
- **Styling:** Disabled/enabled based on gameState.buzzerPhase

#### Answer Section (#answer-section)
- #turn-message — "Waiting for your turn..." or "It's your turn!"
- #answer-input-container — input + submit button
  - #player-answer-input — text field for answer
  - #submit-answer-btn — submit answer
- #answer-status — result display (hidden until answer submitted)
  - #status-icon — checkmark or X
  - #status-message — "Correct!" or "Wrong"

#### Entry Log (#entry-log-section)
- Shows all player guesses this round
- Format: "Player Name: Answer → ✓ Correct" or "✗ Wrong"
- #player-entry-log — list container

#### Timer Display (#timer-section)
- #player-timer-display — "MM:SS" format
- Synced with server timer

#### Visual Feedback
- #screen-ring — ring animation when buzzer pressed
- #too-slow-banner — "You weren't fast enough!" when lost buzzer

### 4. Error Popup (#error-popup)
- **Shows:** When error occurs (room not found, connection lost, etc.)
- #error-text — error message
- Auto-dismisses after 3-5 seconds

---

## player.js Architecture

### Initialization (Top of File)
```javascript
const socket = io()  // Connect to server
let roomCode = new URLSearchParams(location.search).get('room')
let playerId = null
let playerName = null
let gameState = null
let isMyTurn = false
let buzzerPhase = false
```

### Core Connection Flow

#### `initSocket()` [Line ~50]
- Sets up all Socket.IO event listeners
- Called on page load
- Establishes connection to server

#### `handleJoin()` [Line ~100]
- Reads #player-name-input
- Validates name (non-empty, max 20 chars)
- Emits `player:join` to server with roomCode + playerName
- Server responds with `player:joined` containing playerId
- Stores playerId locally
- Shows waiting screen

### Screen Transitions

#### `showWaitingScreen()` [Line ~150]
- Hide join screen, show waiting screen
- Display player name
- Show spinner animation
- Wait for team assignment from host

#### `showGameScreen()` [Line ~170]
- Hide waiting screen, show game screen
- Called when host assigns player to team
- Enable buzzer button (if during buzzer phase)
- Enable answer input (if player's turn)

### Game Logic

#### `onBuzzerPhaseStart()` [Line ~200]
- Called when server broadcasts buzzer:phase event
- Checks if current player is one of the two battle players
- If yes: enable buzzer button, show "BUZZ!"
- If no: disable buzzer button, show "Watch the others buzz"

#### `handleBuzzerPress()` [Line ~230]
- Player clicks #buzzer-btn
- Emit `player:buzz` to server with playerId
- Server determines who buzzed first
- If this player wins:
  - Show green screen ring
  - Show "You buzzed first!" message
  - Enable answer input
- If this player loses:
  - Show red screen ring
  - Show #too-slow-banner

#### `onTurnChanged()` [Line ~260]
- Called when server broadcasts turn:changed
- If currentTurnPlayer === playerId:
  - isMyTurn = true
  - Enable #player-answer-input
  - Enable #submit-answer-btn
  - Show #turn-message: "It's your turn!"
- If not my turn:
  - isMyTurn = false
  - Disable inputs
  - Show #turn-message: "Waiting for [player] to answer..."

#### `handleAnswerSubmit()` [Line ~290]
- Player types answer in #player-answer-input
- Click #submit-answer-btn
- Emit `player:submitAnswer` to server with playerId + answer
- Server validates via OpenAI
- Server broadcasts answer:correct or answer:incorrect
- Update #answer-status with result
- Disable input after submission (wait for next turn)

### Socket.IO Event Listeners

#### Connection Events
```javascript
socket.on('connect', () => {
  console.log('Connected to server')
  updateConnectionStatus('connected')
})

socket.on('disconnect', () => {
  console.log('Disconnected from server')
  updateConnectionStatus('disconnected')
  showError('Connection lost. Attempting to reconnect...')
})

socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts')
  // Auto-rejoin game with playerId + playerName
  socket.emit('player:reconnect', { roomCode, playerId, playerName })
})
```

#### Join Events
```javascript
socket.on('player:joined', (data) => {
  playerId = data.playerId
  localStorage.setItem('playerId', playerId)
  showWaitingScreen()
})

socket.on('player:reconnected', (data) => {
  gameState = data.gameState
  showGameScreen()
  updateGameDisplay()
})

socket.on('player:error', (data) => {
  showError(data.message)
  // Can retry join
})
```

#### Game State Events
```javascript
socket.on('game:started', (state) => {
  gameState = state
  if (gameState.partyMode && gameState.currentBattlePlayers.includes(playerId)) {
    showGameScreen()
    updateGameDisplay()
  }
})

socket.on('question:loaded', (data) => {
  gameState.currentQuestion = data.question
  updateQuestionDisplay()
})

socket.on('gameState:update', (data) => {
  // Partial update
  Object.assign(gameState, data)
  updateGameDisplay()
})

socket.on('state:heartbeat', (data) => {
  // Periodic state sync
  Object.assign(gameState, data)
})
```

#### Buzzer & Turn Events
```javascript
socket.on('partyGame:nextBattle', (data) => {
  gameState.currentBattlePlayers = data.players
  gameState.buzzerPhase = true
  
  if (data.players.includes(playerId)) {
    // This player is one of the two!
    enableBuzzerButton()
    updateTurnMessage(`You vs ${getOtherPlayerName()}!`)
  } else {
    // Watching others
    disableBuzzerButton()
    updateTurnMessage('Watching...')
  }
})

socket.on('buzzer:pressed', (data) => {
  gameState.buzzerWinner = data.winnerId
  gameState.buzzerLoser = data.loserId
  
  if (data.winnerId === playerId) {
    // I won!
    showBuzzerWin()
    enableAnswerInput()
  } else if (data.loserId === playerId) {
    // I lost!
    showBuzzerLoss()
    disableAnswerInput()
  }
})

socket.on('turn:changed', (data) => {
  gameState.currentTurnPlayer = data.newPlayer
  
  if (data.newPlayer === playerId) {
    isMyTurn = true
    enableAnswerInput()
    updateTurnMessage('Your turn! What\'s your answer?')
  } else {
    isMyTurn = false
    disableAnswerInput()
    updateTurnMessage(`${data.newPlayerName}'s turn...`)
  }
})
```

#### Answer & Result Events
```javascript
socket.on('answer:correct', (data) => {
  // Add to entry log
  addEntryLogItem(`${data.playerName}: ${data.answer} ✓`)
  
  if (data.playerName === playerName) {
    // I got it right!
    showCorrectFeedback()
    addEntryLogItem(`YOUR ANSWER: ${data.answer} ✓`, 'highlight')
  }
  
  gameState.strikes = 0  // Reset strikes on correct
})

socket.on('answer:incorrect', (data) => {
  // Add to entry log
  addEntryLogItem(`${data.playerName}: ${data.answer} ✗`)
  
  if (data.playerName === playerName) {
    // I got it wrong!
    showWrongFeedback()
    addEntryLogItem(`YOUR ANSWER: ${data.answer} ✗`, 'highlight')
  }
  
  gameState.strikes++
})
```

#### Timer Events
```javascript
socket.on('timer:started', (data) => {
  gameState.timerRunning = true
  gameState.timerCurrentSeconds = data.seconds
  updateTimerDisplay()
})

socket.on('timer:tick', (data) => {
  gameState.timerCurrentSeconds = data.seconds
  updateTimerDisplay()
})

socket.on('timer:paused', () => {
  gameState.timerRunning = false
})

socket.on('timer:stopped', () => {
  gameState.timerRunning = false
  gameState.timerCurrentSeconds = 0
  updateTimerDisplay()
})

socket.on('timer:timesUp', () => {
  showTimesUpMessage()
  disableAnswerInput()
})
```

#### Round & Game End Events
```javascript
socket.on('round:summary', (data) => {
  // Show summary on player's screen
  updateRoundSummary(data)
})

socket.on('round:continue', () => {
  // Reset for next round
  clearAnswerInput()
  resetFeedback()
})

socket.on('game:ended', (data) => {
  // Show final winner
  showEndGame(data.winner, data.team1Score, data.team2Score)
})
```

### Display Update Functions

#### `updateGameDisplay()` [Line ~400]
- Called after gameState changes
- Updates all visible elements:
  - updateQuestionDisplay()
  - updateTurnMessage()
  - updateTimerDisplay()
  - updateEntryLog()

#### `updateQuestionDisplay()` [Line ~410]
- Updates #player-question-text
- Shows: "Name a pet that smells bad"

#### `updateTurnMessage()` [Line ~420]
- Updates #turn-message based on current turn
- Shows: "Your turn!" or "[Player]'s turn..." or "Watching..."

#### `updateTimerDisplay()` [Line ~430]
- Updates #player-timer-display
- Format: "01:23" (MM:SS)
- Color changes: green → yellow → red as time runs out

#### `updateEntryLog()` [Line ~440]
- Adds new entry to #player-entry-log
- Format: "Alice: Dog ✓" or "Bob: Fish ✗"
- Auto-scrolls to latest entry

#### `enableBuzzerButton() / disableBuzzerButton()` [Line ~450-460]
- Enable: button is clickable, shows "BUZZ!"
- Disable: button is grayed out, unclickable

#### `enableAnswerInput() / disableAnswerInput()` [Line ~470-480]
- Enable: input + button clickable
- Disable: input + button grayed out

### Feedback Functions

#### `showBuzzerWin()` [Line ~500]
- Display green screen ring effect
- Play buzzer sound (optional)
- Show checkmark icon
- Message: "You buzzed first!"

#### `showBuzzerLoss()` [Line ~510]
- Display red screen ring effect
- Show X icon
- #too-slow-banner appears: "You weren't fast enough!"

#### `showCorrectFeedback()` [Line ~520]
- Update #answer-status with green checkmark
- Message: "✓ Correct!"
- Highlight entry in log

#### `showWrongFeedback()` [Line ~530]
- Update #answer-status with red X
- Message: "✗ Wrong"
- Highlight entry in log

#### `showTimesUpMessage()` [Line ~540]
- "TIME'S UP!" displayed
- Auto-submit answer (or disable input)

### Helper Functions

#### `addEntryLogItem(text, className)` [Line ~550]
- Append to #player-entry-log
- Add className for styling (e.g., 'highlight' for player's answer)
- Keep max 10 entries (scroll)

#### `showError(message)` [Line ~560]
- Display error in #error-popup
- Auto-dismiss after 3-5 seconds
- Or show as toast notification

#### `getOtherPlayerName()` [Line ~570]
- Find the other player in currentBattlePlayers
- Return their name (from gameState.players)

#### `updateConnectionStatus(status)` [Line ~580]
- Log connection status
- Could update visual indicator if added to HTML

#### `formatTimer(seconds)` [Line ~590]
- Convert seconds to "MM:SS" format
- e.g., 125 → "02:05"

---

## player.css Styling

### Layout Structure
```css
.player-screen (full screen container)
  ├─ .join-container (join form)
  ├─ .waiting-container (spinner)
  └─ .game-container (game screen)
      ├─ .round-info (top)
      ├─ .game-player-name
      ├─ .question-box (center)
      ├─ .buzzer-section (if buzzer phase)
      ├─ .answer-section
      │   ├─ .turn-message
      │   ├─ .answer-input-container
      │   └─ .answer-status
      ├─ .entry-log-section
      └─ .timer-section
```

### Color Scheme
```css
--primary-color: #3498db   /* Blue */
--success-color: #4caf50   /* Green (correct) */
--danger-color: #f44336    /* Red (wrong) */
--bg-dark: #1a1a1a         /* Dark background */
--text-light: #ffffff      /* Light text */
```

### Key Classes

#### Join Screen
- `.join-container` — centered form
- `.join-form` — form styling
- `.join-input-group` — input styling
- `.join-btn` — button styling
- `.room-info` — displays room code

#### Game Screen
- `.round-info` — "Round X/Y" display
- `.game-player-name` — "Playing as: Name"
- `.question-box` — large question display
- `#player-question-text` — question text (large font)

#### Buzzer Section
- `.buzzer-section` — container
- `.buzzer-message` — "Get Ready!" text
- `.buzzer-btn` — large button (100px+ diameter)
- `.buzzer-btn:disabled` — grayed out
- `.buzzer-btn:active` — pressed state

#### Answer Section
- `.answer-section` — container
- `.turn-message` — "Your turn!" or waiting message
- `.answer-input-container` — input + button
- `#player-answer-input` — text input (full width)
- `.submit-btn` — submit button
- `.submit-btn:disabled` — grayed out
- `.answer-status` — result display (hidden initially)
- `#status-icon` — checkmark or X
- `#status-message` — "Correct!" or "Wrong"

#### Entry Log
- `.entry-log-section` — container
- `.entry-log-header` — "Entry Log:"
- `.entry-log-list` — scrollable list
- `.entry-log-item` — individual entry
- `.entry-log-item.correct` — green text
- `.entry-log-item.wrong` — red text
- `.entry-log-item.highlight` — player's own answer (bold)

#### Timer
- `.timer-section` — container
- `#player-timer-display` — large timer display
- `.timer-display.warning` — yellow when < 10s
- `.timer-display.critical` — red when < 5s

#### Feedback Overlays
- `#screen-ring` — ring animation (green or red)
- `.screen-ring.win` — green for buzzer win
- `.screen-ring.loss` — red for buzzer loss
- `#too-slow-banner` — "You weren't fast enough!" message

### Animations

#### Buzzer Press
```css
@keyframes buzzer-press {
  0% { transform: scale(1); }
  50% { transform: scale(0.95); }
  100% { transform: scale(1); }
}
```

#### Screen Ring (Buzzer Winner)
```css
@keyframes ring-expand {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(1.5); opacity: 0; }
}
```

#### Answer Feedback
```css
@keyframes feedback-appear {
  0% { opacity: 0; transform: translateY(-20px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

#### Timer Warning
```css
@keyframes timer-pulse {
  0%, 100% { color: #f44336; }
  50% { color: #ffeb3b; }
}
```

### Responsive Design

#### Mobile (full screen)
- Buzzer button: 80px diameter
- Question text: 24px font
- Input: 100% width
- No horizontal scrolling
- Touch-friendly: 44px+ tap targets

#### Accessibility
- High contrast colors (WCAG AA)
- Large fonts for readability
- Clear button states (active/disabled)
- Audio feedback optional (buzzer sound)

---

## Game Flow Examples

### Face-Off Phase
```
1. Host clicks "Next Battle" (two random players chosen)
2. Server broadcasts partyGame:nextBattle with player IDs
3. Player's screen:
   - If in battle: Buzzer button enabled, "BUZZ!"
   - If not: Button disabled, "Watch others..."
4. Players watch question appear on display
5. Player clicks buzzer button
6. Server determines winner (first press)
7. Winner's screen: Green ring + "You buzzed first!"
8. Loser's screen: Red ring + "Too slow!"
9. Winner gets answer input enabled
```

### Regular Play Phase
```
1. Buzzer winner takes first guess
2. Turn passes to next player (if wrong)
3. Each player gets one chance
4. Player types answer and clicks Submit
5. Server validates with OpenAI
6. All clients see: "Player: Answer ✓/✗"
7. If correct: Points awarded, new turn
8. If wrong: Strike added, next player's turn
9. After 3 strikes: Steal phase
```

### Steal Phase
```
1. 3 strikes accumulated by one team
2. Other team's player gets one guess
3. If correct: Steal all round points
4. If wrong: Original team keeps points
5. Round ends, goes to summary
```

---

## Testing Checklist

- [ ] Can join with name from QR code
- [ ] Room code displays correctly
- [ ] Waiting screen shows while waiting for team
- [ ] Game screen appears after team assignment
- [ ] Buzzer button enabled during buzzer phase
- [ ] Buzzer button disabled when not my turn
- [ ] Buzzer press shows visual feedback (ring)
- [ ] Answer input enabled only on my turn
- [ ] Answer submission validates correctly
- [ ] Entry log updates after each guess
- [ ] Timer syncs with server
- [ ] Round summary displays correctly
- [ ] Reconnect works after network loss
- [ ] Multiple players can buzz independently
