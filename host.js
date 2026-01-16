// Host Control Panel - Socket.IO Client

// Socket connection
let socket = null;
let roomCode = null;
let gameData = [];
let currentQuestion = null;
let revealedAnswers = [];
let timerInterval = null;
let timerSeconds = 30;
let timerRunning = false;
let roundPointsEarned = 0;
let usedQuestionIndices = [];
let correctGuessesThisRound = []; // Track correct guesses for round summary

// Party mode state
let isPartyMode = false;
let partyPlayers = [];
let currentBattlePlayers = [null, null];
let currentTurnPlayer = null;
let faceOffActive = false;

// DOM Elements
const connectionBar = document.getElementById('connection-bar');
const connectionIndicator = document.getElementById('connection-indicator');
const connectionText = document.getElementById('connection-text');

// Login Elements
const hostLoginScreen = document.getElementById('host-login-screen');
const roomCodeInput = document.getElementById('room-code-input');
const hostPasswordInput = document.getElementById('host-password-input');
const hostLoginBtn = document.getElementById('host-login-btn');
const hostLoginError = document.getElementById('host-login-error');

// Take Over Modal
const takeOverModal = document.getElementById('take-over-modal');
const takeOverBtn = document.getElementById('take-over-btn');
const cancelTakeOverBtn = document.getElementById('cancel-take-over-btn');

// Control Screen
const hostControlScreen = document.getElementById('host-control-screen');

// Tab Elements
const navTabs = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab-content');

// Game Info Elements
const hostTeam1Name = document.getElementById('host-team1-name');
const hostTeam2Name = document.getElementById('host-team2-name');
const hostTeam1Score = document.getElementById('host-team1-score');
const hostTeam2Score = document.getElementById('host-team2-score');
const hostCurrentRound = document.getElementById('host-current-round');
const hostTotalRounds = document.getElementById('host-total-rounds');
const hostStrikes = [
    document.getElementById('host-strike-1'),
    document.getElementById('host-strike-2'),
    document.getElementById('host-strike-3')
];

// Question and Answer Elements
const hostQuestionText = document.getElementById('host-question-text');
const answerItems = document.querySelectorAll('.answer-item');
const revealBtns = document.querySelectorAll('.reveal-btn');

// Control Buttons
const hostNewQuestionBtn = document.getElementById('host-new-question-btn');
const hostRevealNextBtn = document.getElementById('host-reveal-next-btn');
const hostAddStrikeBtn = document.getElementById('host-add-strike-btn');
const hostRemoveStrikeBtn = document.getElementById('host-remove-strike-btn');
const hostPointsInput = document.getElementById('host-points-input');
const hostRoundPoints = document.getElementById('host-round-points');
const hostAwardTeam1Btn = document.getElementById('host-award-team1-btn');
const hostAwardTeam2Btn = document.getElementById('host-award-team2-btn');
const hostNextRoundBtn = document.getElementById('host-next-round-btn');
const hostResetRoundBtn = document.getElementById('host-reset-round-btn');
const hostEndGameBtn = document.getElementById('host-end-game-btn');

// Answer Check Elements
const hostAnswerInput = document.getElementById('host-answer-input');
const hostCheckAnswerBtn = document.getElementById('host-check-answer-btn');
const hostAnswerResult = document.getElementById('host-answer-result');
const hostAnswerChecking = document.getElementById('host-answer-checking');
const resultHeader = document.getElementById('result-header');
const resultMatch = document.getElementById('result-match');
const resultMatchedAnswer = document.getElementById('result-matched-answer');
const resultConfidence = document.getElementById('result-confidence');
const resultReason = document.getElementById('result-reason');

// Timer Elements
const hostTimerDisplay = document.getElementById('host-timer-display');
const hostTimerInput = document.getElementById('host-timer-input');
const presetBtns = document.querySelectorAll('.preset-btn');
const hostTimerStartBtn = document.getElementById('host-timer-start-btn');
const hostTimerPauseBtn = document.getElementById('host-timer-pause-btn');
const hostTimerResetBtn = document.getElementById('host-timer-reset-btn');

// Log Elements
const hostLogList = document.getElementById('host-log-list');
const hostClearLogBtn = document.getElementById('host-clear-log-btn');

// Setup Elements
const hostSetupControls = document.getElementById('host-setup-controls');
const hostTeam1Input = document.getElementById('host-team1-input');
const hostTeam2Input = document.getElementById('host-team2-input');
const roundSelectBtns = document.querySelectorAll('.round-select-btn');
const hostCustomRounds = document.getElementById('host-custom-rounds');
const hostStartGameBtn = document.getElementById('host-start-game-btn');
const hostSetupHelpBtn = document.getElementById('host-setup-help-btn');

// Navigation Elements
const hostNavSetupBtn = document.getElementById('host-nav-setup-btn');
const hostNavGameBtn = document.getElementById('host-nav-game-btn');
const hostResetGameBtn = document.getElementById('host-reset-game-btn');

// Disconnected Overlay
const disconnectedOverlay = document.getElementById('disconnected-overlay');
const disconnectReason = document.getElementById('disconnect-reason');
const reconnectBtn = document.getElementById('reconnect-btn');

// Party Mode Elements
const partyTab = document.querySelector('.party-tab');
const hostBattlePlayer1 = document.getElementById('host-battle-player1');
const hostBattlePlayer2 = document.getElementById('host-battle-player2');
const hostCurrentTurnPlayer = document.getElementById('host-current-turn-player');
const hostGiveTurnPlayer1Btn = document.getElementById('host-give-turn-player1-btn');
const hostGiveTurnPlayer2Btn = document.getElementById('host-give-turn-player2-btn');
const hostTurnPlayer1Name = document.getElementById('host-turn-player1-name');
const hostTurnPlayer2Name = document.getElementById('host-turn-player2-name');
const hostNextBattleBtn = document.getElementById('host-next-battle-btn');

// Initialize
async function init() {
    // Load questions from CSV
    await loadQuestionsFromCSV();
    
    // Check for room code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoomCode = urlParams.get('room');
    if (urlRoomCode) {
        roomCodeInput.value = urlRoomCode.toUpperCase();
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize socket connection
    initSocket();
}

// Load questions from CSV file
async function loadQuestionsFromCSV() {
    try {
        const response = await fetch('questions1.csv');
        const csvText = await response.text();
        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        
        const dataLines = lines.slice(1);
        
        gameData = dataLines.map(line => {
            const values = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const nextChar = line[i + 1];
                
                if (char === '"') {
                    if (nextChar === '"' && inQuotes) {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current.trim());
            
            const question = values[0];
            const answers = [];
            
            for (let i = 1; i < values.length; i += 2) {
                if (values[i] && values[i + 1] !== undefined) {
                    const answerText = values[i].trim();
                    const answerPoints = parseInt(values[i + 1].trim());
                    
                    if (answerText && !isNaN(answerPoints)) {
                        answers.push({
                            text: answerText,
                            points: answerPoints
                        });
                    }
                }
            }
            
            answers.sort((a, b) => b.points - a.points);
            
            return {
                question: question,
                answers: answers
            };
        }).filter(item => item.question && item.answers.length > 0);
        
        console.log(`Loaded ${gameData.length} questions from CSV`);
    } catch (error) {
        console.error('Error loading questions from CSV:', error);
    }
}

// Initialize Socket.IO connection
function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        updateConnectionStatus('connecting', 'Connected to server');
    });
    
    socket.on('disconnect', () => {
        updateConnectionStatus('disconnected', 'Disconnected from server');
        showDisconnectedOverlay('Connection lost. Please reconnect.');
    });
    
    socket.on('host:authResult', (data) => {
        if (data.success) {
            roomCode = roomCodeInput.value.toUpperCase();
            updateConnectionStatus('connected', `Connected to room ${roomCode}`);
            hostLoginScreen.style.display = 'none';
            hostControlScreen.style.display = 'block';
            
            // Apply game state if provided
            if (data.gameState) {
                applyGameState(data.gameState);
            }
        } else {
            if (data.canTakeOver) {
                takeOverModal.style.display = 'flex';
            } else {
                hostLoginError.textContent = data.error;
            }
            hostLoginBtn.disabled = false;
        }
    });
    
    socket.on('host:disconnected', (data) => {
        showDisconnectedOverlay(data.reason || 'You have been disconnected.');
    });
    
    socket.on('gameState:full', (gameState) => {
        applyGameState(gameState);
    });
    
    socket.on('game:started', (gameState) => {
        applyGameState(gameState);
        showGameControls();
    });
    
    socket.on('question:loaded', (data) => {
        // Update question display
        hostQuestionText.textContent = data.question.question;
        currentQuestion = data.question;
        revealedAnswers = [];
        roundPointsEarned = 0;
        correctGuessesThisRound = [];
        
        // Update round display
        hostCurrentRound.textContent = data.currentRound;
        hostTotalRounds.textContent = data.totalRounds;
        
        // Update answer preview
        updateAnswerPreview();
        
        // Reset strikes display
        updateStrikesDisplay(0);
        
        // Reset points
        hostPointsInput.value = 0;
        hostRoundPoints.textContent = '(Round: 0)';
    });
    
    socket.on('answer:revealed', (data) => {
        if (!revealedAnswers.includes(data.index)) {
            revealedAnswers.push(data.index);
        }
        updateAnswerPreview();
    });
    
    socket.on('answer:result', (data) => {
        hostAnswerChecking.style.display = 'none';
        hostAnswerResult.style.display = 'block';
        hostCheckAnswerBtn.disabled = false;
        
        resultMatch.textContent = data.match ? 'Yes ✓' : 'No ✗';
        resultMatchedAnswer.textContent = data.matchedAnswer || '-';
        resultConfidence.textContent = data.confidence || '-';
        resultReason.textContent = data.reason || '-';
        
        if (data.match) {
            resultHeader.textContent = '✓ CORRECT!';
            resultHeader.className = 'result-header correct';
        } else {
            resultHeader.textContent = '✗ INCORRECT';
            resultHeader.className = 'result-header incorrect';
        }
        
        hostAnswerInput.value = '';
    });
    
    socket.on('answer:correct', (data) => {
        if (!revealedAnswers.includes(data.index)) {
            revealedAnswers.push(data.index);
        }
        roundPointsEarned = data.roundPointsEarned;
        hostPointsInput.value = roundPointsEarned;
        hostRoundPoints.textContent = `(Round: ${roundPointsEarned})`;
        
        // Track correct guess for round summary
        if (data.answerText) {
            correctGuessesThisRound.push({
                answer: data.answerText,
                points: data.points
            });
        }
        
        updateAnswerPreview();
    });
    
    socket.on('answer:incorrect', (data) => {
        updateStrikesDisplay(data.strikes);
    });
    
    socket.on('answer:error', (data) => {
        hostAnswerChecking.style.display = 'none';
        hostAnswerResult.style.display = 'block';
        resultHeader.textContent = 'Error';
        resultHeader.className = 'result-header incorrect';
        resultReason.textContent = data.error;
        hostCheckAnswerBtn.disabled = false;
    });
    
    socket.on('strike:updated', (data) => {
        updateStrikesDisplay(data.strikes);
    });
    
    socket.on('points:updated', (data) => {
        hostTeam1Score.textContent = data.team1Score;
        hostTeam2Score.textContent = data.team2Score;
    });
    
    socket.on('timer:started', (data) => {
        timerSeconds = data.seconds;
        timerRunning = true;
        startLocalTimer();
    });
    
    socket.on('timer:paused', () => {
        timerRunning = false;
        stopLocalTimer();
    });
    
    socket.on('timer:reset', (data) => {
        timerSeconds = data.seconds;
        timerRunning = false;
        stopLocalTimer();
        updateTimerDisplay();
    });
    
    socket.on('timer:tick', (data) => {
        timerSeconds = data.seconds;
        updateTimerDisplay();
    });
    
    socket.on('entryLog:updated', (data) => {
        renderEntryLog(data.entryLog);
    });
    
    socket.on('entryLog:cleared', () => {
        renderEntryLog([]);
    });
    
    socket.on('round:reset', () => {
        revealedAnswers = [];
        roundPointsEarned = 0;
        hostPointsInput.value = 0;
        hostRoundPoints.textContent = '(Round: 0)';
        updateStrikesDisplay(0);
        updateAnswerPreview();
        renderEntryLog([]);
    });
    
    socket.on('game:reset', (gameState) => {
        applyGameState(gameState);
        showSetupControls();
    });
    
    socket.on('game:ended', (data) => {
        const winner = data.team1Score > data.team2Score ? data.team1Name :
                       data.team2Score > data.team1Score ? data.team2Name : 'TIE';
        alert(`Game Over!\n\nWinner: ${winner}\n\n${data.team1Name}: ${data.team1Score}\n${data.team2Name}: ${data.team2Score}`);
    });
    
    socket.on('round:summary', (data) => {
        // Update scores on host
        hostTeam1Score.textContent = data.team1Score;
        hostTeam2Score.textContent = data.team2Score;
        
        // Show round summary message
        const summaryMsg = `Round ${data.roundNumber} Complete!\n\n` +
            `${data.winningTeamName} earned ${data.pointsAwarded} points!\n\n` +
            `Correct Guesses: ${data.correctGuesses.length} / ${data.totalAnswers}\n` +
            `Strikes: ${data.strikes}\n\n` +
            `Current Scores:\n${data.team1Name}: ${data.team1Score}\n${data.team2Name}: ${data.team2Score}`;
        
        // Show continue button or prompt
        setTimeout(() => {
            if (data.currentRound >= data.totalRounds) {
                if (confirm(summaryMsg + '\n\nThis was the final round! View final results?')) {
                    socket.emit('continueFromSummary');
                }
            } else {
                if (confirm(summaryMsg + '\n\nContinue to next round?')) {
                    socket.emit('continueFromSummary');
                }
            }
        }, 500);
    });
    
    socket.on('round:continue', () => {
        // Game continues - auto-load next question with round increment
        correctGuessesThisRound = [];
        loadNewQuestion(true); // Increment round when continuing from summary
    });
    
    socket.on('gameState:update', (data) => {
        if (data.screen) {
            if (data.screen === 'setup') {
                showSetupControls();
            } else if (data.screen === 'game') {
                showGameControls();
            }
        }
    });

    // ============ PARTY MODE SOCKET HANDLERS ============

    socket.on('players:updated', (data) => {
        partyPlayers = data.players;
    });

    socket.on('teams:updated', (data) => {
        partyPlayers = data.players;
    });

    socket.on('partyGame:started', (gameState) => {
        isPartyMode = true;
        // Show party tab
        if (partyTab) {
            partyTab.style.display = 'flex';
        }
        applyGameState(gameState);
        showGameControls();
    });

    socket.on('battle:started', (data) => {
        currentBattlePlayers = [data.team1Player, data.team2Player];
        faceOffActive = data.faceOffActive;

        // Update battle display
        if (hostBattlePlayer1) {
            hostBattlePlayer1.textContent = data.team1Player ? data.team1Player.name : '-';
        }
        if (hostBattlePlayer2) {
            hostBattlePlayer2.textContent = data.team2Player ? data.team2Player.name : '-';
        }
        if (hostTurnPlayer1Name) {
            hostTurnPlayer1Name.textContent = data.team1Player ? data.team1Player.name : 'Player 1';
        }
        if (hostTurnPlayer2Name) {
            hostTurnPlayer2Name.textContent = data.team2Player ? data.team2Player.name : 'Player 2';
        }
        if (hostCurrentTurnPlayer) {
            hostCurrentTurnPlayer.textContent = faceOffActive ? 'Face-off in progress' : '-';
        }
    });

    socket.on('turn:changed', (data) => {
        currentTurnPlayer = data.currentTurnPlayer;
        faceOffActive = data.faceOffActive;

        if (hostCurrentTurnPlayer) {
            hostCurrentTurnPlayer.textContent = data.playerName || 'Unknown';
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // Login
    hostLoginBtn.addEventListener('click', handleLogin);
    hostPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    roomCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') hostPasswordInput.focus();
    });
    
    // Take over modal
    takeOverBtn.addEventListener('click', () => {
        takeOverModal.style.display = 'none';
        socket.emit('host:takeOver', {
            roomCode: roomCodeInput.value.toUpperCase(),
            password: hostPasswordInput.value
        });
    });
    cancelTakeOverBtn.addEventListener('click', () => {
        takeOverModal.style.display = 'none';
        hostLoginBtn.disabled = false;
    });
    
    // Tabs
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
    
    // Reveal buttons
    revealBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            if (!revealedAnswers.includes(index) && currentQuestion) {
                socket.emit('revealAnswer', { index });
            }
        });
    });
    
    // Game controls
    hostNewQuestionBtn.addEventListener('click', loadNewQuestion);
    hostRevealNextBtn.addEventListener('click', revealNextAnswer);
    hostAddStrikeBtn.addEventListener('click', () => socket.emit('addStrike'));
    hostRemoveStrikeBtn.addEventListener('click', () => socket.emit('removeStrike'));
    
    // Points
    hostAwardTeam1Btn.addEventListener('click', () => {
        const points = parseInt(hostPointsInput.value) || 0;
        if (points > 0) {
            socket.emit('endRound', { team: 1, points, correctGuesses: correctGuessesThisRound });
            hostPointsInput.value = 0;
            roundPointsEarned = 0;
            correctGuessesThisRound = [];
            hostRoundPoints.textContent = '(Round: 0)';
        }
    });
    hostAwardTeam2Btn.addEventListener('click', () => {
        const points = parseInt(hostPointsInput.value) || 0;
        if (points > 0) {
            socket.emit('endRound', { team: 2, points, correctGuesses: correctGuessesThisRound });
            hostPointsInput.value = 0;
            roundPointsEarned = 0;
            correctGuessesThisRound = [];
            hostRoundPoints.textContent = '(Round: 0)';
        }
    });
    
    // Flow controls
    hostNextRoundBtn.addEventListener('click', () => {
        // Emit next round / show summary event
        socket.emit('showRoundSummary');
    });
    hostResetRoundBtn.addEventListener('click', () => {
        if (confirm('Reset this round?')) {
            socket.emit('resetRound');
        }
    });
    hostEndGameBtn.addEventListener('click', () => {
        if (confirm('End the game now?')) {
            socket.emit('endGame');
        }
    });
    
    // Answer check
    hostCheckAnswerBtn.addEventListener('click', checkAnswer);
    hostAnswerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') checkAnswer();
    });
    
    // Timer
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const seconds = parseInt(btn.dataset.seconds);
            hostTimerInput.value = seconds;
            timerSeconds = seconds;
            updateTimerDisplay();
        });
    });
    hostTimerStartBtn.addEventListener('click', () => {
        const seconds = parseInt(hostTimerInput.value) || 30;
        socket.emit('timer:start', { seconds });
    });
    hostTimerPauseBtn.addEventListener('click', () => {
        socket.emit('timer:pause');
    });
    hostTimerResetBtn.addEventListener('click', () => {
        const seconds = parseInt(hostTimerInput.value) || 30;
        socket.emit('timer:reset', { seconds });
    });
    
    // Log
    hostClearLogBtn.addEventListener('click', () => {
        socket.emit('clearEntryLog');
    });
    
    // Setup
    roundSelectBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            roundSelectBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            hostCustomRounds.value = '';
        });
    });
    hostCustomRounds.addEventListener('input', () => {
        if (hostCustomRounds.value) {
            roundSelectBtns.forEach(b => b.classList.remove('selected'));
        }
    });
    hostStartGameBtn.addEventListener('click', startGame);
    
    // Setup Help button - switch to help tab
    hostSetupHelpBtn.addEventListener('click', () => {
        showGameControls(); // Show the game tabs
        switchTab('help'); // Switch to help tab
    });
    
    // Navigation
    hostNavSetupBtn.addEventListener('click', () => {
        socket.emit('navigate', { screen: 'setup' });
        showSetupControls();
    });
    hostNavGameBtn.addEventListener('click', () => {
        socket.emit('navigate', { screen: 'game' });
        showGameControls();
    });
    hostResetGameBtn.addEventListener('click', () => {
        if (confirm('Reset the entire game? All scores will be lost.')) {
            socket.emit('resetGame');
        }
    });
    
    // Reconnect
    reconnectBtn.addEventListener('click', () => {
        disconnectedOverlay.style.display = 'none';
        socket.connect();
        if (roomCode) {
            socket.emit('host:authenticate', {
                roomCode: roomCode,
                password: hostPasswordInput.value
            });
        }
    });

    // Party mode controls
    if (hostGiveTurnPlayer1Btn) {
        hostGiveTurnPlayer1Btn.addEventListener('click', () => {
            if (currentBattlePlayers[0]) {
                socket.emit('partyGame:setTurn', { playerId: currentBattlePlayers[0].id });
            }
        });
    }
    if (hostGiveTurnPlayer2Btn) {
        hostGiveTurnPlayer2Btn.addEventListener('click', () => {
            if (currentBattlePlayers[1]) {
                socket.emit('partyGame:setTurn', { playerId: currentBattlePlayers[1].id });
            }
        });
    }
    if (hostNextBattleBtn) {
        hostNextBattleBtn.addEventListener('click', () => {
            socket.emit('partyGame:nextBattle');
        });
    }
}

// Handle login
function handleLogin() {
    const code = roomCodeInput.value.trim().toUpperCase();
    const password = hostPasswordInput.value;
    
    if (!code) {
        hostLoginError.textContent = 'Please enter a room code';
        return;
    }
    if (!password) {
        hostLoginError.textContent = 'Please enter the host password';
        return;
    }
    
    hostLoginError.textContent = '';
    hostLoginBtn.disabled = true;
    updateConnectionStatus('connecting', 'Authenticating...');
    
    socket.emit('host:authenticate', { roomCode: code, password });
}

// Update connection status
function updateConnectionStatus(status, text) {
    connectionIndicator.className = 'connection-indicator ' + status;
    connectionText.textContent = text;
}

// Show disconnected overlay
function showDisconnectedOverlay(reason) {
    disconnectReason.textContent = reason;
    disconnectedOverlay.style.display = 'flex';
}

// Apply game state
function applyGameState(state) {
    if (state.team1Name) {
        hostTeam1Name.textContent = state.team1Name;
        document.getElementById('host-award-team1-name').textContent = state.team1Name;
        hostTeam1Input.value = state.team1Name;
    }
    if (state.team2Name) {
        hostTeam2Name.textContent = state.team2Name;
        document.getElementById('host-award-team2-name').textContent = state.team2Name;
        hostTeam2Input.value = state.team2Name;
    }
    if (state.team1Score !== undefined) {
        hostTeam1Score.textContent = state.team1Score;
    }
    if (state.team2Score !== undefined) {
        hostTeam2Score.textContent = state.team2Score;
    }
    if (state.currentRound) {
        hostCurrentRound.textContent = state.currentRound;
    }
    if (state.totalRounds) {
        hostTotalRounds.textContent = state.totalRounds;
    }
    if (state.strikes !== undefined) {
        updateStrikesDisplay(state.strikes);
    }
    if (state.currentQuestion) {
        currentQuestion = state.currentQuestion;
        hostQuestionText.textContent = currentQuestion.question;
    }
    if (state.revealedAnswers) {
        revealedAnswers = state.revealedAnswers;
    }
    if (state.entryLog) {
        renderEntryLog(state.entryLog);
    }
    if (state.roundPointsEarned !== undefined) {
        roundPointsEarned = state.roundPointsEarned;
        hostPointsInput.value = roundPointsEarned;
        hostRoundPoints.textContent = `(Round: ${roundPointsEarned})`;
    }
    if (state.usedQuestionIndices) {
        usedQuestionIndices = state.usedQuestionIndices;
    }
    
    updateAnswerPreview();
    
    // Show appropriate controls based on screen
    if (state.screen === 'setup' || state.screen === 'qr') {
        showSetupControls();
    } else if (state.screen === 'game') {
        showGameControls();
    }
}

// Switch tab
function switchTab(tabName) {
    navTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
}

// Update strikes display
function updateStrikesDisplay(count) {
    hostStrikes.forEach((strike, index) => {
        strike.classList.toggle('active', index < count);
    });
}

// Update answer preview
function updateAnswerPreview() {
    answerItems.forEach((item, index) => {
        const answerText = item.querySelector('.answer-text');
        const answerPts = item.querySelector('.answer-pts');
        const revealBtn = item.querySelector('.reveal-btn');
        
        if (currentQuestion && index < currentQuestion.answers.length) {
            const answer = currentQuestion.answers[index];
            const isRevealed = revealedAnswers.includes(index);
            
            answerText.textContent = isRevealed ? answer.text : '?';
            answerPts.textContent = isRevealed ? answer.points : '';
            item.classList.toggle('revealed', isRevealed);
            revealBtn.disabled = isRevealed;
            
            // Store answer text for host reference (always visible to host)
            answerText.title = answer.text + ' (' + answer.points + ' pts)';
        } else {
            answerText.textContent = '-';
            answerPts.textContent = '';
            item.classList.remove('revealed');
            revealBtn.disabled = true;
        }
    });
}

// Load new question
function loadNewQuestion(incrementRound = false) {
    if (gameData.length === 0) {
        alert('No questions loaded');
        return;
    }
    
    // Get available question indices
    let availableIndices = [];
    for (let i = 0; i < gameData.length; i++) {
        if (!usedQuestionIndices.includes(i)) {
            availableIndices.push(i);
        }
    }
    
    if (availableIndices.length === 0) {
        usedQuestionIndices = [];
        availableIndices = gameData.map((_, i) => i);
    }
    
    const randomIndex = Math.floor(Math.random() * availableIndices.length);
    const questionIndex = availableIndices[randomIndex];
    usedQuestionIndices.push(questionIndex);
    
    const question = JSON.parse(JSON.stringify(gameData[questionIndex]));
    question.answers.sort((a, b) => b.points - a.points);
    
    currentQuestion = question;
    revealedAnswers = [];
    roundPointsEarned = 0;
    
    socket.emit('newQuestion', { question, incrementRound });
    
    // Update local UI
    hostQuestionText.textContent = question.question;
    hostPointsInput.value = 0;
    hostRoundPoints.textContent = '(Round: 0)';
    updateAnswerPreview();
    updateStrikesDisplay(0);
}

// Reveal next answer
function revealNextAnswer() {
    if (!currentQuestion) return;
    
    for (let i = 0; i < currentQuestion.answers.length; i++) {
        if (!revealedAnswers.includes(i)) {
            socket.emit('revealAnswer', { index: i });
            break;
        }
    }
}

// Check answer
function checkAnswer() {
    const answer = hostAnswerInput.value.trim();
    if (!answer) {
        alert('Please enter an answer');
        return;
    }
    if (!currentQuestion) {
        alert('No question loaded');
        return;
    }
    
    hostAnswerResult.style.display = 'none';
    hostAnswerChecking.style.display = 'flex';
    hostCheckAnswerBtn.disabled = true;
    
    socket.emit('checkAnswer', { playerAnswer: answer });
}

// Timer functions
function startLocalTimer() {
    stopLocalTimer();
    timerInterval = setInterval(() => {
        if (timerSeconds > 0) {
            timerSeconds--;
            updateTimerDisplay();
            socket.emit('timer:update', { seconds: timerSeconds });
            
            if (timerSeconds <= 0) {
                stopLocalTimer();
                socket.emit('timer:finished');
            }
        }
    }, 1000);
}

function stopLocalTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    hostTimerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    hostTimerDisplay.classList.remove('running', 'warning', 'danger');
    if (timerRunning) {
        if (timerSeconds <= 5) {
            hostTimerDisplay.classList.add('danger');
        } else if (timerSeconds <= 10) {
            hostTimerDisplay.classList.add('warning');
        } else {
            hostTimerDisplay.classList.add('running');
        }
    }
}

// Render entry log
function renderEntryLog(entries) {
    if (!entries || entries.length === 0) {
        hostLogList.innerHTML = '<div class="log-empty">No entries yet</div>';
        return;
    }
    
    hostLogList.innerHTML = entries.map(item => `
        <div class="log-item ${item.isCorrect ? 'correct' : 'incorrect'}">
            <span class="log-icon">${item.isCorrect ? '✓' : '✗'}</span>
            <span class="log-text">${escapeHtml(item.entry)}</span>
        </div>
    `).join('');
    
    hostLogList.scrollTop = hostLogList.scrollHeight;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show setup controls
function showSetupControls() {
    hostSetupControls.style.display = 'block';
    document.getElementById('tab-game').style.display = 'none';
    navTabs.forEach(tab => tab.style.display = 'none');
}

// Show game controls
function showGameControls() {
    hostSetupControls.style.display = 'none';
    document.getElementById('tab-game').style.display = 'block';
    navTabs.forEach(tab => tab.style.display = 'flex');
    switchTab('game');
}

// Start game
function startGame() {
    const team1Name = hostTeam1Input.value.trim().toUpperCase() || 'TEAM 1';
    const team2Name = hostTeam2Input.value.trim().toUpperCase() || 'TEAM 2';
    
    let totalRounds = 7;
    const customRounds = parseInt(hostCustomRounds.value);
    if (customRounds && customRounds > 0) {
        totalRounds = Math.min(customRounds, 50);
    } else {
        const selectedBtn = document.querySelector('.round-select-btn.selected');
        if (selectedBtn) {
            totalRounds = parseInt(selectedBtn.dataset.rounds);
        }
    }
    
    usedQuestionIndices = [];
    
    socket.emit('startGame', { team1Name, team2Name, totalRounds });
}

// Initialize on page load
init();

