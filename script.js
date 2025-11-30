// Game State
let currentQuestion = null;
let revealedAnswers = [];
let strikes = 0;
let team1Score = 0;
let team2Score = 0;
let currentRevealIndex = 0;
let gameData = []; // Will be loaded from CSV

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

// Buttons
const newQuestionBtn = document.getElementById('new-question-btn');
const revealAnswerBtn = document.getElementById('reveal-answer-btn');
const addStrikeBtn = document.getElementById('add-strike-btn');
const removeStrikeBtn = document.getElementById('remove-strike-btn');
const addPointsBtn = document.getElementById('add-points-btn');
const resetRoundBtn = document.getElementById('reset-round-btn');
const resetGameBtn = document.getElementById('reset-game-btn');

// Initialize
async function init() {
    // Load questions from CSV first
    await loadQuestionsFromCSV();
    
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
    checkAnswerBtn.addEventListener('click', checkPlayerAnswer);
    
    // Allow Enter key to submit answer
    playerAnswerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            checkPlayerAnswer();
        }
    });
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
                
                // Reveal the matching answer
                revealAnswer(matchedIndex);
                checkStatus.textContent = `Match! Revealed: "${matchedAnswerText}"`;
                checkStatus.className = 'check-status match';
                
                // Add points automatically
                const points = currentQuestion.answers[matchedIndex].points;
                pointsInput.value = points;
            } else if (matchedIndex !== -1) {
                checkStatus.textContent = `Match found, but "${matchedAnswerText}" is already revealed!`;
                checkStatus.className = 'check-status match';
            } else {
                // Match found but answer not on board (shouldn't happen, but handle it)
                checkStatus.textContent = 'Match found but answer not on board';
                checkStatus.className = 'check-status error';
            }
        } else {
            // Show incorrect feedback (big strike + red overlay)
            showIncorrectFeedback();
            
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
    
    // Select a random question
    const randomIndex = Math.floor(Math.random() * gameData.length);
    currentQuestion = JSON.parse(JSON.stringify(gameData[randomIndex])); // Deep copy
    
    // Reset round state
    revealedAnswers = [];
    strikes = 0;
    currentRevealIndex = 0;
    
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
    
    // Clear answer input and status
    playerAnswerInput.value = '';
    checkStatus.textContent = '';
    checkStatus.className = 'check-status';
    
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
    
    // Clear answer input and status
    playerAnswerInput.value = '';
    checkStatus.textContent = '';
    checkStatus.className = 'check-status';
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

