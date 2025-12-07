// Game State
let currentQuestion = null;
let revealedAnswers = [];
let strikes = 0;
let team1Score = 0;
let team2Score = 0;
let currentRevealIndex = 0;
let gameData = []; // Will be loaded from CSV

// Game Settings
let team1Name = 'TEAM 1';
let team2Name = 'TEAM 2';
let totalRounds = 7;
let currentRound = 1;
let usedQuestionIndices = []; // Track which questions have been used
let roundPointsEarned = 0; // Track points earned from correct entries in current round

// Load questions from CSV file
async function loadQuestionsFromCSV() {
    try {
        const response = await fetch('questions.csv');
        const csvText = await response.text();
        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        
        // Skip header row
        const dataLines = lines.slice(1);
        
        gameData = dataLines.map(line => {
            // Parse CSV line (handling commas within quoted fields)
            const values = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const nextChar = line[i + 1];
                
                if (char === '"') {
                    // Handle escaped quotes ("")
                    if (nextChar === '"' && inQuotes) {
                        current += '"';
                        i++; // Skip next quote
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
            values.push(current.trim()); // Add last value
            
            // Extract question and answers
            const question = values[0];
            const answers = [];
            
            // Process answer pairs (Answer1, Points1, Answer2, Points2, etc.)
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
            
            // Sort answers by points (highest first)
            answers.sort((a, b) => b.points - a.points);
            
            return {
                question: question,
                answers: answers
            };
        }).filter(item => item.question && item.answers.length > 0);
        
        console.log(`Loaded ${gameData.length} questions from CSV`);
    } catch (error) {
        console.error('Error loading questions from CSV:', error);
        alert('Error loading questions. Please make sure questions.csv exists and the server allows loading local files.');
    }
}

// DOM Elements
const questionText = document.getElementById('question-text');
const team1ScoreEl = document.getElementById('team1-score');
const team2ScoreEl = document.getElementById('team2-score');
const strikesDisplay = document.querySelectorAll('.strike');
const answerSlots = document.querySelectorAll('.answer-slot');
const pointsInput = document.getElementById('points-input');
const teamSelect = document.getElementById('team-select');
const playerAnswerInput = document.getElementById('player-answer-input');
const checkAnswerBtn = document.getElementById('check-answer-btn');
const checkStatus = document.getElementById('check-status');

// Feedback Elements
const feedbackOverlay = document.getElementById('feedback-overlay');
const confettiCanvas = document.getElementById('confetti-canvas');
const bigStrike = document.getElementById('big-strike');
const timesUpDisplay = document.getElementById('times-up');
const confettiCtx = confettiCanvas.getContext('2d');

// Confetti Configuration
let confettiPieces = [];
let confettiAnimationId = null;

// Resize confetti canvas to match window
function resizeConfettiCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
}
resizeConfettiCanvas();
window.addEventListener('resize', resizeConfettiCanvas);

// Confetti particle class
class ConfettiPiece {
    constructor() {
        this.x = Math.random() * confettiCanvas.width;
        this.y = -20;
        this.size = Math.random() * 12 + 8;
        this.speedX = Math.random() * 6 - 3;
        this.speedY = Math.random() * 4 + 3;
        this.rotation = Math.random() * 360;
        this.rotationSpeed = Math.random() * 10 - 5;
        this.color = this.getRandomColor();
        this.shape = Math.random() > 0.5 ? 'rect' : 'circle';
    }

    getRandomColor() {
        const colors = [
            '#ffd700', // Gold
            '#ff6b6b', // Red
            '#4ecdc4', // Teal
            '#45b7d1', // Blue
            '#96ceb4', // Green
            '#ffeaa7', // Yellow
            '#dfe6e9', // White
            '#fd79a8', // Pink
            '#a29bfe', // Purple
            '#00b894'  // Emerald
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.rotation += this.rotationSpeed;
        this.speedY += 0.1; // Gravity
        this.speedX *= 0.99; // Air resistance
    }

    draw() {
        confettiCtx.save();
        confettiCtx.translate(this.x, this.y);
        confettiCtx.rotate((this.rotation * Math.PI) / 180);
        confettiCtx.fillStyle = this.color;
        
        if (this.shape === 'rect') {
            confettiCtx.fillRect(-this.size / 2, -this.size / 4, this.size, this.size / 2);
        } else {
            confettiCtx.beginPath();
            confettiCtx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
            confettiCtx.fill();
        }
        
        confettiCtx.restore();
    }
}

// Start confetti animation
function startConfetti() {
    confettiPieces = [];
    
    // Create initial burst of confetti
    for (let i = 0; i < 150; i++) {
        const piece = new ConfettiPiece();
        piece.y = Math.random() * confettiCanvas.height * 0.3;
        piece.speedY = Math.random() * 8 + 2;
        confettiPieces.push(piece);
    }
    
    animateConfetti();
}

// Animate confetti
function animateConfetti() {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    
    confettiPieces.forEach((piece, index) => {
        piece.update();
        piece.draw();
        
        // Remove pieces that are off screen
        if (piece.y > confettiCanvas.height + 50) {
            confettiPieces.splice(index, 1);
        }
    });
    
    if (confettiPieces.length > 0) {
        confettiAnimationId = requestAnimationFrame(animateConfetti);
    } else {
        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
}

// Stop confetti animation
function stopConfetti() {
    if (confettiAnimationId) {
        cancelAnimationFrame(confettiAnimationId);
        confettiAnimationId = null;
    }
    confettiPieces = [];
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
}

// Show correct answer feedback (confetti + green overlay)
function showCorrectFeedback() {
    // Start confetti
    startConfetti();
    
    // Show green overlay
    feedbackOverlay.classList.add('correct');
    
    // Remove overlay after 1 second
    setTimeout(() => {
        feedbackOverlay.classList.remove('correct');
    }, 1000);
    
    // Stop confetti after 2 seconds
    setTimeout(() => {
        stopConfetti();
    }, 2000);
}

// Show incorrect answer feedback (big strike + red overlay)
function showIncorrectFeedback() {
    // Show red overlay
    feedbackOverlay.classList.add('incorrect');
    
    // Show big strike
    bigStrike.classList.add('active');
    
    // Remove effects after 1 second
    setTimeout(() => {
        feedbackOverlay.classList.remove('incorrect');
    }, 1000);
    
    setTimeout(() => {
        bigStrike.classList.remove('active');
    }, 1100);
}

// Show Time's Up display
function showTimesUp() {
    // Show red overlay
    feedbackOverlay.classList.add('incorrect');
    
    // Show Time's Up display
    timesUpDisplay.classList.add('active');
    
    // Remove effects after 4 seconds
    setTimeout(() => {
        feedbackOverlay.classList.remove('incorrect');
    }, 1000);
    
    setTimeout(() => {
        timesUpDisplay.classList.remove('active');
    }, 4000);
}

// Login Screen Elements
const loginScreen = document.getElementById('login-screen');
const passwordInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

// Tutorial Screen Elements
const tutorialScreen = document.getElementById('tutorial-screen');
const continueToSetupBtn = document.getElementById('continue-to-setup-btn');
const videoDropdownToggle = document.getElementById('video-dropdown-toggle');
const videoDropdownContent = document.getElementById('video-dropdown-content');
const videoDropdownArrow = document.getElementById('video-dropdown-arrow');
const tutorialVideoIframe = document.getElementById('tutorial-video-iframe');
const backToTutorialBtn = document.getElementById('back-to-tutorial-btn');
const helpBtn = document.getElementById('help-btn');

// Host Password
const HOST_PASSWORD = '654-SteveHarveyIsCool!-321';

// Setup Screen Elements
const setupScreen = document.getElementById('setup-screen');
const gameContainer = document.getElementById('game-container');
const team1NameInput = document.getElementById('team1-name-input');
const team2NameInput = document.getElementById('team2-name-input');
const roundBtns = document.querySelectorAll('.round-btn');
const customRoundsInput = document.getElementById('custom-rounds-input');
const startGameBtn = document.getElementById('start-game-btn');

// Game Display Elements
const team1DisplayName = document.getElementById('team1-display-name');
const team2DisplayName = document.getElementById('team2-display-name');
const currentRoundEl = document.getElementById('current-round');
const totalRoundsEl = document.getElementById('total-rounds');
const teamSelectOption1 = document.getElementById('team-select-option1');
const teamSelectOption2 = document.getElementById('team-select-option2');

// End Screen Elements
const endScreen = document.getElementById('end-screen');
const winnerText = document.getElementById('winner-text');
const finalTeam1Name = document.getElementById('final-team1-name');
const finalTeam2Name = document.getElementById('final-team2-name');
const finalTeam1Score = document.getElementById('final-team1-score');
const finalTeam2Score = document.getElementById('final-team2-score');
const playAgainBtn = document.getElementById('play-again-btn');

// Buttons
const newQuestionBtn = document.getElementById('new-question-btn');
const revealAnswerBtn = document.getElementById('reveal-answer-btn');
const addStrikeBtn = document.getElementById('add-strike-btn');
const removeStrikeBtn = document.getElementById('remove-strike-btn');
const addPointsBtn = document.getElementById('add-points-btn');
const resetRoundBtn = document.getElementById('reset-round-btn');
const resetGameBtn = document.getElementById('reset-game-btn');
const endGameBtn = document.getElementById('end-game-btn');

// Host Panel Elements
const hostPanel = document.getElementById('host-panel');
const hostToggleBtn = document.getElementById('host-toggle-btn');

// Answer Panel Elements
const answerPanel = document.getElementById('answer-panel');
const answerToggleBtn = document.getElementById('answer-toggle-btn');

// Fullscreen Button
const fullscreenBtn = document.getElementById('fullscreen-btn');
const fullscreenIcon = document.getElementById('fullscreen-icon');

// Timer Elements
const timerDisplay = document.getElementById('timer-display');
const timerSecondsInput = document.getElementById('timer-seconds');
const timerStartBtn = document.getElementById('timer-start-btn');
const timerPauseBtn = document.getElementById('timer-pause-btn');
const timerResetBtn = document.getElementById('timer-reset-btn');

// Mobile Timer Elements
const timerToggleBtn = document.getElementById('timer-toggle-btn');
const mobileTimerPanel = document.getElementById('mobile-timer-panel');
const mobileTimerDisplay = document.getElementById('mobile-timer-display');
const mobileTimerSecondsInput = document.getElementById('mobile-timer-seconds');
const mobileTimerStartBtn = document.getElementById('mobile-timer-start-btn');
const mobileTimerPauseBtn = document.getElementById('mobile-timer-pause-btn');
const mobileTimerResetBtn = document.getElementById('mobile-timer-reset-btn');

// Timer State
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;

// Entry Log Elements
const entryLogList = document.getElementById('entry-log-list');
const clearLogBtn = document.getElementById('clear-log-btn');

// Mobile Entry Log Elements
const entryLogToggleBtn = document.getElementById('entry-log-toggle-btn');
const mobileEntryLogPanel = document.getElementById('mobile-entry-log-panel');
const mobileEntryLogList = document.getElementById('mobile-entry-log-list');
const mobileClearLogBtn = document.getElementById('mobile-clear-log-btn');

// Entry Log State
let entryLog = [];

// Initialize
async function init() {
    // Load questions from CSV first
    await loadQuestionsFromCSV();
    
    // Login screen event listeners
    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
    
    // Tutorial screen event listener
    continueToSetupBtn.addEventListener('click', handleContinueFromTutorial);
    
    // Video dropdown toggle
    videoDropdownToggle.addEventListener('click', toggleVideoDropdown);
    
    // Back to tutorial button (setup screen)
    backToTutorialBtn.addEventListener('click', goBackToTutorial);
    
    // Help button (global tutorial access)
    helpBtn.addEventListener('click', openTutorialOverlay);
    
    // Setup screen event listeners
    setupRoundButtons();
    startGameBtn.addEventListener('click', startGame);
    playAgainBtn.addEventListener('click', playAgain);
    
    // Allow Enter key to start game from setup
    [team1NameInput, team2NameInput, customRoundsInput].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                startGame();
            }
        });
    });
    
    // Add click handlers to answer slots for direct reveal
    answerSlots.forEach((slot, index) => {
        slot.addEventListener('click', () => {
            if (currentQuestion && !revealedAnswers.includes(index)) {
                revealAnswer(index);
            }
        });
    });

    // Button event listeners
    newQuestionBtn.addEventListener('click', loadNewQuestion);
    revealAnswerBtn.addEventListener('click', revealNextAnswer);
    addStrikeBtn.addEventListener('click', addStrike);
    removeStrikeBtn.addEventListener('click', removeStrike);
    addPointsBtn.addEventListener('click', addPoints);
    resetRoundBtn.addEventListener('click', resetRound);
    resetGameBtn.addEventListener('click', resetGame);
    endGameBtn.addEventListener('click', endGameEarly);
    checkAnswerBtn.addEventListener('click', checkPlayerAnswer);
    
    // Timer event listeners
    timerStartBtn.addEventListener('click', startTimer);
    timerPauseBtn.addEventListener('click', pauseTimer);
    timerResetBtn.addEventListener('click', resetTimer);
    
    // Mobile timer event listeners
    timerToggleBtn.addEventListener('click', toggleTimerPanel);
    mobileTimerStartBtn.addEventListener('click', startTimer);
    mobileTimerPauseBtn.addEventListener('click', pauseTimer);
    mobileTimerResetBtn.addEventListener('click', resetTimer);
    
    // Sync timer inputs between desktop and mobile
    timerSecondsInput.addEventListener('change', syncTimerInputs);
    mobileTimerSecondsInput.addEventListener('change', syncTimerInputs);
    
    // Entry log event listener
    clearLogBtn.addEventListener('click', clearEntryLog);
    
    // Host panel toggle event listener
    hostToggleBtn.addEventListener('click', toggleHostPanel);
    
    // Answer panel toggle event listener
    answerToggleBtn.addEventListener('click', toggleAnswerPanel);
    
    // Entry log panel toggle event listener
    entryLogToggleBtn.addEventListener('click', toggleEntryLogPanel);
    mobileClearLogBtn.addEventListener('click', clearEntryLog);
    
    // Fullscreen toggle event listener
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', updateFullscreenIcon);
    
    // Handle orientation changes (for mobile timer toggle)
    window.addEventListener('orientationchange', handleOrientationChange);
    window.matchMedia('(orientation: landscape)').addEventListener('change', handleOrientationChange);
    
    // Allow Enter key to submit answer
    playerAnswerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            checkPlayerAnswer();
        }
    });
}

// Check if we're on mobile portrait (where timer/entry log toggle buttons should be visible)
function isMobilePortrait() {
    const isPortrait = window.matchMedia('(orientation: portrait)').matches;
    const isMobileWidth = window.matchMedia('(max-width: 768px)').matches;
    return isPortrait && isMobileWidth;
}

// Show timer and entry log toggle buttons only on mobile portrait
function showMobileToggleButtons() {
    hostToggleBtn.style.display = 'flex';
    answerToggleBtn.style.display = 'flex';
    
    // Only show timer/entry log toggle buttons on mobile portrait
    if (isMobilePortrait()) {
        timerToggleBtn.style.display = 'flex';
        entryLogToggleBtn.style.display = 'flex';
    } else {
        // On desktop or landscape, keep them hidden (CSS default)
        timerToggleBtn.style.display = '';
        entryLogToggleBtn.style.display = '';
    }
}

// Handle orientation change - reset all panels in landscape
function handleOrientationChange() {
    const isLandscape = window.matchMedia('(orientation: landscape)').matches;
    
    if (isLandscape) {
        // Close host panel when switching to landscape
        hostPanel.style.display = 'none';
        hostToggleBtn.classList.remove('active');
        
        // Close answer panel when switching to landscape
        answerPanel.style.display = 'none';
        answerToggleBtn.classList.remove('active');
        
        // Close mobile timer panel when switching to landscape
        mobileTimerPanel.classList.remove('visible');
        mobileTimerPanel.style.display = 'none';
        timerToggleBtn.classList.remove('active');
        
        // Close mobile entry log panel when switching to landscape
        mobileEntryLogPanel.classList.remove('visible');
        mobileEntryLogPanel.style.display = 'none';
        entryLogToggleBtn.classList.remove('active');
    }
    
    // Show appropriate toggle buttons based on screen size/orientation
    showMobileToggleButtons();
}

// Handle Login
function handleLogin() {
    const enteredPassword = passwordInput.value;
    
    if (enteredPassword === HOST_PASSWORD) {
        // Correct password - show tutorial screen
        loginScreen.style.display = 'none';
        tutorialScreen.style.display = 'flex';
        loginError.classList.remove('show');
        passwordInput.value = '';
    } else {
        // Wrong password - show error
        loginError.textContent = 'Incorrect password. Please try again.';
        loginError.classList.add('show');
        passwordInput.value = '';
        passwordInput.focus();
    }
}

// Toggle Video Dropdown
function toggleVideoDropdown() {
    const isOpen = videoDropdownContent.classList.contains('open');
    
    if (isOpen) {
        // Close dropdown and stop video
        videoDropdownContent.classList.remove('open');
        videoDropdownArrow.classList.remove('open');
        tutorialVideoIframe.src = ''; // Stop the video
    } else {
        // Open dropdown and load video
        videoDropdownContent.classList.add('open');
        videoDropdownArrow.classList.add('open');
        tutorialVideoIframe.src = tutorialVideoIframe.dataset.src; // Load the video
    }
}

// Continue to Setup from Tutorial
function continueToSetup() {
    // Close video dropdown and stop video if open
    closeTutorialVideo();
    tutorialScreen.style.display = 'none';
    setupScreen.style.display = 'flex';
}

// Go back to Tutorial from Setup
function goBackToTutorial() {
    setupScreen.style.display = 'none';
    tutorialScreen.style.display = 'flex';
}

// Open Tutorial Overlay (from anywhere)
let previousScreen = null;

function openTutorialOverlay() {
    // Store which screen was visible before
    if (loginScreen.style.display !== 'none' && loginScreen.style.display !== '') {
        // Don't open tutorial from login screen
        return;
    }
    
    if (tutorialScreen.style.display === 'flex') {
        // Already on tutorial, do nothing
        return;
    }
    
    // Determine which screen is currently visible
    if (setupScreen.style.display === 'flex') {
        previousScreen = 'setup';
    } else if (gameContainer.style.display !== 'none' && gameContainer.style.display !== '') {
        previousScreen = 'game';
    } else if (endScreen.style.display === 'flex') {
        previousScreen = 'end';
    } else {
        previousScreen = null;
    }
    
    // Hide all screens
    setupScreen.style.display = 'none';
    gameContainer.style.display = 'none';
    endScreen.style.display = 'none';
    
    // Show tutorial
    tutorialScreen.style.display = 'flex';
    
    // Change continue button behavior to go back to previous screen
    continueToSetupBtn.textContent = previousScreen ? 'BACK TO GAME' : 'LET\'S PLAY! 🎉';
}

// Close tutorial video helper
function closeTutorialVideo() {
    if (videoDropdownContent.classList.contains('open')) {
        videoDropdownContent.classList.remove('open');
        videoDropdownArrow.classList.remove('open');
        tutorialVideoIframe.src = '';
    }
}

// Modified continue function to handle returning to previous screen
function handleContinueFromTutorial() {
    closeTutorialVideo();
    tutorialScreen.style.display = 'none';
    
    if (previousScreen === 'setup') {
        setupScreen.style.display = 'flex';
    } else if (previousScreen === 'game') {
        gameContainer.style.display = 'block';
    } else if (previousScreen === 'end') {
        endScreen.style.display = 'flex';
    } else {
        setupScreen.style.display = 'flex';
    }
    
    // Reset button text and previous screen tracker
    continueToSetupBtn.textContent = 'LET\'S PLAY! 🎉';
    previousScreen = null;
}

// Setup round selection buttons
function setupRoundButtons() {
    roundBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove selected class from all buttons
            roundBtns.forEach(b => b.classList.remove('selected'));
            // Add selected class to clicked button
            btn.classList.add('selected');
            // Clear custom input
            customRoundsInput.value = '';
        });
    });
    
    // Custom rounds input - deselect preset buttons when typing
    customRoundsInput.addEventListener('input', () => {
        if (customRoundsInput.value) {
            roundBtns.forEach(b => b.classList.remove('selected'));
        }
    });
}

// Start the game from setup screen
function startGame() {
    // Get team names (use defaults if empty)
    team1Name = team1NameInput.value.trim().toUpperCase() || 'TEAM 1';
    team2Name = team2NameInput.value.trim().toUpperCase() || 'TEAM 2';
    
    // Get number of rounds
    const customRounds = parseInt(customRoundsInput.value);
    if (customRounds && customRounds > 0) {
        totalRounds = Math.min(customRounds, 50); // Cap at 50 rounds
    } else {
        // Find selected preset button
        const selectedBtn = document.querySelector('.round-btn.selected');
        if (selectedBtn) {
            totalRounds = parseInt(selectedBtn.dataset.rounds);
        }
    }
    
    // Reset game state
    currentRound = 1;
    usedQuestionIndices = [];
    team1Score = 0;
    team2Score = 0;
    
    // Update UI with team names
    team1DisplayName.textContent = team1Name;
    team2DisplayName.textContent = team2Name;
    teamSelectOption1.textContent = team1Name;
    teamSelectOption2.textContent = team2Name;
    
    // Update round display
    currentRoundEl.textContent = currentRound;
    totalRoundsEl.textContent = totalRounds;
    
    // Update scores display
    team1ScoreEl.textContent = 0;
    team2ScoreEl.textContent = 0;
    
    // Hide setup screen, show game
    setupScreen.style.display = 'none';
    gameContainer.style.display = 'block';
    
    // Load first question
    loadNewQuestion();
}

// End game early (from button)
function endGameEarly() {
    if (confirm('Are you sure you want to end the game now? This will show the final results.')) {
        showEndScreen();
    }
}

// Show end game screen
function showEndScreen() {
    // Determine winner
    const isTie = team1Score === team2Score;
    const team1Wins = team1Score > team2Score;
    
    // Update winner text
    if (isTie) {
        winnerText.textContent = "IT'S A TIE!";
        winnerText.classList.add('tie');
    } else {
        const winnerName = team1Wins ? team1Name : team2Name;
        winnerText.textContent = `${winnerName} WINS!`;
        winnerText.classList.remove('tie');
    }
    
    // Update team names and scores
    finalTeam1Name.textContent = team1Name;
    finalTeam2Name.textContent = team2Name;
    finalTeam1Score.textContent = team1Score;
    finalTeam2Score.textContent = team2Score;
    
    // Highlight winner's card
    const team1Card = document.querySelector('.team-1-final');
    const team2Card = document.querySelector('.team-2-final');
    team1Card.classList.remove('winner');
    team2Card.classList.remove('winner');
    
    if (!isTie) {
        if (team1Wins) {
            team1Card.classList.add('winner');
        } else {
            team2Card.classList.add('winner');
        }
    }
    
    // Hide game, show end screen
    gameContainer.style.display = 'none';
    endScreen.style.display = 'flex';
    
    // Start celebratory confetti for winner (not for tie)
    if (!isTie) {
        startConfetti();
        setTimeout(() => {
            stopConfetti();
        }, 3000);
    }
}

// Play again - return to setup screen
function playAgain() {
    // Hide end screen
    endScreen.style.display = 'none';
    
    // Reset game state
    currentQuestion = null;
    questionText.textContent = 'Click "New Question" to start';
    team1Score = 0;
    team2Score = 0;
    currentRound = 1;
    usedQuestionIndices = [];
    
    // Reset UI
    team1ScoreEl.textContent = 0;
    team2ScoreEl.textContent = 0;
    
    // Reset answer slots
    answerSlots.forEach(slot => {
        slot.classList.remove('revealed');
        const answerTextEl = slot.querySelector('.answer-text');
        const answerPointsEl = slot.querySelector('.answer-points');
        answerTextEl.textContent = '?';
        answerPointsEl.textContent = '';
    });
    
    // Reset strikes
    strikes = 0;
    updateStrikes();
    
    // Show setup screen
    setupScreen.style.display = 'flex';
}

// Timer Functions
function startTimer() {
    if (timerRunning) return;
    
    // Get seconds from input if timer is at 0 (inputs are synced, use desktop as source)
    if (timerSeconds === 0) {
        timerSeconds = parseInt(timerSecondsInput.value) || 30;
    }
    
    timerRunning = true;
    updateTimerDisplay();
    
    timerInterval = setInterval(() => {
        timerSeconds--;
        updateTimerDisplay();
        
        if (timerSeconds <= 0) {
            pauseTimer();
            timerDisplay.classList.remove('running', 'warning');
            timerDisplay.classList.add('danger');
            mobileTimerDisplay.classList.remove('running', 'warning');
            mobileTimerDisplay.classList.add('danger');
            // Show Time's Up display
            showTimesUp();
        }
    }, 1000);
}

function pauseTimer() {
    timerRunning = false;
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    timerDisplay.classList.remove('running');
    mobileTimerDisplay.classList.remove('running');
}

function resetTimer() {
    pauseTimer();
    // Get value from timer input (inputs are synced, use desktop as source)
    timerSeconds = parseInt(timerSecondsInput.value) || 30;
    
    timerDisplay.classList.remove('running', 'warning', 'danger');
    mobileTimerDisplay.classList.remove('running', 'warning', 'danger');
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    const timeText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Update both displays
    timerDisplay.textContent = timeText;
    mobileTimerDisplay.textContent = timeText;
    
    // Update display color based on time remaining
    timerDisplay.classList.remove('running', 'warning', 'danger');
    mobileTimerDisplay.classList.remove('running', 'warning', 'danger');
    
    if (timerRunning) {
        if (timerSeconds <= 5) {
            timerDisplay.classList.add('danger');
            mobileTimerDisplay.classList.add('danger');
        } else if (timerSeconds <= 10) {
            timerDisplay.classList.add('warning');
            mobileTimerDisplay.classList.add('warning');
        } else {
            timerDisplay.classList.add('running');
            mobileTimerDisplay.classList.add('running');
        }
    }
}

// Sync timer inputs between desktop and mobile
function syncTimerInputs(e) {
    const value = e.target.value;
    timerSecondsInput.value = value;
    mobileTimerSecondsInput.value = value;
}

// Toggle Timer Panel (Mobile)
function toggleTimerPanel() {
    const isVisible = mobileTimerPanel.classList.contains('visible');
    
    if (isVisible) {
        // Hide timer panel, show other buttons
        mobileTimerPanel.classList.remove('visible');
        mobileTimerPanel.style.display = 'none';
        timerToggleBtn.classList.remove('active');
        showMobileToggleButtons();
    } else {
        // Show timer panel, hide other buttons
        mobileTimerPanel.classList.add('visible');
        mobileTimerPanel.style.display = 'block';
        timerToggleBtn.classList.add('active');
        hostToggleBtn.style.display = 'none';
        entryLogToggleBtn.style.display = 'none';
        answerToggleBtn.style.display = 'none';
        
        // Also close other panels if open
        hostPanel.style.display = 'none';
        hostToggleBtn.classList.remove('active');
        answerPanel.style.display = 'none';
        answerToggleBtn.classList.remove('active');
        mobileEntryLogPanel.classList.remove('visible');
        mobileEntryLogPanel.style.display = 'none';
        entryLogToggleBtn.classList.remove('active');
        
        // Sync the mobile input with current timer state
        mobileTimerSecondsInput.value = timerSecondsInput.value;
        
        // Update the display to show current time
        updateTimerDisplay();
    }
}

// Entry Log Functions
function addEntryToLog(entry, isCorrect) {
    // Add to log array
    entryLog.push({ entry, isCorrect, timestamp: new Date() });
    
    // Update display
    renderEntryLog();
}

function renderEntryLog() {
    const logHTML = entryLog.length === 0 
        ? '<div class="entry-log-empty">No entries yet</div>'
        : entryLog.map((item, index) => `
            <div class="entry-log-item ${item.isCorrect ? 'correct' : 'incorrect'}">
                <span class="entry-icon">${item.isCorrect ? '✓' : '✗'}</span>
                <span class="entry-text">${escapeHtml(item.entry)}</span>
            </div>
        `).join('');
    
    // Update both desktop and mobile entry log lists
    entryLogList.innerHTML = logHTML;
    mobileEntryLogList.innerHTML = logHTML;
    
    // Scroll both lists to bottom to show latest entry
    entryLogList.scrollTop = entryLogList.scrollHeight;
    mobileEntryLogList.scrollTop = mobileEntryLogList.scrollHeight;
}

function clearEntryLog() {
    entryLog = [];
    renderEntryLog();
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Toggle Host Panel
function toggleHostPanel() {
    const isVisible = hostPanel.style.display !== 'none';
    
    if (isVisible) {
        // Hide host panel, show other buttons
        hostPanel.style.display = 'none';
        hostToggleBtn.classList.remove('active');
        showMobileToggleButtons();
    } else {
        // Show host panel, hide other buttons
        hostPanel.style.display = 'block';
        hostToggleBtn.classList.add('active');
        timerToggleBtn.style.display = 'none';
        entryLogToggleBtn.style.display = 'none';
        answerToggleBtn.style.display = 'none';
        
        // Also close other panels if open
        answerPanel.style.display = 'none';
        answerToggleBtn.classList.remove('active');
        mobileTimerPanel.classList.remove('visible');
        mobileTimerPanel.style.display = 'none';
        timerToggleBtn.classList.remove('active');
        mobileEntryLogPanel.classList.remove('visible');
        mobileEntryLogPanel.style.display = 'none';
        entryLogToggleBtn.classList.remove('active');
    }
}

// Toggle Answer Panel
function toggleAnswerPanel() {
    const isVisible = answerPanel.style.display !== 'none';
    
    if (isVisible) {
        // Hide answer panel, show other buttons
        answerPanel.style.display = 'none';
        answerToggleBtn.classList.remove('active');
        showMobileToggleButtons();
    } else {
        // Show answer panel, hide other buttons
        answerPanel.style.display = 'block';
        answerToggleBtn.classList.add('active');
        hostToggleBtn.style.display = 'none';
        timerToggleBtn.style.display = 'none';
        entryLogToggleBtn.style.display = 'none';
        
        // Also close other panels if open
        hostPanel.style.display = 'none';
        hostToggleBtn.classList.remove('active');
        mobileTimerPanel.classList.remove('visible');
        mobileTimerPanel.style.display = 'none';
        timerToggleBtn.classList.remove('active');
        mobileEntryLogPanel.classList.remove('visible');
        mobileEntryLogPanel.style.display = 'none';
        entryLogToggleBtn.classList.remove('active');
        
        // Scroll to the answer panel
        setTimeout(() => {
            answerPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
}

// Toggle Entry Log Panel (Mobile)
function toggleEntryLogPanel() {
    const isVisible = mobileEntryLogPanel.classList.contains('visible');
    
    if (isVisible) {
        // Hide entry log panel, show other buttons
        mobileEntryLogPanel.classList.remove('visible');
        mobileEntryLogPanel.style.display = 'none';
        entryLogToggleBtn.classList.remove('active');
        showMobileToggleButtons();
    } else {
        // Show entry log panel, hide other buttons
        mobileEntryLogPanel.classList.add('visible');
        mobileEntryLogPanel.style.display = 'block';
        entryLogToggleBtn.classList.add('active');
        hostToggleBtn.style.display = 'none';
        timerToggleBtn.style.display = 'none';
        answerToggleBtn.style.display = 'none';
        
        // Also close other panels if open
        hostPanel.style.display = 'none';
        hostToggleBtn.classList.remove('active');
        answerPanel.style.display = 'none';
        answerToggleBtn.classList.remove('active');
        mobileTimerPanel.classList.remove('visible');
        mobileTimerPanel.style.display = 'none';
        timerToggleBtn.classList.remove('active');
        
        // Update the entry log display
        renderEntryLog();
    }
}

// Toggle Fullscreen
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        // Enter fullscreen
        document.documentElement.requestFullscreen().catch(err => {
            console.log('Error attempting to enable fullscreen:', err);
        });
    } else {
        // Exit fullscreen
        document.exitFullscreen();
    }
}

// Update fullscreen icon based on state
function updateFullscreenIcon() {
    if (document.fullscreenElement) {
        fullscreenIcon.textContent = '⛶'; // Exit fullscreen icon
    } else {
        fullscreenIcon.textContent = '⛶'; // Enter fullscreen icon
    }
}

// Check player answer using ChatGPT via backend
async function checkPlayerAnswer() {
    if (!currentQuestion) {
        checkStatus.textContent = 'Please load a question first!';
        checkStatus.className = 'check-status error';
        setTimeout(() => {
            checkStatus.textContent = '';
            checkStatus.className = 'check-status';
        }, 2000);
        return;
    }
    
    const playerAnswer = playerAnswerInput.value.trim();
    if (!playerAnswer) {
        checkStatus.textContent = 'Please enter an answer!';
        checkStatus.className = 'check-status error';
        setTimeout(() => {
            checkStatus.textContent = '';
            checkStatus.className = 'check-status';
        }, 2000);
        return;
    }
    
    // Get all answers on the board (including revealed ones)
    const allAnswers = currentQuestion.answers.map(a => a.text);
    
    // Show checking status
    checkStatus.textContent = 'Checking answer...';
    checkStatus.className = 'check-status checking';
    checkAnswerBtn.disabled = true;
    
    try {
        // Call backend API
        const response = await fetch('/api/check-answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: currentQuestion.question,
                answers: allAnswers,
                playerAnswer: playerAnswer
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'API request failed');
        }
        
        const jsonResponse = await response.json();
        
        // Process the result
        if (jsonResponse.match && jsonResponse.matchedAnswer) {
            // Find the matching answer index
            const matchedAnswerText = jsonResponse.matchedAnswer;
            const matchedIndex = currentQuestion.answers.findIndex(
                ans => ans.text.toLowerCase() === matchedAnswerText.toLowerCase()
            );
            
            if (matchedIndex !== -1 && !revealedAnswers.includes(matchedIndex)) {
                // Show correct feedback (confetti + green overlay)
                showCorrectFeedback();
                
                // Log the correct entry
                addEntryToLog(playerAnswer, true);
                
                // Reveal the matching answer
                revealAnswer(matchedIndex);
                checkStatus.textContent = `Match! Revealed: "${matchedAnswerText}"`;
                checkStatus.className = 'check-status match';
                
                // Add points to accumulated round total
                const points = currentQuestion.answers[matchedIndex].points;
                roundPointsEarned += points;
                pointsInput.value = roundPointsEarned;
            } else if (matchedIndex !== -1) {
                // Already revealed - still log as correct but note it
                addEntryToLog(playerAnswer, true);
                checkStatus.textContent = `Match found, but "${matchedAnswerText}" is already revealed!`;
                checkStatus.className = 'check-status match';
            } else {
                // Match found but answer not on board (shouldn't happen, but handle it)
                addEntryToLog(playerAnswer, false);
                checkStatus.textContent = 'Match found but answer not on board';
                checkStatus.className = 'check-status error';
            }
        } else {
            // Show incorrect feedback (big strike + red overlay)
            showIncorrectFeedback();
            
            // Log the incorrect entry
            addEntryToLog(playerAnswer, false);
            
            // No match - add a strike
            addStrike();
            checkStatus.textContent = `No match! Strike added. Reason: ${jsonResponse.reason || 'Answer not found on board'}`;
            checkStatus.className = 'check-status no-match';
        }
        
        // Clear the input
        playerAnswerInput.value = '';
        
    } catch (error) {
        console.error('Error checking answer:', error);
        checkStatus.textContent = `Error: ${error.message}`;
        checkStatus.className = 'check-status error';
    } finally {
        checkAnswerBtn.disabled = false;
        
        // Clear status after 5 seconds
        setTimeout(() => {
            checkStatus.textContent = '';
            checkStatus.className = 'check-status';
        }, 5000);
    }
}

// Load a new question
function loadNewQuestion() {
    if (gameData.length === 0) {
        alert('No questions loaded. Please make sure questions.csv exists and is properly formatted.');
        return;
    }
    
    // Check if we've reached the round limit
    if (currentQuestion !== null && currentRound >= totalRounds) {
        // Game over - show end screen
        showEndScreen();
        return;
    }
    
    // Increment round if not first question
    if (currentQuestion !== null) {
        currentRound++;
        currentRoundEl.textContent = currentRound;
    }
    
    // Get available question indices (not yet used)
    let availableIndices = [];
    for (let i = 0; i < gameData.length; i++) {
        if (!usedQuestionIndices.includes(i)) {
            availableIndices.push(i);
        }
    }
    
    // If all questions used, reset the pool
    if (availableIndices.length === 0) {
        usedQuestionIndices = [];
        availableIndices = gameData.map((_, i) => i);
    }
    
    // Select a random question from available
    const randomAvailableIndex = Math.floor(Math.random() * availableIndices.length);
    const questionIndex = availableIndices[randomAvailableIndex];
    usedQuestionIndices.push(questionIndex);
    
    currentQuestion = JSON.parse(JSON.stringify(gameData[questionIndex])); // Deep copy
    
    // Reset round state
    revealedAnswers = [];
    strikes = 0;
    currentRevealIndex = 0;
    roundPointsEarned = 0;
    
    // Update question display
    questionText.textContent = currentQuestion.question;
    
    // Reset answer slots
    answerSlots.forEach((slot, index) => {
        slot.classList.remove('revealed');
        const answerTextEl = slot.querySelector('.answer-text');
        const answerPointsEl = slot.querySelector('.answer-points');
        
        if (index < currentQuestion.answers.length) {
            answerTextEl.textContent = '?';
            answerPointsEl.textContent = '';
        } else {
            answerTextEl.textContent = '';
            answerPointsEl.textContent = '';
        }
    });
    
    // Reset strikes
    updateStrikes();
    
    // Clear answer input, status, and entry log
    playerAnswerInput.value = '';
    checkStatus.textContent = '';
    checkStatus.className = 'check-status';
    clearEntryLog();
    
    // Sort answers by points (highest first) for display
    currentQuestion.answers.sort((a, b) => b.points - a.points);
}

// Reveal next answer in order
function revealNextAnswer() {
    if (!currentQuestion) {
        alert('Please load a question first!');
        return;
    }
    
    if (currentRevealIndex >= currentQuestion.answers.length) {
        alert('All answers have been revealed!');
        return;
    }
    
    revealAnswer(currentRevealIndex);
    currentRevealIndex++;
}

// Reveal a specific answer
function revealAnswer(index) {
    if (!currentQuestion || index >= currentQuestion.answers.length) {
        return;
    }
    
    if (revealedAnswers.includes(index)) {
        return; // Already revealed
    }
    
    const answer = currentQuestion.answers[index];
    const slot = answerSlots[index];
    const answerTextEl = slot.querySelector('.answer-text');
    const answerPointsEl = slot.querySelector('.answer-points');
    
    // Reveal the answer
    answerTextEl.textContent = answer.text;
    answerPointsEl.textContent = answer.points;
    slot.classList.add('revealed');
    revealedAnswers.push(index);
    
    // Play reveal sound effect (optional - you can add audio files)
    // playSound('reveal');
}

// Add strike
function addStrike() {
    if (strikes < 3) {
        strikes++;
        updateStrikes();
    }
}

// Remove strike
function removeStrike() {
    if (strikes > 0) {
        strikes--;
        updateStrikes();
    }
}

// Update strikes display
function updateStrikes() {
    strikesDisplay.forEach((strike, index) => {
        if (index < strikes) {
            strike.classList.add('active');
        } else {
            strike.classList.remove('active');
        }
    });
}

// Add points to a team
function addPoints() {
    const points = parseInt(pointsInput.value) || 0;
    const team = parseInt(teamSelect.value);
    
    if (points <= 0) {
        alert('Please enter a valid number of points!');
        return;
    }
    
    if (team === 1) {
        team1Score += points;
        team1ScoreEl.textContent = team1Score;
    } else {
        team2Score += points;
        team2ScoreEl.textContent = team2Score;
    }
    
    // Animate score update
    const scoreEl = team === 1 ? team1ScoreEl : team2ScoreEl;
    scoreEl.style.transform = 'scale(1.2)';
    setTimeout(() => {
        scoreEl.style.transform = 'scale(1)';
    }, 300);
    
    pointsInput.value = 0;
}

// Reset current round
function resetRound() {
    if (!currentQuestion) {
        return;
    }
    
    revealedAnswers = [];
    strikes = 0;
    currentRevealIndex = 0;
    roundPointsEarned = 0;
    pointsInput.value = 0;
    
    // Hide all answers
    answerSlots.forEach((slot, index) => {
        slot.classList.remove('revealed');
        const answerTextEl = slot.querySelector('.answer-text');
        const answerPointsEl = slot.querySelector('.answer-points');
        
        if (index < currentQuestion.answers.length) {
            answerTextEl.textContent = '?';
            answerPointsEl.textContent = '';
        }
    });
    
    updateStrikes();
    
    // Clear answer input, status, and entry log
    playerAnswerInput.value = '';
    checkStatus.textContent = '';
    checkStatus.className = 'check-status';
    clearEntryLog();
}

// Reset entire game
function resetGame() {
    if (confirm('Are you sure you want to reset the entire game? All scores will be lost.')) {
        team1Score = 0;
        team2Score = 0;
        team1ScoreEl.textContent = 0;
        team2ScoreEl.textContent = 0;
        
        currentQuestion = null;
        questionText.textContent = 'Click "New Question" to start';
        
        // Reset round tracking
        currentRound = 1;
        usedQuestionIndices = [];
        currentRoundEl.textContent = currentRound;
        
        // Return to setup screen
        setupScreen.style.display = 'flex';
        gameContainer.style.display = 'none';
        
        resetRound();
    }
}

// Keyboard shortcuts for host convenience
document.addEventListener('keydown', (e) => {
    // Prevent shortcuts when typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        return;
    }
    
    switch(e.key) {
        case 'n':
        case 'N':
            loadNewQuestion();
            break;
        case 'r':
        case 'R':
            revealNextAnswer();
            break;
        case 's':
        case 'S':
            addStrike();
            break;
        case 'a':
        case 'A':
            addPoints();
            break;
        case 'Escape':
            resetRound();
            break;
    }
});

// Initialize the game
init();

// Display welcome message
console.log('Family Feud Host Control Panel Ready!');
console.log('Keyboard Shortcuts:');
console.log('N - New Question');
console.log('R - Reveal Answer');
console.log('S - Add Strike');
console.log('A - Add Points');
console.log('ESC - Reset Round');

