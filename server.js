const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

// Load configuration - support both environment variables (production) and config.json (local dev)
let OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Fallback to config.json for local development
if (!OPENAI_API_KEY) {
    let config = {};
    try {
        const configData = fs.readFileSync('config.json', 'utf8');
        config = JSON.parse(configData);
        OPENAI_API_KEY = config.openai_api_key;
    } catch (error) {
        // config.json doesn't exist or is invalid - this is OK if OPENAI_API_KEY is set via env var
    }
}

// Validate API key
if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_OPENAI_API_KEY_HERE') {
    console.error('Error: OpenAI API key not found.');
    console.error('Please set OPENAI_API_KEY environment variable or create config.json with your API key.');
    console.error('Get your API key from https://platform.openai.com/api-keys');
    process.exit(1);
}

// Use PORT from environment variable (required by hosting platforms) or default to 3000
const PORT = process.env.PORT || 3000;

// Host Password
const HOST_PASSWORD = '654-SteveHarveyIsCool!-321';

// Game rooms storage
const gameRooms = new Map();

// Generate a random room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Create a new game room
function createGameRoom() {
    let roomCode = generateRoomCode();
    // Ensure unique room code
    while (gameRooms.has(roomCode)) {
        roomCode = generateRoomCode();
    }
    
    const room = {
        code: roomCode,
        displaySocketId: null,
        hostSocketId: null,
        createdAt: Date.now(),
        gameState: {
            screen: 'qr', // qr, tutorial, setup, game, end
            team1Name: 'TEAM 1',
            team2Name: 'TEAM 2',
            team1Score: 0,
            team2Score: 0,
            totalRounds: 7,
            currentRound: 1,
            currentQuestion: null,
            revealedAnswers: [],
            strikes: 0,
            timerSeconds: 30,
            timerRunning: false,
            timerCurrentSeconds: 0,
            entryLog: [],
            roundPointsEarned: 0,
            usedQuestionIndices: [],
            correctGuessesThisRound: [],
            lastWinningTeam: 0,
            lastPointsAwarded: 0
        }
    };
    
    gameRooms.set(roomCode, room);
    return room;
}

// Get room by code
function getRoom(roomCode) {
    return gameRooms.get(roomCode);
}

// Serve static files
function serveStaticFile(filePath, res) {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.csv': 'text/csv',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

// Make OpenAI API call
function callOpenAI(question, answers, playerAnswer) {
    return new Promise((resolve, reject) => {
        const prompt = `You are judging a Family Feud game. Given the question and the list of correct answers on the board, determine if the player's answer matches or is close enough to any of the correct answers.

Question: "${question}"

Correct answers on the board:
${answers.map((ans, idx) => `${idx + 1}. ${ans}`).join('\n')}

Player's answer: "${playerAnswer}"

Please respond with ONLY a JSON object in this exact format:
{
  "match": true or false,
  "matchedAnswer": "the exact answer from the board that matches, or empty string if no match",
  "confidence": "high", "medium", or "low",
  "reason": "brief explanation"
}

Be lenient - if the player's answer is essentially the same meaning or a close variation of a correct answer, consider it a match. For example, "car" matches "Car", "automobile" could match "Car", "lipstick" matches "Lipstick", etc.`;

        const postData = JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that judges Family Feud answers. Always respond with valid JSON only.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 200
        });

        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (res.statusCode !== 200) {
                        reject(new Error(response.error?.message || 'API request failed'));
                        return;
                    }
                    resolve(response);
                } catch (error) {
                    reject(new Error('Failed to parse API response'));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

// Create server
const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // API endpoint for checking answers
    if (url.pathname === '/api/check-answer' && req.method === 'POST') {
        let body = '';

        req.on('data', (chunk) => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const { question, answers, playerAnswer } = JSON.parse(body);

                if (!question || !answers || !playerAnswer) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing required fields' }));
                    return;
                }

                const response = await callOpenAI(question, answers, playerAnswer);
                const chatResponse = response.choices[0].message.content.trim();

                // Parse JSON response (handle markdown code blocks if present)
                let jsonResponse;
                try {
                    const cleanedResponse = chatResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    jsonResponse = JSON.parse(cleanedResponse);
                } catch (parseError) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to parse ChatGPT response' }));
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(jsonResponse));
            } catch (error) {
                console.error('Error processing request:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } 
    // API endpoint to create a new game room
    else if (url.pathname === '/api/create-room' && req.method === 'POST') {
        const room = createGameRoom();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ roomCode: room.code }));
    }
    // API endpoint to generate QR code
    else if (url.pathname === '/api/qr-code' && req.method === 'GET') {
        const roomCode = url.searchParams.get('room');
        if (!roomCode) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Room code required' }));
            return;
        }
        
        // Construct the host URL
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host;
        const hostUrl = `${protocol}://${host}/host.html?room=${roomCode}`;
        
        QRCode.toDataURL(hostUrl, { width: 300, margin: 2 }, (err, dataUrl) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to generate QR code' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ qrCode: dataUrl, hostUrl }));
        });
    }
    else {
        // Serve static files
        let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
        filePath = path.join(__dirname, filePath);

        // Security: prevent directory traversal
        if (!filePath.startsWith(__dirname)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('403 Forbidden');
            return;
        }

        serveStaticFile(filePath, res);
    }
});

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Display joins a room
    socket.on('display:join', (roomCode) => {
        const room = getRoom(roomCode);
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }
        
        room.displaySocketId = socket.id;
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.isDisplay = true;
        
        console.log(`Display joined room ${roomCode}`);
        socket.emit('display:joined', { roomCode, gameState: room.gameState });
    });
    
    // Host authenticates and joins a room
    socket.on('host:authenticate', ({ roomCode, password }) => {
        const room = getRoom(roomCode);
        if (!room) {
            socket.emit('host:authResult', { success: false, error: 'Room not found' });
            return;
        }
        
        if (password !== HOST_PASSWORD) {
            socket.emit('host:authResult', { success: false, error: 'Invalid password' });
            return;
        }
        
        // Check if another host is already connected
        if (room.hostSocketId && room.hostSocketId !== socket.id) {
            const existingHostSocket = io.sockets.sockets.get(room.hostSocketId);
            if (existingHostSocket) {
                // Notify the new host that there's an existing host
                socket.emit('host:authResult', { 
                    success: false, 
                    error: 'Another host is already connected',
                    canTakeOver: true 
                });
                return;
            }
        }
        
        room.hostSocketId = socket.id;
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.isHost = true;
        
        console.log(`Host authenticated for room ${roomCode}`);
        socket.emit('host:authResult', { success: true, gameState: room.gameState });
        
        // Notify display that host connected
        io.to(roomCode).emit('host:connected');
    });
    
    // Host takes over from existing host
    socket.on('host:takeOver', ({ roomCode, password }) => {
        const room = getRoom(roomCode);
        if (!room) {
            socket.emit('host:authResult', { success: false, error: 'Room not found' });
            return;
        }
        
        if (password !== HOST_PASSWORD) {
            socket.emit('host:authResult', { success: false, error: 'Invalid password' });
            return;
        }
        
        // Disconnect existing host
        if (room.hostSocketId) {
            const existingHostSocket = io.sockets.sockets.get(room.hostSocketId);
            if (existingHostSocket) {
                existingHostSocket.emit('host:disconnected', { reason: 'Another host took over' });
                existingHostSocket.leave(roomCode);
            }
        }
        
        room.hostSocketId = socket.id;
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.isHost = true;
        
        console.log(`Host took over room ${roomCode}`);
        socket.emit('host:authResult', { success: true, gameState: room.gameState });
        io.to(roomCode).emit('host:connected');
    });
    
    // Navigate to a screen
    socket.on('navigate', ({ screen }) => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState.screen = screen;
        io.to(socket.roomCode).emit('gameState:update', { screen });
    });
    
    // Start game with settings
    socket.on('startGame', ({ team1Name, team2Name, totalRounds }) => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState.team1Name = team1Name || 'TEAM 1';
        room.gameState.team2Name = team2Name || 'TEAM 2';
        room.gameState.totalRounds = totalRounds || 7;
        room.gameState.currentRound = 1;
        room.gameState.team1Score = 0;
        room.gameState.team2Score = 0;
        room.gameState.screen = 'game';
        room.gameState.usedQuestionIndices = [];
        
        io.to(socket.roomCode).emit('game:started', room.gameState);
    });
    
    // Load new question
    socket.on('newQuestion', ({ question, incrementRound = false }) => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState.currentQuestion = question;
        room.gameState.revealedAnswers = [];
        room.gameState.strikes = 0;
        room.gameState.entryLog = [];
        room.gameState.roundPointsEarned = 0;
        room.gameState.correctGuessesThisRound = [];
        room.gameState.lastWinningTeam = 0;
        room.gameState.lastPointsAwarded = 0;
        
        // Only increment round when explicitly requested (from Next Round flow)
        if (incrementRound && room.gameState.currentRound < room.gameState.totalRounds) {
            room.gameState.currentRound++;
        }
        
        io.to(socket.roomCode).emit('question:loaded', {
            question: question,
            currentRound: room.gameState.currentRound,
            totalRounds: room.gameState.totalRounds
        });
    });
    
    // Reveal answer
    socket.on('revealAnswer', ({ index }) => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        if (!room.gameState.revealedAnswers.includes(index)) {
            room.gameState.revealedAnswers.push(index);
        }
        
        io.to(socket.roomCode).emit('answer:revealed', { index });
    });
    
    // Add strike
    socket.on('addStrike', () => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        if (room.gameState.strikes < 3) {
            room.gameState.strikes++;
        }
        
        io.to(socket.roomCode).emit('strike:updated', { strikes: room.gameState.strikes });
    });
    
    // Remove strike
    socket.on('removeStrike', () => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        if (room.gameState.strikes > 0) {
            room.gameState.strikes--;
        }
        
        io.to(socket.roomCode).emit('strike:updated', { strikes: room.gameState.strikes });
    });
    
    // Add points
    socket.on('addPoints', ({ team, points }) => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        if (team === 1) {
            room.gameState.team1Score += points;
        } else {
            room.gameState.team2Score += points;
        }
        
        // Track for round summary
        room.gameState.lastWinningTeam = team;
        room.gameState.lastPointsAwarded = points;
        
        io.to(socket.roomCode).emit('points:updated', {
            team1Score: room.gameState.team1Score,
            team2Score: room.gameState.team2Score
        });
    });
    
    // End round and show summary
    socket.on('endRound', ({ team, points, correctGuesses }) => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        // Add points to team
        if (team === 1) {
            room.gameState.team1Score += points;
        } else {
            room.gameState.team2Score += points;
        }
        
        // Use server-tracked correct guesses as fallback
        const guesses = correctGuesses && correctGuesses.length > 0 
            ? correctGuesses 
            : (room.gameState.correctGuessesThisRound || []);
        
        // Emit round summary to display
        io.to(socket.roomCode).emit('round:summary', {
            roundNumber: room.gameState.currentRound,
            winningTeam: team,
            winningTeamName: team === 1 ? room.gameState.team1Name : room.gameState.team2Name,
            pointsAwarded: points,
            question: room.gameState.currentQuestion ? room.gameState.currentQuestion.question : '',
            correctGuesses: guesses,
            allAnswers: room.gameState.currentQuestion ? room.gameState.currentQuestion.answers : [],
            revealedAnswers: room.gameState.revealedAnswers || [],
            totalAnswers: room.gameState.currentQuestion ? room.gameState.currentQuestion.answers.length : 0,
            strikes: room.gameState.strikes,
            team1Name: room.gameState.team1Name,
            team2Name: room.gameState.team2Name,
            team1Score: room.gameState.team1Score,
            team2Score: room.gameState.team2Score,
            currentRound: room.gameState.currentRound,
            totalRounds: room.gameState.totalRounds
        });
    });
    
    // Show round summary (triggered by Next Round button)
    socket.on('showRoundSummary', () => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        // Get correct guesses from server-tracked state
        const guesses = room.gameState.correctGuessesThisRound || [];
        
        // Calculate round points (sum of revealed answer points)
        let roundPoints = 0;
        if (room.gameState.currentQuestion) {
            room.gameState.currentQuestion.answers.forEach((answer, index) => {
                if (room.gameState.revealedAnswers && room.gameState.revealedAnswers[index]) {
                    roundPoints += answer.points;
                }
            });
        }
        
        // Determine winning team based on last points action or default
        const winningTeam = room.gameState.lastWinningTeam || 1;
        
        // Emit round summary to display
        io.to(socket.roomCode).emit('round:summary', {
            roundNumber: room.gameState.currentRound,
            winningTeam: winningTeam,
            winningTeamName: winningTeam === 1 ? room.gameState.team1Name : room.gameState.team2Name,
            pointsAwarded: room.gameState.lastPointsAwarded || roundPoints,
            question: room.gameState.currentQuestion ? room.gameState.currentQuestion.question : '',
            correctGuesses: guesses,
            allAnswers: room.gameState.currentQuestion ? room.gameState.currentQuestion.answers : [],
            revealedAnswers: room.gameState.revealedAnswers || [],
            totalAnswers: room.gameState.currentQuestion ? room.gameState.currentQuestion.answers.length : 0,
            strikes: room.gameState.strikes,
            team1Name: room.gameState.team1Name,
            team2Name: room.gameState.team2Name,
            team1Score: room.gameState.team1Score,
            team2Score: room.gameState.team2Score,
            currentRound: room.gameState.currentRound,
            totalRounds: room.gameState.totalRounds
        });
    });
    
    // Continue from round summary to next round
    socket.on('continueFromSummary', () => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        // Check if game is over
        if (room.gameState.currentRound >= room.gameState.totalRounds) {
            room.gameState.screen = 'end';
            io.to(socket.roomCode).emit('game:ended', {
                team1Name: room.gameState.team1Name,
                team2Name: room.gameState.team2Name,
                team1Score: room.gameState.team1Score,
                team2Score: room.gameState.team2Score
            });
        } else {
            io.to(socket.roomCode).emit('round:continue');
        }
    });
    
    // Check answer (AI)
    socket.on('checkAnswer', async ({ playerAnswer }) => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room || !room.gameState.currentQuestion) return;
        
        const allAnswers = room.gameState.currentQuestion.answers.map(a => a.text);
        
        try {
            const response = await callOpenAI(
                room.gameState.currentQuestion.question,
                allAnswers,
                playerAnswer
            );
            
            const chatResponse = response.choices[0].message.content.trim();
            const cleanedResponse = chatResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonResponse = JSON.parse(cleanedResponse);
            
            // Add to entry log
            const isCorrect = jsonResponse.match && jsonResponse.matchedAnswer;
            room.gameState.entryLog.push({
                entry: playerAnswer,
                isCorrect,
                timestamp: new Date()
            });
            
            // Send result to host only
            socket.emit('answer:result', {
                playerAnswer,
                ...jsonResponse
            });
            
            // If correct, find the answer index and reveal it
            if (isCorrect) {
                const matchedIndex = room.gameState.currentQuestion.answers.findIndex(
                    ans => ans.text.toLowerCase() === jsonResponse.matchedAnswer.toLowerCase()
                );
                
                if (matchedIndex !== -1 && !room.gameState.revealedAnswers.includes(matchedIndex)) {
                    room.gameState.revealedAnswers.push(matchedIndex);
                    const answer = room.gameState.currentQuestion.answers[matchedIndex];
                    const points = answer.points;
                    room.gameState.roundPointsEarned += points;
                    
                    // Track correct guess for round summary
                    if (!room.gameState.correctGuessesThisRound) {
                        room.gameState.correctGuessesThisRound = [];
                    }
                    room.gameState.correctGuessesThisRound.push({
                        answer: answer.text,
                        points: points
                    });
                    
                    // Notify display to show correct feedback and reveal
                    io.to(socket.roomCode).emit('answer:correct', {
                        index: matchedIndex,
                        answerText: answer.text,
                        points,
                        roundPointsEarned: room.gameState.roundPointsEarned
                    });
                }
            } else {
                // Add strike
                if (room.gameState.strikes < 3) {
                    room.gameState.strikes++;
                }
                
                // Notify display to show incorrect feedback
                io.to(socket.roomCode).emit('answer:incorrect', {
                    strikes: room.gameState.strikes
                });
            }
            
            // Update entry log on display
            io.to(socket.roomCode).emit('entryLog:updated', {
                entryLog: room.gameState.entryLog
            });
            
        } catch (error) {
            console.error('Error checking answer:', error);
            socket.emit('answer:error', { error: error.message });
        }
    });
    
    // Timer controls
    socket.on('timer:start', ({ seconds }) => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState.timerRunning = true;
        room.gameState.timerCurrentSeconds = seconds || room.gameState.timerSeconds;
        
        io.to(socket.roomCode).emit('timer:started', {
            seconds: room.gameState.timerCurrentSeconds
        });
    });
    
    socket.on('timer:pause', () => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState.timerRunning = false;
        
        io.to(socket.roomCode).emit('timer:paused');
    });
    
    socket.on('timer:reset', ({ seconds }) => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState.timerRunning = false;
        room.gameState.timerSeconds = seconds || 30;
        room.gameState.timerCurrentSeconds = room.gameState.timerSeconds;
        
        io.to(socket.roomCode).emit('timer:reset', {
            seconds: room.gameState.timerSeconds
        });
    });
    
    socket.on('timer:update', ({ seconds }) => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState.timerCurrentSeconds = seconds;
        
        io.to(socket.roomCode).emit('timer:tick', { seconds });
    });
    
    socket.on('timer:finished', () => {
        if (!socket.isHost || !socket.roomCode) return;
        
        io.to(socket.roomCode).emit('timer:timesUp');
    });
    
    // Reset round
    socket.on('resetRound', () => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState.revealedAnswers = [];
        room.gameState.strikes = 0;
        room.gameState.entryLog = [];
        room.gameState.roundPointsEarned = 0;
        
        io.to(socket.roomCode).emit('round:reset');
    });
    
    // Reset game
    socket.on('resetGame', () => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState = {
            screen: 'setup',
            team1Name: 'TEAM 1',
            team2Name: 'TEAM 2',
            team1Score: 0,
            team2Score: 0,
            totalRounds: 7,
            currentRound: 1,
            currentQuestion: null,
            revealedAnswers: [],
            strikes: 0,
            timerSeconds: 30,
            timerRunning: false,
            timerCurrentSeconds: 0,
            entryLog: [],
            roundPointsEarned: 0,
            usedQuestionIndices: []
        };
        
        io.to(socket.roomCode).emit('game:reset', room.gameState);
    });
    
    // End game
    socket.on('endGame', () => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState.screen = 'end';
        
        io.to(socket.roomCode).emit('game:ended', {
            team1Name: room.gameState.team1Name,
            team2Name: room.gameState.team2Name,
            team1Score: room.gameState.team1Score,
            team2Score: room.gameState.team2Score
        });
    });
    
    // Clear entry log
    socket.on('clearEntryLog', () => {
        if (!socket.isHost || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState.entryLog = [];
        
        io.to(socket.roomCode).emit('entryLog:cleared');
    });
    
    // Request full game state sync
    socket.on('requestState', () => {
        if (!socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        socket.emit('gameState:full', room.gameState);
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        if (socket.roomCode) {
            const room = getRoom(socket.roomCode);
            if (room) {
                if (socket.isDisplay) {
                    room.displaySocketId = null;
                    io.to(socket.roomCode).emit('display:disconnected');
                }
                if (socket.isHost) {
                    room.hostSocketId = null;
                    io.to(socket.roomCode).emit('host:disconnected', { reason: 'Host disconnected' });
                }
            }
        }
    });
});

// Clean up old rooms periodically (every hour)
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [code, room] of gameRooms.entries()) {
        if (room.createdAt < oneHourAgo && !room.displaySocketId && !room.hostSocketId) {
            gameRooms.delete(code);
            console.log(`Cleaned up old room: ${code}`);
        }
    }
}, 60 * 60 * 1000);

server.listen(PORT, () => {
    console.log(`Family Feud server running on port ${PORT}`);
    if (process.env.OPENAI_API_KEY) {
        console.log('Using OpenAI API key from environment variable');
    } else {
        console.log('Using OpenAI API key from config.json');
    }
    console.log('Socket.IO enabled for remote host control');
});
