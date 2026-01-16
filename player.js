// Player Interface - Socket.IO Client

// State
let socket = null;
let roomCode = null;
let playerId = null;
let playerName = null;
let currentTurnPlayer = null;
let currentBattlePlayers = [null, null];
let faceOffActive = false;
let isMyTurn = false;
let timerSeconds = 0;
let timerInterval = null;

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const waitingScreen = document.getElementById('waiting-screen');
const gameScreen = document.getElementById('game-screen');

const playerNameInput = document.getElementById('player-name-input');
const joinBtn = document.getElementById('join-btn');
const joinError = document.getElementById('join-error');
const joinRoomCode = document.getElementById('join-room-code');

const displayPlayerName = document.getElementById('display-player-name');

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

    // Setup event listeners
    setupEventListeners();

    // Initialize socket
    initSocket();
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
}

// Initialize Socket.IO
function initSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('Player connected to server');
    });

    socket.on('player:joined', (data) => {
        playerId = data.playerId;
        playerName = data.playerName;
        displayPlayerName.textContent = playerName;

        // Show waiting screen
        joinScreen.style.display = 'none';
        waitingScreen.style.display = 'flex';
    });

    socket.on('player:error', (data) => {
        joinError.textContent = data.message;
        joinBtn.disabled = false;
    });

    socket.on('partyGame:started', (gameState) => {
        // Show game screen
        waitingScreen.style.display = 'none';
        gameScreen.style.display = 'flex';

        // Update round info
        playerCurrentRound.textContent = gameState.currentRound;
        playerTotalRounds.textContent = gameState.totalRounds;
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

        // Update turn state
        updateTurnState();
    });

    socket.on('battle:started', (data) => {
        currentBattlePlayers = [data.team1Player, data.team2Player];
        faceOffActive = data.faceOffActive;

        // Check if I'm in the battle
        const isInBattle = currentBattlePlayers.some(p => p && p.id === playerId);

        if (isInBattle && faceOffActive) {
            isMyTurn = true;
        } else if (!isInBattle) {
            isMyTurn = false;
        }

        updateTurnState();
    });

    socket.on('turn:changed', (data) => {
        currentTurnPlayer = data.currentTurnPlayer;
        faceOffActive = data.faceOffActive;

        // Check if it's my turn
        isMyTurn = currentTurnPlayer === playerId;

        updateTurnState();
    });

    socket.on('player:answerResult', (data) => {
        // Show answer result
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

        // Clear input
        playerAnswerInput.value = '';

        // Hide status after 3 seconds
        setTimeout(() => {
            answerStatus.style.display = 'none';
        }, 3000);
    });

    socket.on('player:notYourTurn', (data) => {
        showError(data.message);
    });

    socket.on('answer:correct', (data) => {
        // Just update UI - the entry log will be updated via entryLog:updated
    });

    socket.on('answer:incorrect', (data) => {
        // Just update UI
    });

    socket.on('entryLog:updated', (data) => {
        renderEntryLog(data.entryLog);
    });

    socket.on('timer:started', (data) => {
        timerSeconds = data.seconds;
        startTimer();
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
        timerSeconds = data.seconds;
        updateTimerDisplay();
    });

    socket.on('timer:timesUp', () => {
        stopTimer();
        showError("Time's up!");
    });

    socket.on('round:reset', () => {
        playerEntryLog.innerHTML = '<div class="entry-log-empty">No entries yet</div>';
        answerStatus.style.display = 'none';
        playerAnswerInput.value = '';
    });

    socket.on('game:reset', () => {
        // Back to waiting screen
        gameScreen.style.display = 'none';
        waitingScreen.style.display = 'flex';
    });

    socket.on('game:ended', (data) => {
        // Show game ended message
        playerQuestionText.textContent = 'Game Over!';
        turnMessage.textContent = `Winner: ${data.team1Score > data.team2Score ? data.team1Name : data.team2Name}`;
        disableInput();
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected from server');
        showError('Connection lost. Please refresh the page.');
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
    const answer = playerAnswerInput.value.trim();

    if (!answer) {
        showError('Please enter an answer');
        return;
    }

    if (!isMyTurn && !faceOffActive) {
        showError("It's not your turn to answer yet!");
        return;
    }

    // Check if in current battle
    const isInBattle = currentBattlePlayers.some(p => p && p.id === playerId);
    if (!isInBattle) {
        showError("You're not in the current battle");
        return;
    }

    socket.emit('player:submitAnswer', {
        playerAnswer: answer
    });
}

// Update turn state UI
function updateTurnState() {
    const isInBattle = currentBattlePlayers.some(p => p && p.id === playerId);

    if (!isInBattle) {
        // Not in current battle
        turnMessage.textContent = "You're up next round!";
        turnMessage.className = 'turn-message waiting';
        disableInput();
    } else if (faceOffActive) {
        // Face-off phase - both players can answer
        turnMessage.textContent = "Face-off! Submit your answer!";
        turnMessage.className = 'turn-message active';
        enableInput();
    } else if (isMyTurn) {
        // My turn
        turnMessage.textContent = "It's your turn!";
        turnMessage.className = 'turn-message active';
        enableInput();
    } else {
        // Not my turn
        turnMessage.textContent = "Waiting for your turn...";
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
