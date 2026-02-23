// Host Control Panel - Socket.IO Client

// Socket connection
let socket = null;
let roomCode = null;
let savedRoomCode = null;  // For reconnection
let savedPassword = null;  // For reconnection
let gameData = [];
let currentQuestion = null;
let revealedAnswers = [];
let timerInterval = null;
let timerSeconds = 30;
let timerRunning = false;
let roundPointsEarned = 0;
let usedQuestionIndices = [];
let correctGuessesThisRound = []; // Track correct guesses for round summary
let showingSummary = false; // Track if we're on summary screen
let authTimeout = null; // Timeout for authentication response

// Party mode state
let isPartyMode = false;
let partyPlayers = [];
let currentBattlePlayers = [null, null];
let currentTurnPlayer = null;
let faceOffActive = false;
let partyScreen = 'qr'; // qr, lobby, teams, game

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
const hostAddStrikeBtn = document.getElementById('host-add-strike-btn');
const hostRemoveStrikeBtn = document.getElementById('host-remove-strike-btn');
const hostNextRoundBtn = document.getElementById('host-next-round-btn');
const hostResetRoundBtn = document.getElementById('host-reset-round-btn');
const hostEndGameBtn = document.getElementById('host-end-game-btn');

// Panel Toggle Buttons
const hostHowToPlayBtn = document.getElementById('host-how-to-play-btn');
const hostShowPlayersBtn = document.getElementById('host-show-players-btn');
const hostJoinGameBtn = document.getElementById('host-join-game-btn');

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

// Timer Config Elements
const autoTimerToggle = document.getElementById('auto-timer-toggle');
const timerInputsContainer = document.getElementById('timer-inputs');
const buzzerTimeInput = document.getElementById('buzzer-time-input');
const afterBuzzerTimeInput = document.getElementById('after-buzzer-time-input');
const regularTimeInput = document.getElementById('regular-time-input');
const stealTimeInput = document.getElementById('steal-time-input');

// Navigation Elements
const hostNavSetupBtn = document.getElementById('host-nav-setup-btn');
const hostNavGameBtn = document.getElementById('host-nav-game-btn');
const hostResetGameBtn = document.getElementById('host-reset-game-btn');

// Disconnected Overlay
const disconnectedOverlay = document.getElementById('disconnected-overlay');
const disconnectReason = document.getElementById('disconnect-reason');
const reconnectBtn = document.getElementById('reconnect-btn');

// Party Mode Elements (Turn tab removed, only persistent status bar remains)

// Persistent Turn Status Bar (in header)
const hostTurnStatusBar = document.getElementById('host-turn-status-bar');
const hostTurnDisplay = document.getElementById('host-turn-display');

// Team Management Elements (Party Mode)
const teamsTab = document.querySelector('.teams-tab');
const hostManageTeam1Title = document.getElementById('host-manage-team1-title');
const hostManageTeam2Title = document.getElementById('host-manage-team2-title');
const hostManageTeam1List = document.getElementById('host-manage-team1-list');
const hostManageTeam2List = document.getElementById('host-manage-team2-list');
const hostManageUnassignedList = document.getElementById('host-manage-unassigned-list');

// Inline Team Management (in setup controls)
const hostSetupTeams = document.getElementById('host-setup-teams');
const hostSetupTeam1Title = document.getElementById('host-setup-team1-title');
const hostSetupTeam2Title = document.getElementById('host-setup-team2-title');
const hostSetupTeam1List = document.getElementById('host-setup-team1-list');
const hostSetupTeam2List = document.getElementById('host-setup-team2-list');
const hostSetupUnassignedList = document.getElementById('host-setup-unassigned-list');

// Party Flow Control Elements
const partyFlowControl = document.getElementById('party-flow-control');
const hostPartyNextBtn = document.getElementById('host-party-next-btn');
const hostPartyNextText = document.getElementById('host-party-next-text');
const hostPartyBackBtn = document.getElementById('host-party-back-btn');

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

// Safe emit - checks connection before sending
function safeEmit(event, data) {
    if (!socket || !socket.connected) {
        updateConnectionStatus('disconnected', 'Not connected. Waiting for reconnection...');
        return false;
    }
    socket.emit(event, data);
    return true;
}

// Initialize Socket.IO connection
function initSocket() {
    socket = io({
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
    });

    socket.on('connect', () => {
        updateConnectionStatus('connecting', 'Connected to server');
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log('Reconnected to server after', attemptNumber, 'attempts');
        // Re-authenticate if we have saved credentials
        if (savedRoomCode && savedPassword) {
            updateConnectionStatus('connecting', 'Reconnected. Re-authenticating...');
            socket.emit('host:authenticate', {
                roomCode: savedRoomCode,
                password: savedPassword
            });
        }
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
        updateConnectionStatus('connecting', `Reconnecting... (attempt ${attemptNumber})`);
    });

    socket.on('reconnect_failed', () => {
        updateConnectionStatus('disconnected', 'Reconnection failed. Please refresh.');
        showDisconnectedOverlay('Unable to reconnect. Please refresh the page.');
    });

    socket.on('disconnect', () => {
        updateConnectionStatus('disconnected', 'Disconnected. Attempting to reconnect...');
    });
    
    socket.on('host:authResult', (data) => {
        // Clear auth timeout
        if (authTimeout) {
            clearTimeout(authTimeout);
            authTimeout = null;
        }

        if (data.success) {
            roomCode = roomCodeInput.value.toUpperCase();
            // Save credentials for reconnection
            savedRoomCode = roomCode;
            savedPassword = hostPasswordInput.value;
            updateConnectionStatus('connected', `Connected to room ${roomCode}`);
            hostLoginScreen.style.display = 'none';
            hostControlScreen.style.display = 'block';

            // Apply game state if provided (restores scores, teams, etc.)
            if (data.gameState) {
                applyGameState(data.gameState);

                if (data.gameState.partyScreen) {
                    partyScreen = data.gameState.partyScreen;
                }
            }

            // Always show setup controls first after login
            showSetupControls();
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
        // Don't switch screens - host should stay on current screen
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
    });
    
    socket.on('answer:revealed', (data) => {
        if (!revealedAnswers.includes(data.index)) {
            revealedAnswers.push(data.index);
        }
        updateAnswerPreview();
    });
    
    
    socket.on('answer:correct', (data) => {
        if (!revealedAnswers.includes(data.index)) {
            revealedAnswers.push(data.index);
        }
        roundPointsEarned = data.roundPointsEarned;

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
        showingSummary = false;
        updateNextRoundButtonText();
        revealedAnswers = [];
        roundPointsEarned = 0;
        updateStrikesDisplay(0);
        updateAnswerPreview();
        renderEntryLog([]);

        // Re-enable buttons after reset
        hostNewQuestionBtn.disabled = false;
        hostAddStrikeBtn.disabled = false;
        hostRemoveStrikeBtn.disabled = false;
    });
    
    socket.on('game:reset', (gameState) => {
        showingSummary = false;
        updateNextRoundButtonText();
        resetGameDisplay();  // Clear all game UI to fresh state
        applyGameState(gameState);

        // Hide turn status bar on reset
        if (hostTurnStatusBar) {
            hostTurnStatusBar.style.display = 'none';
        }

        // If party mode with players, set flags before showing setup controls
        if (gameState.players && gameState.players.length > 0) {
            partyPlayers = gameState.players;
            partyScreen = gameState.partyScreen || 'qr';
            isPartyMode = true;
            renderHostManageTeams();
        }

        showSetupControls();
    });
    
    socket.on('game:ended', (data) => {
        showingSummary = false;
        const winner = data.team1Score > data.team2Score ? data.team1Name :
                       data.team2Score > data.team1Score ? data.team2Name : 'TIE';
        alert(`Game Over!\n\nWinner: ${winner}\n\n${data.team1Name}: ${data.team1Score}\n${data.team2Name}: ${data.team2Score}`);
    });
    
    socket.on('round:summary', (data) => {
        stopLocalTimer();
        socket.emit('timer:pause');  // Notify players to stop their timers
        // Update scores on host
        hostTeam1Score.textContent = data.team1Score;
        hostTeam2Score.textContent = data.team2Score;

        // Set flag to indicate we're on summary screen
        // Host can click "Next Round" again to continue
        showingSummary = true;
        updateNextRoundButtonText();

        // Disable buttons during round summary
        hostNewQuestionBtn.disabled = true;
        hostAddStrikeBtn.disabled = true;
        hostRemoveStrikeBtn.disabled = true;
    });
    
    socket.on('round:continue', () => {
        // Game continues - auto-load next question with round increment
        showingSummary = false;
        updateNextRoundButtonText();
        correctGuessesThisRound = [];
        loadNewQuestion(true); // Increment round when continuing from summary

        // Re-enable buttons for new round
        hostNewQuestionBtn.disabled = false;
        hostAddStrikeBtn.disabled = false;
        hostRemoveStrikeBtn.disabled = false;

        // Auto-start next face-off in party mode
        if (isPartyMode) {
            socket.emit('partyGame:nextBattle');
        }
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
        renderHostManageTeams();
        renderInlineTeams();
    });

    socket.on('teams:updated', (data) => {
        partyPlayers = data.players;
        renderHostManageTeams();
        renderInlineTeams();
    });

    socket.on('partyGame:started', (gameState) => {
        isPartyMode = true;
        partyScreen = 'game';
        showingSummary = false;
        updateNextRoundButtonText();
        // Show teams tab for party mode
        if (teamsTab) {
            teamsTab.style.display = 'flex';
        }
        // Show persistent turn status bar
        if (hostTurnStatusBar) {
            hostTurnStatusBar.style.display = 'block';
        }
        // Hide flow control and inline teams when game starts
        if (partyFlowControl) {
            partyFlowControl.style.display = 'none';
        }
        if (hostSetupTeams) {
            hostSetupTeams.style.display = 'none';
        }
        applyGameState(gameState);
        showGameControls();
        renderHostManageTeams();
    });

    // When countdown finishes, auto-start the first face-off
    socket.on('countdown:completed', () => {
        if (isPartyMode) {
            socket.emit('partyGame:nextBattle');
        }
    });

    socket.on('partyScreen:updated', (data) => {
        partyScreen = data.screen;
        updatePartyFlowControl();

        // Show inline teams management when on teams screen
        if (hostSetupTeams) {
            if (data.screen === 'teams') {
                hostSetupTeams.style.display = 'block';
                renderHostManageTeams();
                renderInlineTeams();
            } else {
                hostSetupTeams.style.display = 'none';
            }
        }

        // Also show Teams tab for later access
        if (data.screen === 'teams') {
            if (teamsTab) {
                teamsTab.style.display = 'flex';
            }
        }
    });

    // Timer config updated from server
    socket.on('timerConfig:updated', (data) => {
        // Update local inputs to match server state
        if (autoTimerToggle) autoTimerToggle.checked = data.enabled;
        if (buzzerTimeInput) buzzerTimeInput.value = data.buzzerTime;
        if (afterBuzzerTimeInput) afterBuzzerTimeInput.value = data.afterBuzzerTime;
        if (regularTimeInput) regularTimeInput.value = data.regularTime;
        if (stealTimeInput) stealTimeInput.value = data.stealTime;

        // Show/hide timer inputs based on enabled state
        if (timerInputsContainer) {
            timerInputsContainer.classList.toggle('hidden', !data.enabled);
        }
    });

    socket.on('battle:started', (data) => {
        currentBattlePlayers = [data.team1Player, data.team2Player];
        faceOffActive = data.faceOffActive;

        const p1Name = data.team1Player ? data.team1Player.name : '???';
        const p2Name = data.team2Player ? data.team2Player.name : '???';
        const turnText = faceOffActive ? `Face Off: ${p1Name} vs ${p2Name}` : 'Current Turn: -';
        if (hostTurnDisplay) {
            hostTurnDisplay.textContent = turnText;
        }
    });

    socket.on('turn:changed', (data) => {
        currentTurnPlayer = data.currentTurnPlayer;
        faceOffActive = data.faceOffActive;

        const playerName = data.currentTurnPlayerName || data.playerName || '-';
        const turnText = `Current Turn: ${playerName}`;
        if (hostTurnDisplay) {
            hostTurnDisplay.textContent = turnText;
        }
    });

    // Face-off chain: next player's turn
    socket.on('faceOff:chainNext', (data) => {
        currentTurnPlayer = data.nextPlayerId;
        const turnText = `${data.nextPlayerName} answer!`;
        if (hostTurnDisplay) {
            hostTurnDisplay.textContent = turnText;
        }
    });

    // Face-off won: a team won the face-off
    socket.on('faceOff:won', (data) => {
        currentTurnPlayer = data.nextPlayerId;
        faceOffActive = false;
        const turnText = `Current Turn: ${data.nextPlayerName}`;
        if (hostTurnDisplay) {
            hostTurnDisplay.textContent = turnText;
        }
    });

    // Steal phase handlers
    socket.on('steal:phase', (data) => {
        const teamName = data.stealingTeamName || `Team ${data.stealingTeam || '?'}`;
        const turnText = `${teamName} is trying to steal!`;
        if (hostTurnDisplay) {
            hostTurnDisplay.textContent = turnText;
        }
    });

    socket.on('steal:success', (data) => {
        stopLocalTimer();
        const turnText = 'Steal SUCCESS!';
        if (hostTurnDisplay) {
            hostTurnDisplay.textContent = turnText;
        }
    });

    socket.on('steal:failed', (data) => {
        stopLocalTimer();
        const turnText = 'Steal FAILED!';
        if (hostTurnDisplay) {
            hostTurnDisplay.textContent = turnText;
        }
    });

    socket.on('board:cleared', (data) => {
        stopLocalTimer();
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
    hostNewQuestionBtn.addEventListener('click', () => loadNewQuestion(false));
    hostAddStrikeBtn.addEventListener('click', () => socket.emit('addStrike'));
    hostRemoveStrikeBtn.addEventListener('click', () => socket.emit('removeStrike'));

    // Flow controls
    hostNextRoundBtn.addEventListener('click', () => {
        if (showingSummary) {
            // On summary screen - continue to next round
            socket.emit('continueFromSummary');
            showingSummary = false;
            updateNextRoundButtonText();
        } else {
            // On game screen - show summary first
            socket.emit('showRoundSummary');
        }
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

    // Party flow control
    if (hostPartyNextBtn) {
        hostPartyNextBtn.addEventListener('click', handlePartyNextClick);
    }
    if (hostPartyBackBtn) {
        hostPartyBackBtn.addEventListener('click', handlePartyBackClick);
    }

    // Panel toggle buttons
    if (hostHowToPlayBtn) {
        hostHowToPlayBtn.addEventListener('click', () => {
            socket.emit('panel:toggle', { panel: 'tutorial' });
        });
    }
    if (hostShowPlayersBtn) {
        hostShowPlayersBtn.addEventListener('click', () => {
            socket.emit('panel:toggle', { panel: 'players' });
        });
    }
    if (hostJoinGameBtn) {
        hostJoinGameBtn.addEventListener('click', () => {
            socket.emit('panel:toggle', { panel: 'qrCodes' });
        });
    }
    
    // Timer
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const seconds = parseInt(btn.dataset.seconds);
            hostTimerInput.value = seconds;
            timerSeconds = seconds;
            updateTimerDisplay();
        });
    });
    if (hostTimerStartBtn) {
        hostTimerStartBtn.addEventListener('click', () => {
            const seconds = parseInt(hostTimerInput.value) || 30;
            socket.emit('timer:start', { seconds });
        });
    }
    if (hostTimerPauseBtn) {
        hostTimerPauseBtn.addEventListener('click', () => {
            socket.emit('timer:pause');
        });
    }
    if (hostTimerResetBtn) {
        hostTimerResetBtn.addEventListener('click', () => {
            const seconds = parseInt(hostTimerInput.value) || 30;
            socket.emit('timer:reset', { seconds });
        });
    }

    // Log
    if (hostClearLogBtn) {
        hostClearLogBtn.addEventListener('click', () => {
            socket.emit('clearEntryLog');
        });
    }
    
    // Setup
    roundSelectBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            roundSelectBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            hostCustomRounds.value = '';
            emitTimerConfig();
        });
    });
    hostCustomRounds.addEventListener('input', () => {
        if (hostCustomRounds.value) {
            roundSelectBtns.forEach(b => b.classList.remove('selected'));
        }
        emitTimerConfig();
    });
    hostStartGameBtn.addEventListener('click', startGame);

    // Timer Config event listeners
    if (autoTimerToggle) {
        autoTimerToggle.addEventListener('change', () => {
            const enabled = autoTimerToggle.checked;
            if (timerInputsContainer) {
                timerInputsContainer.classList.toggle('hidden', !enabled);
            }
            emitTimerConfig();
        });
    }

    // Timer input change listeners
    [buzzerTimeInput, afterBuzzerTimeInput, regularTimeInput, stealTimeInput].forEach(input => {
        if (input) {
            input.addEventListener('change', emitTimerConfig);
        }
    });

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

    // Check if socket is connected before attempting auth
    if (!socket.connected) {
        hostLoginError.textContent = 'Not connected to server. Please wait and try again.';
        return;
    }

    hostLoginError.textContent = '';
    hostLoginBtn.disabled = true;
    updateConnectionStatus('connecting', 'Authenticating...');

    // Clear any existing timeout
    if (authTimeout) clearTimeout(authTimeout);

    // Set timeout to reset UI if no response
    authTimeout = setTimeout(() => {
        hostLoginBtn.disabled = false;
        hostLoginError.textContent = 'Authentication timed out. Please try again.';
        updateConnectionStatus('disconnected', 'Connection timeout');
    }, 10000);

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
        const awardTeam1 = document.getElementById('host-award-team1-name');
        if (awardTeam1) awardTeam1.textContent = state.team1Name;
        hostTeam1Input.value = state.team1Name;
    }
    if (state.team2Name) {
        hostTeam2Name.textContent = state.team2Name;
        const awardTeam2 = document.getElementById('host-award-team2-name');
        if (awardTeam2) awardTeam2.textContent = state.team2Name;
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
    }
    if (state.usedQuestionIndices) {
        usedQuestionIndices = state.usedQuestionIndices;
    }
    
    updateAnswerPreview();
}

// Switch tab
let currentActiveTab = 'game';

function switchTab(tabName) {
    // If clicking the same tab (except Game), toggle it off and go back to Game
    if (tabName === currentActiveTab && tabName !== 'game') {
        tabName = 'game';
    }

    currentActiveTab = tabName;

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
    if (!hostTimerDisplay) return;  // Skip if element doesn't exist
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
    // Skip if log element was removed from HTML
    if (!hostLogList) return;

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

// Update Next Round button text based on summary state
function updateNextRoundButtonText() {
    if (showingSummary) {
        hostNextRoundBtn.textContent = 'Next Round →';
    } else {
        hostNextRoundBtn.textContent = 'End Round';
    }
}

// Render host team management panel
function renderHostManageTeams() {
    if (!hostManageTeam1List || !hostManageTeam2List || !hostManageUnassignedList) return;

    // Update team titles
    if (hostManageTeam1Title) {
        hostManageTeam1Title.textContent = hostTeam1Name?.textContent || 'Team 1';
    }
    if (hostManageTeam2Title) {
        hostManageTeam2Title.textContent = hostTeam2Name?.textContent || 'Team 2';
    }

    // Get players by team
    const team1PlayersList = partyPlayers.filter(p => p.team === 1);
    const team2PlayersList = partyPlayers.filter(p => p.team === 2);
    const unassignedPlayersList = partyPlayers.filter(p => p.team === null || p.team === undefined);

    // Render Team 1 players
    if (team1PlayersList.length === 0) {
        hostManageTeam1List.innerHTML = '<div class="team-manage-empty">No players</div>';
    } else {
        hostManageTeam1List.innerHTML = team1PlayersList.map(p => `
            <div class="team-manage-player">
                <span class="player-name">${escapeHtml(p.name)}</span>
                <div class="player-btns">
                    <button class="move-btn unassign" onclick="moveHostPlayerToTeam('${p.id}', null)">✕</button>
                    <button class="move-btn to-team2" onclick="moveHostPlayerToTeam('${p.id}', 2)">→</button>
                </div>
            </div>
        `).join('');
    }

    // Render Team 2 players
    if (team2PlayersList.length === 0) {
        hostManageTeam2List.innerHTML = '<div class="team-manage-empty">No players</div>';
    } else {
        hostManageTeam2List.innerHTML = team2PlayersList.map(p => `
            <div class="team-manage-player">
                <span class="player-name">${escapeHtml(p.name)}</span>
                <div class="player-btns">
                    <button class="move-btn to-team1" onclick="moveHostPlayerToTeam('${p.id}', 1)">←</button>
                    <button class="move-btn unassign" onclick="moveHostPlayerToTeam('${p.id}', null)">✕</button>
                </div>
            </div>
        `).join('');
    }

    // Render Unassigned players
    if (unassignedPlayersList.length === 0) {
        hostManageUnassignedList.innerHTML = '<div class="team-manage-empty">No unassigned</div>';
    } else {
        hostManageUnassignedList.innerHTML = unassignedPlayersList.map(p => `
            <div class="team-manage-player">
                <span class="player-name">${escapeHtml(p.name)}</span>
                <div class="player-btns">
                    <button class="move-btn to-team1" onclick="moveHostPlayerToTeam('${p.id}', 1)">T1</button>
                    <button class="move-btn to-team2" onclick="moveHostPlayerToTeam('${p.id}', 2)">T2</button>
                </div>
            </div>
        `).join('');
    }
}

// Move player to team (from host manage panel)
function moveHostPlayerToTeam(playerId, team) {
    if (socket) {
        socket.emit('player:assignTeam', { playerId, team });
    }
}

// Render inline team management (in setup controls)
function renderInlineTeams() {
    if (!hostSetupTeam1List || !hostSetupTeam2List || !hostSetupUnassignedList) return;

    // Update team titles
    if (hostSetupTeam1Title) {
        hostSetupTeam1Title.textContent = hostTeam1Input?.value?.trim().toUpperCase() || hostTeam1Name?.textContent || 'Team 1';
    }
    if (hostSetupTeam2Title) {
        hostSetupTeam2Title.textContent = hostTeam2Input?.value?.trim().toUpperCase() || hostTeam2Name?.textContent || 'Team 2';
    }

    // Get players by team
    const team1PlayersList = partyPlayers.filter(p => p.team === 1);
    const team2PlayersList = partyPlayers.filter(p => p.team === 2);
    const unassignedPlayersList = partyPlayers.filter(p => p.team === null || p.team === undefined);

    // Render Team 1 players
    if (team1PlayersList.length === 0) {
        hostSetupTeam1List.innerHTML = '<div class="team-manage-empty">No players</div>';
    } else {
        hostSetupTeam1List.innerHTML = team1PlayersList.map(p => `
            <div class="team-manage-player">
                <span class="player-name">${escapeHtml(p.name)}</span>
                <div class="player-btns">
                    <button class="move-btn unassign" onclick="moveHostPlayerToTeam('${p.id}', null)">✕</button>
                    <button class="move-btn to-team2" onclick="moveHostPlayerToTeam('${p.id}', 2)">→</button>
                </div>
            </div>
        `).join('');
    }

    // Render Team 2 players
    if (team2PlayersList.length === 0) {
        hostSetupTeam2List.innerHTML = '<div class="team-manage-empty">No players</div>';
    } else {
        hostSetupTeam2List.innerHTML = team2PlayersList.map(p => `
            <div class="team-manage-player">
                <span class="player-name">${escapeHtml(p.name)}</span>
                <div class="player-btns">
                    <button class="move-btn to-team1" onclick="moveHostPlayerToTeam('${p.id}', 1)">←</button>
                    <button class="move-btn unassign" onclick="moveHostPlayerToTeam('${p.id}', null)">✕</button>
                </div>
            </div>
        `).join('');
    }

    // Render Unassigned players
    if (unassignedPlayersList.length === 0) {
        hostSetupUnassignedList.innerHTML = '<div class="team-manage-empty">No unassigned</div>';
    } else {
        hostSetupUnassignedList.innerHTML = unassignedPlayersList.map(p => `
            <div class="team-manage-player">
                <span class="player-name">${escapeHtml(p.name)}</span>
                <div class="player-btns">
                    <button class="move-btn to-team1" onclick="moveHostPlayerToTeam('${p.id}', 1)">T1</button>
                    <button class="move-btn to-team2" onclick="moveHostPlayerToTeam('${p.id}', 2)">T2</button>
                </div>
            </div>
        `).join('');
    }
}

// Reset game display to fresh state (called on game reset)
function resetGameDisplay() {
    // Clear question display
    hostQuestionText.textContent = 'No question loaded';
    currentQuestion = null;

    // Clear revealed answers
    revealedAnswers = [];
    updateAnswerPreview();

    // Reset scores display
    hostTeam1Score.textContent = '0';
    hostTeam2Score.textContent = '0';

    // Reset round display
    hostCurrentRound.textContent = '1';

    // Reset strikes
    updateStrikesDisplay(0);

    // Reset round points
    roundPointsEarned = 0;

    // Clear entry log
    renderEntryLog([]);
}

// Show setup controls
function showSetupControls() {
    hostSetupControls.style.display = 'block';
    document.getElementById('tab-game').style.display = 'none';
    navTabs.forEach(tab => tab.style.display = 'none');

    // Party mode is always available - always show party flow control
    updatePartyFlowControl();
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

// ============ PARTY FLOW CONTROL ============

// Handle party next button click
function handlePartyNextClick() {
    if (partyScreen === 'qr') {
        // Go to player join screen (lobby)
        socket.emit('partyScreen:navigate', { screen: 'lobby' });
    } else if (partyScreen === 'lobby') {
        // Go to team assignment screen
        socket.emit('partyScreen:navigate', { screen: 'teams' });
    } else if (partyScreen === 'teams') {
        // Go to config screen - also emit timer config
        emitTimerConfig();
        socket.emit('partyScreen:navigate', { screen: 'config' });
    } else if (partyScreen === 'config') {
        // Start the party game - include settings from host inputs
        const team1Name = hostTeam1Input.value.trim().toUpperCase() || 'TEAM 1';
        const team2Name = hostTeam2Input.value.trim().toUpperCase() || 'TEAM 2';

        // Get selected rounds
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

        socket.emit('partyScreen:navigate', { screen: 'game', team1Name, team2Name, totalRounds });
    }
}

// Handle party back button click
function handlePartyBackClick() {
    if (partyScreen === 'config') {
        socket.emit('partyScreen:navigate', { screen: 'teams' });
    } else if (partyScreen === 'teams') {
        socket.emit('partyScreen:navigate', { screen: 'lobby' });
    } else if (partyScreen === 'lobby') {
        socket.emit('partyScreen:navigate', { screen: 'qr' });
    }
    // No back from 'qr' - it's the first screen
}

// Update party flow control button
function updatePartyFlowControl() {
    const startGameBtn = document.getElementById('host-start-game-btn');

    if (!partyFlowControl || !hostPartyNextBtn || !hostPartyNextText) return;

    if (partyScreen === 'game') {
        // Hide both during game
        partyFlowControl.style.display = 'none';
        if (startGameBtn) startGameBtn.style.display = 'none';
        return;
    }

    // In party mode setup: show party flow, hide regular start game
    partyFlowControl.style.display = 'block';
    if (startGameBtn) startGameBtn.style.display = 'none';

    // Update button text based on current screen
    if (partyScreen === 'qr') {
        hostPartyNextText.textContent = 'Players Join →';
        hostPartyNextBtn.classList.remove('start-game');
    } else if (partyScreen === 'lobby') {
        hostPartyNextText.textContent = 'Assign Teams →';
        hostPartyNextBtn.classList.remove('start-game');
    } else if (partyScreen === 'teams') {
        hostPartyNextText.textContent = 'Configure →';
        hostPartyNextBtn.classList.remove('start-game');
    } else if (partyScreen === 'config') {
        hostPartyNextText.textContent = 'Start Game';
        hostPartyNextBtn.classList.add('start-game');
    }

    // Show/hide back button (hidden on first screen)
    if (hostPartyBackBtn) {
        hostPartyBackBtn.style.display = (partyScreen === 'qr') ? 'none' : 'flex';
    }
}

// Emit timer config to server
function emitTimerConfig() {
    if (!socket) return;

    // Get current rounds value
    let currentRounds = 7;
    const customRounds = parseInt(hostCustomRounds.value);
    if (customRounds && customRounds > 0) {
        currentRounds = Math.min(customRounds, 50);
    } else {
        const selectedBtn = document.querySelector('.round-select-btn.selected');
        if (selectedBtn) {
            currentRounds = parseInt(selectedBtn.dataset.rounds);
        }
    }

    const config = {
        enabled: autoTimerToggle ? autoTimerToggle.checked : true,
        buzzerTime: buzzerTimeInput ? parseInt(buzzerTimeInput.value) || 7 : 7,
        afterBuzzerTime: afterBuzzerTimeInput ? parseInt(afterBuzzerTimeInput.value) || 15 : 15,
        regularTime: regularTimeInput ? parseInt(regularTimeInput.value) || 35 : 35,
        stealTime: stealTimeInput ? parseInt(stealTimeInput.value) || 120 : 120,
        totalRounds: currentRounds
    };

    socket.emit('timerConfig:update', config);
}

// Initialize on page load
init();

