// Player Interface - Socket.IO Client

// State
let socket = null;
let roomCode = null;
let playerId = null;
let playerName = null;
let savedRoomCode = null;  // For reconnection
let savedPlayerName = null;  // For reconnection
let savedPlayerId = null;   // For reconnection (from localStorage)
let reconnectionAttempted = false;  // Prevent infinite reconnect loops
let currentTurnPlayer = null;
let currentTurnPlayerName = null;
let currentBattlePlayers = [null, null];
let faceOffActive = false;
let faceOffPhase = 'buzzer'; // 'buzzer', 'chain', or 'resolved'
let isMyTurn = false;
let timerSeconds = 0;
let timerInterval = null;
let myTeam = null;
let gameInProgress = false;
let buzzerPhase = false;
let buzzerWinner = null;
let buzzerLoser = null;
let waitingForResult = false;
let queuedPlayerResult = null;
let timerDisplayStopped = false;  // Prevents timer:tick from updating display after answer submitted
let pendingEntryLog = null;
let pendingTurnChange = null;
let pendingFaceOffChainNext = null;
let pendingFaceOffWon = null;
let submitDebounceTimeout = null; // Debounce rapid submissions
let partyAnswerTimeoutId = null; // Prevent multiple setTimeout callbacks from partyAnswer:submitted
let stealPhase = false; // Track steal phase to prevent heartbeat from overwriting turn message

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const waitingScreen = document.getElementById('waiting-screen');
const gameScreen = document.getElementById('game-screen');

const playerNameInput = document.getElementById('player-name-input');
const joinBtn = document.getElementById('join-btn');
const joinError = document.getElementById('join-error');
const joinRoomCode = document.getElementById('join-room-code');

const displayPlayerName = document.getElementById('display-player-name');
const gameDisplayPlayerName = document.getElementById('game-display-player-name');
const waitingText = document.getElementById('waiting-text');

const playerCurrentRound = document.getElementById('player-current-round');
const playerTotalRounds = document.getElementById('player-total-rounds');
const playerQuestionText = document.getElementById('player-question-text');

const answerSection = document.getElementById('answer-section');
const answerInputContainer = document.getElementById('answer-input-container');
const turnMessage = document.getElementById('turn-message');
const playerAnswerInput = document.getElementById('player-answer-input');
const submitAnswerBtn = document.getElementById('submit-answer-btn');
const answerStatus = document.getElementById('answer-status');
const statusIcon = document.getElementById('status-icon');
const statusMessage = document.getElementById('status-message');

const playerEntryLog = document.getElementById('player-entry-log');
const playerTimerDisplay = document.getElementById('player-timer-display');

const errorPopup = document.getElementById('error-popup');
const errorText = document.getElementById('error-text');

const buzzerSection = document.getElementById('buzzer-section');
const buzzerBtn = document.getElementById('buzzer-btn');
const buzzerMessage = document.getElementById('buzzer-message');
const screenRing = document.getElementById('screen-ring');
const tooSlowBanner = document.getElementById('too-slow-banner');

// Safe emit - checks connection before sending
function safeEmit(event, data) {
    if (!socket || !socket.connected) {
        showError('Not connected. Please wait for reconnection...');
        return false;
    }
    socket.emit(event, data);
    return true;
}

// Initialize
function init() {
    // Get room code from URL
    const urlParams = new URLSearchParams(window.location.search);
    roomCode = urlParams.get('room');

    if (!roomCode) {
        joinError.textContent = 'No room code provided. Please scan the QR code again.';
        joinBtn.disabled = true;
        return;
    }

    joinRoomCode.textContent = roomCode;

    // Check for saved session in localStorage
    const savedSession = getSavedSession();
    if (savedSession && savedSession.roomCode === roomCode) {
        savedPlayerId = savedSession.playerId;
        savedPlayerName = savedSession.playerName;
        savedRoomCode = savedSession.roomCode;
    }

    // Setup event listeners
    setupEventListeners();

    // Initialize socket
    initSocket();
}

// Save session to sessionStorage (isolated per tab)
function saveSession(playerId, playerName, roomCode) {
    try {
        sessionStorage.setItem('familyFeud_session', JSON.stringify({
            playerId,
            playerName,
            roomCode,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.warn('Could not save session to localStorage:', e);
    }
}

// Get saved session from sessionStorage (isolated per tab)
function getSavedSession() {
    try {
        const data = sessionStorage.getItem('familyFeud_session');
        if (data) {
            const session = JSON.parse(data);
            // Session expires after 4 hours
            if (Date.now() - session.timestamp < 4 * 60 * 60 * 1000) {
                return session;
            }
        }
    } catch (e) {
        console.warn('Could not read session from localStorage:', e);
    }
    return null;
}

// Clear saved session
function clearSession() {
    try {
        sessionStorage.removeItem('familyFeud_session');
    } catch (e) {
        console.warn('Could not clear session from localStorage:', e);
    }
}

// Setup event listeners
function setupEventListeners() {
    joinBtn.addEventListener('click', handleJoin);

    playerNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleJoin();
    });

    submitAnswerBtn.addEventListener('click', handleSubmitAnswer);

    playerAnswerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSubmitAnswer();
    });

    buzzerBtn.addEventListener('click', handleBuzzerClick);
}

// Initialize Socket.IO
function initSocket() {
    socket = io({
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
    });

    socket.on('connect', () => {
        console.log('Player connected to server');
        // Attempt reconnection if we have a saved session
        if (!reconnectionAttempted && savedPlayerId && savedRoomCode) {
            reconnectionAttempted = true;
            console.log('Attempting to reconnect with saved session...');
            socket.emit('player:reconnect', {
                roomCode: savedRoomCode,
                playerId: savedPlayerId,
                playerName: savedPlayerName
            });
        }
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log('Reconnected to server after', attemptNumber, 'attempts');
        // Re-join the room if we have saved credentials
        if (savedRoomCode && savedPlayerId) {
            socket.emit('player:reconnect', {
                roomCode: savedRoomCode,
                playerId: savedPlayerId,
                playerName: savedPlayerName
            });
        } else if (savedRoomCode && savedPlayerName) {
            socket.emit('player:join', { roomCode: savedRoomCode, playerName: savedPlayerName });
        }
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log('Reconnection attempt', attemptNumber);
    });

    socket.on('reconnect_error', (error) => {
        console.log('Reconnection error:', error);
    });

    socket.on('player:joined', (data) => {
        playerId = data.playerId;
        playerName = data.playerName;
        // Save credentials for reconnection
        savedRoomCode = roomCode;
        savedPlayerName = playerName;
        savedPlayerId = playerId;
        // Persist session to localStorage
        saveSession(playerId, playerName, roomCode);

        displayPlayerName.textContent = playerName;
        gameDisplayPlayerName.textContent = playerName;

        // Check if game is already in progress
        const gameState = data.gameState;
        gameInProgress = gameState.screen === 'game' && gameState.partyMode;

        // Check if player is already assigned to a team
        const me = gameState.players.find(p => p.id === playerId);
        myTeam = me ? me.team : null;

        joinScreen.style.display = 'none';

        if (gameInProgress && myTeam) {
            // Game in progress and we're on a team - go straight to game
            waitingScreen.style.display = 'none';
            gameScreen.style.display = 'flex';
            playerCurrentRound.textContent = gameState.currentRound;
            playerTotalRounds.textContent = gameState.totalRounds;
        } else {
            // Show waiting screen
            waitingScreen.style.display = 'flex';
            waitingText.textContent = 'Waiting to be added to a team...';
        }
    });

    // Handle successful reconnection
    socket.on('player:reconnected', (data) => {
        playerId = data.playerId;
        playerName = data.playerName;
        myTeam = data.team;
        savedRoomCode = roomCode;
        savedPlayerName = playerName;
        savedPlayerId = playerId;
        // Update persisted session
        saveSession(playerId, playerName, roomCode);

        displayPlayerName.textContent = playerName;
        gameDisplayPlayerName.textContent = playerName;

        console.log(`Successfully reconnected as ${playerName}`);

        // Check if game is already in progress
        const gameState = data.gameState;
        gameInProgress = gameState.screen === 'game' && gameState.partyMode;

        // Update current turn info from game state
        if (gameState.currentTurnPlayer) {
            currentTurnPlayer = gameState.currentTurnPlayer;
            isMyTurn = currentTurnPlayer === playerId;
        }
        if (gameState.faceOffActive !== undefined) {
            faceOffActive = gameState.faceOffActive;
        }
        if (gameState.faceOffPhase) {
            faceOffPhase = gameState.faceOffPhase;
        }
        if (gameState.currentBattlePlayers) {
            currentBattlePlayers = gameState.currentBattlePlayers;
        }
        if (gameState.currentTurnPlayer && gameState.players) {
            const turnPlayer = gameState.players.find(p => p.id === gameState.currentTurnPlayer);
            if (turnPlayer) {
                currentTurnPlayerName = turnPlayer.name;
            }
        }

        joinScreen.style.display = 'none';

        if (gameInProgress && myTeam) {
            // Game in progress - go straight to game
            waitingScreen.style.display = 'none';
            gameScreen.style.display = 'flex';
            playerCurrentRound.textContent = gameState.currentRound;
            playerTotalRounds.textContent = gameState.totalRounds;
            if (gameState.currentQuestion) {
                playerQuestionText.textContent = gameState.currentQuestion.question;
            }
            // Render entry log from current game state
            if (gameState.entryLog && gameState.entryLog.length > 0) {
                renderEntryLog(gameState.entryLog);
            }
            updateTurnState();
        } else if (myTeam) {
            // Have a team but game not started
            waitingScreen.style.display = 'flex';
            waitingText.textContent = 'Reconnected! Waiting for game to start...';
        } else {
            // No team yet
            waitingScreen.style.display = 'flex';
            waitingText.textContent = 'Reconnected! Waiting to be added to a team...';
        }
    });

    // Handle reconnection failure - fall back to showing join screen
    socket.on('player:reconnectFailed', (data) => {
        console.log('Reconnection failed:', data.message);
        clearSession();
        savedPlayerId = null;
        savedPlayerName = null;
        // Show join screen with message
        joinScreen.style.display = 'flex';
        waitingScreen.style.display = 'none';
        if (data.shouldRejoin) {
            joinError.textContent = 'Session expired. Please join again.';
        }
    });

    // Handle notification that another player reconnected
    socket.on('player:reconnected:broadcast', (data) => {
        console.log(`Player ${data.playerName} reconnected`);
    });

    // Handle notification that another player disconnected
    socket.on('player:disconnected', (data) => {
        console.log(`Player ${data.playerName} disconnected`);
    });

    // Handle turn skipped notification
    socket.on('turn:skipped', (data) => {
        console.log(`${data.skippedPlayerName}'s turn was skipped (${data.reason})`);
    });

    socket.on('player:error', (data) => {
        if (gameScreen.style.display !== 'none') {
            // In-game error (answer submission failed)
            submitAnswerBtn.disabled = false;
            waitingForResult = false;
            if (submitDebounceTimeout) {
                clearTimeout(submitDebounceTimeout);
                submitDebounceTimeout = null;
            }
            showError(data.message);
        } else {
            // Join flow error
            joinError.textContent = data.message;
            joinBtn.disabled = false;
        }
    });

    socket.on('partyGame:started', (gameState) => {
        gameInProgress = true;

        // Check if we're on a team
        const me = gameState.players.find(p => p.id === playerId);
        myTeam = me ? me.team : null;

        if (myTeam) {
            // Show game screen
            waitingScreen.style.display = 'none';
            gameScreen.style.display = 'flex';

            // Update round info
            playerCurrentRound.textContent = gameState.currentRound;
            playerTotalRounds.textContent = gameState.totalRounds;
        } else {
            // Still waiting for team assignment
            waitingText.textContent = 'Waiting to be added to a team...';
        }
    });

    socket.on('teams:updated', (data) => {
        // Check if we got assigned to a team
        const me = data.players.find(p => p.id === playerId);
        const newTeam = me ? me.team : null;

        if (newTeam && !myTeam && gameInProgress) {
            // We just got assigned to a team and game is in progress - join the game
            myTeam = newTeam;
            waitingScreen.style.display = 'none';
            gameScreen.style.display = 'flex';
        } else {
            myTeam = newTeam;
        }
    });

    socket.on('question:loaded', (data) => {
        // Update question
        playerQuestionText.textContent = data.question.question;
        playerCurrentRound.textContent = data.currentRound;
        playerTotalRounds.textContent = data.totalRounds;

        // Clear entry log
        playerEntryLog.innerHTML = '<div class="entry-log-empty">No entries yet</div>';

        // Reset answer status
        answerStatus.style.display = 'none';
        playerAnswerInput.value = '';

        // Only clear buzzer state if NOT in buzzer phase
        if (!buzzerPhase) {
            clearBuzzerState();
        }

        // Update turn state
        updateTurnState();
    });

    socket.on('battle:started', (data) => {
        currentBattlePlayers = [data.team1Player, data.team2Player];
        faceOffActive = data.faceOffActive;
        faceOffPhase = 'buzzer'; // Reset phase for new battle

        // Check if I'm in the battle
        const isInBattle = currentBattlePlayers.some(p => p && p.id === playerId);

        if (isInBattle && faceOffActive) {
            // Hide question during face-off buzzer phase (host reads it aloud)
            document.querySelector('.question-box').style.display = 'none';
            // Show buzzer for face-off
            buzzerPhase = true;
            buzzerWinner = null;
            buzzerLoser = null;
            showBuzzerPhase();
        } else if (!isInBattle) {
            isMyTurn = false;
            buzzerPhase = false;
            updateTurnState();
        }
    });

    socket.on('turn:changed', (data) => {
        // In party mode, queue turn change if waiting for result animation
        if (waitingForResult) {
            pendingTurnChange = data;
            return;
        }
        applyTurnChange(data);
    });

    socket.on('player:answerResult', (data) => {
        // If waiting for result, queue it instead of showing immediately
        if (waitingForResult) {
            queuedPlayerResult = data;
            return;
        }
        showPlayerResult(data);
    });

    // Server is busy processing another answer
    socket.on('player:answerBusy', (data) => {
        // Re-enable input since submission was rejected
        submitAnswerBtn.disabled = false;
        showError(data.message || 'Server busy, try again');
        waitingForResult = false;
        if (submitDebounceTimeout) {
            clearTimeout(submitDebounceTimeout);
            submitDebounceTimeout = null;
        }
    });

    socket.on('partyAnswer:submitted', (data) => {
        // Stop timer immediately when any player submits
        stopTimer();
        timerDisplayStopped = true;  // Prevent timer:tick from overwriting
        playerTimerDisplay.textContent = '--:--';
        playerTimerDisplay.classList.remove('warning', 'danger');

        // When server broadcasts that answer was submitted, start 4-second delay
        // to sync with the "Survey Says" popup on the main display
        // Guard against multiple timeouts from repeated broadcasts
        if (waitingForResult && !partyAnswerTimeoutId) {
            partyAnswerTimeoutId = setTimeout(() => {
                partyAnswerTimeoutId = null;
                processQueuedPlayerResult();
            }, 4000);
        }
    });

    socket.on('player:notYourTurn', (data) => {
        submitAnswerBtn.disabled = false;
        showError(data.message);
        waitingForResult = false;
        if (submitDebounceTimeout) {
            clearTimeout(submitDebounceTimeout);
            submitDebounceTimeout = null;
        }
    });

    socket.on('answer:correct', (data) => {
        // Just update UI - the entry log will be updated via entryLog:updated
    });

    socket.on('answer:incorrect', (data) => {
        // Just update UI
    });

    socket.on('answer:duplicate', (data) => {
        // Show "Try Again" message using answer status popup
        answerStatus.style.display = 'flex';
        statusIcon.textContent = '↻';
        statusIcon.className = 'status-icon duplicate';
        statusMessage.textContent = 'Already revealed - Try Again!';

        // Clear input for retry
        playerAnswerInput.value = '';

        // Hide status after 2 seconds (shorter than correct/incorrect)
        setTimeout(() => {
            answerStatus.style.display = 'none';
        }, 2000);
    });

    socket.on('buzzer:result', (data) => {
        buzzerPhase = false;
        buzzerWinner = data.winner;
        buzzerLoser = data.loser;

        if (data.winner === playerId) {
            // I won the buzzer!
            showBuzzerWin();
        } else if (data.loser === playerId) {
            // I lost the buzzer
            showBuzzerLose();
        }
    });

    socket.on('faceOff:secondChance', (data) => {
        if (data.playerId === playerId) {
            // I get a second chance!
            showSecondChance();
        }
    });

    socket.on('faceOff:chainNext', (data) => {
        if (waitingForResult) {
            pendingFaceOffChainNext = data;
            return;
        }
        applyFaceOffChainNext(data);
    });

    socket.on('faceOff:won', (data) => {
        if (waitingForResult) {
            pendingFaceOffWon = data;
            return;
        }
        applyFaceOffWon(data);
    });

    // Steal phase handlers
    socket.on('steal:phase', (data) => {
        stealPhase = true; // Set flag to prevent heartbeat from overwriting message
        if (data.stealPlayerId === playerId) {
            isMyTurn = true;
            turnMessage.textContent = `STEAL! One chance to win ${data.roundPoints} points!`;
            turnMessage.className = 'turn-message steal';
            enableInput();
            playerAnswerInput.focus();
        } else if (myTeam === data.stealingTeam) {
            turnMessage.textContent = `${data.stealPlayerName} trying to steal!`;
            turnMessage.className = 'turn-message waiting';
            disableInput();
        } else {
            turnMessage.textContent = `Other team gets one steal attempt!`;
            turnMessage.className = 'turn-message waiting';
            disableInput();
        }
    });

    socket.on('steal:success', (data) => {
        stealPhase = false; // Clear steal phase flag
        if (myTeam === data.stealingTeam) {
            turnMessage.textContent = `STOLEN! ${data.roundPoints} points!`;
        } else {
            turnMessage.textContent = `They stole the points!`;
        }
        turnMessage.className = 'turn-message';
        disableInput();
    });

    socket.on('steal:failed', (data) => {
        stealPhase = false; // Clear steal phase flag
        if (myTeam === data.controllingTeam) {
            turnMessage.textContent = `Steal failed! You keep ${data.roundPoints} points!`;
        } else {
            turnMessage.textContent = `Steal failed!`;
        }
        turnMessage.className = 'turn-message';
        disableInput();
    });

    socket.on('board:cleared', (data) => {
        stealPhase = false; // Clear steal phase flag
        if (myTeam === data.winningTeam) {
            turnMessage.textContent = `Your team cleared the board!`;
        } else {
            turnMessage.textContent = `${data.winningTeamName} cleared the board!`;
        }
        turnMessage.className = 'turn-message';
        disableInput();
    });

    socket.on('entryLog:updated', (data) => {
        // In party mode, queue entry log if waiting for result animation
        if (waitingForResult) {
            pendingEntryLog = data.entryLog;
            return;
        }
        renderEntryLog(data.entryLog);
    });

    socket.on('timer:started', (data) => {
        if (!gameInProgress) return;
        timerDisplayStopped = false;  // Allow timer updates again
        timerSeconds = data.seconds;
        updateTimerDisplay();  // Just display, no independent countdown - timer:tick handles updates
    });

    socket.on('timer:paused', () => {
        stopTimer();
    });

    socket.on('timer:reset', (data) => {
        timerSeconds = data.seconds;
        stopTimer();
        updateTimerDisplay();
    });

    socket.on('timer:tick', (data) => {
        if (!gameInProgress) return;
        if (timerDisplayStopped) return;  // Don't update if timer is stopped
        timerSeconds = data.seconds;
        updateTimerDisplay();
    });

    socket.on('timer:timesUp', () => {
        stopTimer();
        // Only show popup if timer wasn't stopped by an answer submission
        if (!timerDisplayStopped) {
            showError("Time's up!");
        }
    });

    socket.on('timer:stopped', () => {
        timerSeconds = 0;
        playerTimerDisplay.textContent = '--:--';
        playerTimerDisplay.classList.remove('warning', 'danger');
    });

    // State heartbeat - silently sync critical state
    socket.on('state:heartbeat', (data) => {
        // Sync stealPhase from server
        if (data.stealPhase !== undefined) {
            stealPhase = data.stealPhase;
        }

        // Skip turn state updates during steal phase to preserve steal message
        if (stealPhase) {
            // Still sync player connection status
            if (data.players) {
                const me = data.players.find(p => p.id === playerId);
                if (me && me.disconnected) {
                    console.log('Server marked us as disconnected, attempting reconnect...');
                    if (savedPlayerId && savedRoomCode) {
                        socket.emit('player:reconnect', {
                            roomCode: savedRoomCode,
                            playerId: savedPlayerId,
                            playerName: savedPlayerName
                        });
                    }
                }
            }
            return;
        }

        let stateChanged = false;
        // Quietly update turn state if different
        if (data.currentTurnPlayer !== undefined && data.currentTurnPlayer !== currentTurnPlayer) {
            currentTurnPlayer = data.currentTurnPlayer;
            isMyTurn = currentTurnPlayer === playerId;
            stateChanged = true;
        }
        if (data.faceOffActive !== undefined) {
            faceOffActive = data.faceOffActive;
        }
        if (data.faceOffPhase !== undefined && data.faceOffPhase !== faceOffPhase) {
            faceOffPhase = data.faceOffPhase;
            stateChanged = true;
        }
        // Sync player connection status (helps detect if we've been marked disconnected)
        if (data.players) {
            const me = data.players.find(p => p.id === playerId);
            if (me && me.disconnected) {
                // We're marked as disconnected on the server - attempt to reconnect
                console.log('Server marked us as disconnected, attempting reconnect...');
                if (savedPlayerId && savedRoomCode) {
                    socket.emit('player:reconnect', {
                        roomCode: savedRoomCode,
                        playerId: savedPlayerId,
                        playerName: savedPlayerName
                    });
                }
            }
        }
        if (stateChanged) {
            updateTurnState();
        }
    });

    socket.on('round:reset', () => {
        playerEntryLog.innerHTML = '<div class="entry-log-empty">No entries yet</div>';
        answerStatus.style.display = 'none';
        playerAnswerInput.value = '';
        stealPhase = false; // Clear steal phase flag
        clearBuzzerState();
    });

    socket.on('round:summary', (data) => {
        // Stop timer and clear buzzer UI when round ends
        stopTimer();
        clearBuzzerState();
    });

    socket.on('game:reset', () => {
        // Back to waiting screen
        gameInProgress = false;
        stopTimer();
        gameScreen.style.display = 'none';
        waitingScreen.style.display = 'flex';
    });

    socket.on('game:ended', (data) => {
        // Stop timer when game ends
        gameInProgress = false;
        stopTimer();
        // Show game ended message
        playerQuestionText.textContent = 'Game Over!';
        turnMessage.textContent = `Winner: ${data.team1Score > data.team2Score ? data.team1Name : data.team2Name}`;
        disableInput();
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected from server');
        showError('Connection lost. Attempting to reconnect...');
    });
}

// Handle join
function handleJoin() {
    const name = playerNameInput.value.trim();

    if (!name) {
        joinError.textContent = 'Please enter your name';
        return;
    }

    joinError.textContent = '';
    joinBtn.disabled = true;

    socket.emit('player:join', {
        roomCode: roomCode,
        playerName: name
    });
}

// Handle submit answer
function handleSubmitAnswer() {
    // Prevent rapid submissions
    if (submitDebounceTimeout) return;

    const answer = playerAnswerInput.value.trim();

    if (!answer) {
        showError('Please enter an answer');
        return;
    }

    // Only check battle membership during face-off phase
    // After face-off resolved, just check if it's my turn
    if (!isMyTurn) {
        showError("It's not your turn to answer yet!");
        return;
    }

    // Disable button immediately
    submitAnswerBtn.disabled = true;

    if (!safeEmit('player:submitAnswer', { playerAnswer: answer })) {
        submitAnswerBtn.disabled = false;
        return; // Don't proceed if not connected
    }

    // Debounce: prevent another submit for 2 seconds minimum
    submitDebounceTimeout = setTimeout(() => {
        submitDebounceTimeout = null;
    }, 2000);

    // Show waiting state while "Survey Says" popup displays on main screen
    waitingForResult = true;
    answerStatus.style.display = 'flex';
    statusIcon.textContent = '⏳';
    statusIcon.className = 'status-icon waiting';
    statusMessage.textContent = 'Waiting for results...';
}

// Update turn state UI
function updateTurnState() {
    // After face-off is resolved, ignore currentBattlePlayers - use team membership
    if (faceOffPhase === 'resolved') {
        if (isMyTurn) {
            turnMessage.textContent = "It's your turn!";
            turnMessage.className = 'turn-message active';
            enableInput();
            screenRing.className = 'screen-ring winner';
        } else {
            const waitingText = currentTurnPlayerName
                ? `Waiting for ${currentTurnPlayerName}'s turn...`
                : "Waiting for your turn...";
            turnMessage.textContent = waitingText;
            turnMessage.className = 'turn-message waiting';
            disableInput();
            screenRing.className = 'screen-ring';
        }
        return;
    }

    // During face-off (buzzer/chain phase) - use battle players check
    const isInBattle = currentBattlePlayers.some(p => p && p.id === playerId);

    if (!isInBattle && !isMyTurn) {
        // Not in current battle and not my turn
        turnMessage.textContent = "Waiting for face-off...";
        turnMessage.className = 'turn-message waiting';
        disableInput();
        screenRing.className = 'screen-ring';
    } else if (isMyTurn) {
        // Server says it's my turn - trust this over battle state
        turnMessage.textContent = "It's your turn!";
        turnMessage.className = 'turn-message active';
        enableInput();
        screenRing.className = 'screen-ring winner';
    } else if (faceOffActive) {
        // Face-off phase - both players can answer
        turnMessage.textContent = "Face-off! Submit your answer!";
        turnMessage.className = 'turn-message active';
        enableInput();
        screenRing.className = 'screen-ring winner';
    } else {
        // Not my turn - show who is playing
        const waitingText = currentTurnPlayerName
            ? `Waiting for ${currentTurnPlayerName}'s turn...`
            : "Waiting for your turn...";
        turnMessage.textContent = waitingText;
        turnMessage.className = 'turn-message waiting';
        disableInput();
        screenRing.className = 'screen-ring';
    }
}

// Apply turn change data and update UI
function applyTurnChange(data) {
    currentTurnPlayer = data.currentTurnPlayer;
    currentTurnPlayerName = data.currentTurnPlayerName || data.playerName || null;
    faceOffActive = data.faceOffActive;

    if (data.faceOffPhase !== undefined) {
        faceOffPhase = data.faceOffPhase;
    }

    isMyTurn = currentTurnPlayer === playerId;
    updateTurnState();
}

// Apply face-off chain next data and update UI
function applyFaceOffChainNext(data) {
    faceOffPhase = 'chain';  // Ensure phase is synced when joining chain
    if (data.nextPlayerId === playerId) {
        isMyTurn = true;
        screenRing.className = 'screen-ring winner';
        tooSlowBanner.style.display = 'none';
        turnMessage.textContent = "Your turn to answer!";
        turnMessage.className = 'turn-message active';
        enableInput();
        playerAnswerInput.focus();
    } else {
        isMyTurn = false;
        turnMessage.textContent = `${data.nextPlayerName}'s turn...`;
        turnMessage.className = 'turn-message waiting';
        disableInput();
    }
}

// Apply face-off won data and update UI
function applyFaceOffWon(data) {
    faceOffPhase = 'resolved';
    if (data.nextPlayerId === playerId) {
        isMyTurn = true;
        screenRing.className = 'screen-ring winner';
        tooSlowBanner.style.display = 'none';
        turnMessage.textContent = "Your team won! It's your turn!";
        turnMessage.className = 'turn-message active';
        enableInput();
        playerAnswerInput.focus();
    } else if (data.winningPlayerId === playerId) {
        turnMessage.textContent = "Nice! Your team is up!";
        turnMessage.className = 'turn-message active';
        isMyTurn = false;
        disableInput();
    } else {
        isMyTurn = false;
        currentTurnPlayerName = data.nextPlayerName;
        turnMessage.textContent = `Waiting for ${data.nextPlayerName}'s turn...`;
        turnMessage.className = 'turn-message waiting';
        disableInput();
    }
}

// Enable input
function enableInput() {
    playerAnswerInput.disabled = false;
    submitAnswerBtn.disabled = false;
    answerInputContainer.classList.add('active');
    answerInputContainer.classList.remove('disabled');
    playerAnswerInput.focus();
}

// Disable input
function disableInput() {
    playerAnswerInput.disabled = true;
    submitAnswerBtn.disabled = true;
    answerInputContainer.classList.remove('active');
    answerInputContainer.classList.add('disabled');
}

// Handle buzzer click
function handleBuzzerClick() {
    if (!buzzerPhase) return;

    buzzerBtn.disabled = true;
    buzzerMessage.textContent = 'Waiting...';
    if (!safeEmit('player:buzz', {})) {
        buzzerBtn.disabled = false;
        buzzerMessage.textContent = 'Buzz to answer first!';
    }
}

// Show buzzer phase (hide answer input, show buzzer)
function showBuzzerPhase() {
    answerSection.style.display = 'none';
    buzzerSection.style.display = 'flex';
    buzzerMessage.textContent = 'Buzz to answer first!';
    screenRing.className = 'screen-ring';
    tooSlowBanner.style.display = 'none';

    // Enable buzzer after short delay
    buzzerBtn.disabled = true;
    setTimeout(() => {
        if (buzzerPhase) {
            buzzerBtn.disabled = false;
        }
    }, 500);
}

// Show buzzer win (green ring, transition to answer input)
function showBuzzerWin() {
    buzzerSection.style.display = 'none';
    answerSection.style.display = 'block';
    screenRing.className = 'screen-ring winner';
    tooSlowBanner.style.display = 'none';

    // Clear the green ring after 6 seconds
    setTimeout(() => {
        screenRing.className = 'screen-ring';
    }, 6000);

    isMyTurn = true;
    faceOffActive = false;
    // Show question again after face-off buzzer resolves
    document.querySelector('.question-box').style.display = 'block';
    turnMessage.textContent = "You buzzed first! Submit your answer!";
    turnMessage.className = 'turn-message active';
    enableInput();
}

// Show buzzer lose (red ring, too slow banner)
function showBuzzerLose() {
    buzzerSection.style.display = 'none';
    answerSection.style.display = 'block';
    screenRing.className = 'screen-ring loser';
    tooSlowBanner.style.display = 'block';
    // Show question again after face-off buzzer resolves
    document.querySelector('.question-box').style.display = 'block';

    // Clear the red ring and banner after 6 seconds
    setTimeout(() => {
        screenRing.className = 'screen-ring';
        tooSlowBanner.style.display = 'none';
    }, 6000);

    isMyTurn = false;
    turnMessage.textContent = "Waiting for opponent's answer...";
    turnMessage.className = 'turn-message waiting';
    disableInput();
}

// Show second chance (loser gets to answer after winner fails)
function showSecondChance() {
    screenRing.className = 'screen-ring winner';
    tooSlowBanner.style.display = 'none';
    // Show question again after face-off buzzer resolves
    document.querySelector('.question-box').style.display = 'block';

    isMyTurn = true;
    faceOffActive = false;
    turnMessage.textContent = "Your turn! They got it wrong!";
    turnMessage.className = 'turn-message active';
    enableInput();
    playerAnswerInput.focus();
}

// Clear buzzer state (reset UI)
function clearBuzzerState() {
    buzzerPhase = false;
    buzzerWinner = null;
    buzzerLoser = null;
    buzzerSection.style.display = 'none';
    screenRing.className = 'screen-ring';
    tooSlowBanner.style.display = 'none';
    answerSection.style.display = 'block';
}

// Render entry log
function renderEntryLog(entries) {
    if (!entries || entries.length === 0) {
        playerEntryLog.innerHTML = '<div class="entry-log-empty">No entries yet</div>';
        return;
    }

    playerEntryLog.innerHTML = entries.map(item => `
        <div class="entry-log-item ${item.isCorrect ? 'correct' : 'incorrect'}">
            <span class="entry-icon">${item.isCorrect ? '✓' : '✗'}</span>
            <span class="entry-text">${escapeHtml(item.entry)}</span>
            ${item.playerName ? `<span class="entry-player">(${escapeHtml(item.playerName)})</span>` : ''}
        </div>
    `).join('');

    playerEntryLog.scrollTop = playerEntryLog.scrollHeight;
}

// Timer functions
function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
        if (timerSeconds > 0) {
            timerSeconds--;
            updateTimerDisplay();
        } else {
            stopTimer();
        }
    }, 1000);
    updateTimerDisplay();
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    playerTimerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    playerTimerDisplay.classList.remove('warning', 'danger');
    if (timerSeconds <= 5) {
        playerTimerDisplay.classList.add('danger');
    } else if (timerSeconds <= 10) {
        playerTimerDisplay.classList.add('warning');
    }
}

// Helper to process any pending events (turn changes, face-off events, entry log)
function processPendingEvents() {
    if (pendingTurnChange !== null) {
        applyTurnChange(pendingTurnChange);
        pendingTurnChange = null;
    }
    if (pendingFaceOffChainNext !== null) {
        applyFaceOffChainNext(pendingFaceOffChainNext);
        pendingFaceOffChainNext = null;
    }
    if (pendingFaceOffWon !== null) {
        applyFaceOffWon(pendingFaceOffWon);
        pendingFaceOffWon = null;
    }
    if (pendingEntryLog !== null) {
        renderEntryLog(pendingEntryLog);
        pendingEntryLog = null;
    }
}

// Process queued player result after delay
function processQueuedPlayerResult() {
    waitingForResult = false;
    partyAnswerTimeoutId = null;  // Clear timeout ID
    // Clear debounce since we're done processing
    if (submitDebounceTimeout) {
        clearTimeout(submitDebounceTimeout);
        submitDebounceTimeout = null;
    }
    if (!queuedPlayerResult) {
        answerStatus.style.display = 'none';
        // Still process any pending turn/state changes even if no result queued
        processPendingEvents();
        return;
    }
    const data = queuedPlayerResult;
    queuedPlayerResult = null;
    showPlayerResult(data);
}

// Show player result (correct/incorrect)
function showPlayerResult(data) {
    answerStatus.style.display = 'flex';
    if (data.match) {
        statusIcon.textContent = '✓';
        statusIcon.className = 'status-icon correct';
        statusMessage.textContent = `Correct! "${data.matchedAnswer}"`;
    } else {
        statusIcon.textContent = '✗';
        statusIcon.className = 'status-icon incorrect';
        statusMessage.textContent = data.reason || 'No match found';
    }
    playerAnswerInput.value = '';
    setTimeout(() => {
        answerStatus.style.display = 'none';
        // Process any pending events after animation completes
        processPendingEvents();
    }, 3000);
}

// Show error popup
function showError(message) {
    errorText.textContent = message;
    errorPopup.style.display = 'flex';

    setTimeout(() => {
        errorPopup.style.display = 'none';
    }, 3000);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on page load
init();
