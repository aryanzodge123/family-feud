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

// Room answer processing queue (prevents concurrent OpenAI calls per room)
const roomAnswerProcessing = new Map(); // roomCode -> boolean

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
            lastPointsAwarded: 0,
            // Party mode state
            partyMode: false,
            partyScreen: 'qr',              // qr, lobby, teams, game
            players: [],                    // { id, name, socketId, team }
            team1Players: [],               // playerIds assigned to team 1
            team2Players: [],               // playerIds assigned to team 2
            currentBattlePlayers: [null, null], // [team1PlayerId, team2PlayerId]
            currentTurnPlayer: null,        // playerId whose turn it is
            playerTurnIndex: { team1: 0, team2: 0 },
            faceOffActive: false,           // true during face-off phase
            buzzerPhase: false,             // true while waiting for buzzer
            buzzerWinner: null,             // playerId who buzzed first
            buzzerLoser: null,              // playerId who was slower
            // Face-off chain state
            faceOffAttempts: [],            // Array of playerIds who have tried
            faceOffPhase: 'buzzer',         // 'buzzer' | 'chain' | 'resolved'
            controllingTeam: null,          // Team that won face-off and is playing (1 or 2)
            // Steal phase state
            stealPhase: false,              // Is steal phase active?
            stealingTeam: null,             // Team attempting steal (1 or 2)
            stealPlayerId: null,            // Player attempting steal
            roundWinningTeam: null,         // Which team gets points (set by game outcome)
            pendingTurnChange: null,        // Holds turn:changed data until display animation completes
            pendingStealPhase: null,        // Holds steal:phase data until display animation completes
            // Timer config
            timerConfig: {
                enabled: true,
                buzzerTime: 7,
                afterBuzzerTime: 15,
                regularTime: 35,
                stealTime: 120
            }
        }
    };
    
    gameRooms.set(roomCode, room);
    return room;
}

// Get room by code
function getRoom(roomCode) {
    return gameRooms.get(roomCode);
}

// Start state heartbeat for a room (syncs critical state)
function startHeartbeat(roomCode) {
    const room = getRoom(roomCode);
    if (!room) return;

    // Clear any existing heartbeat
    if (room.heartbeatInterval) {
        clearInterval(room.heartbeatInterval);
    }

    // Use faster heartbeat (5s) for large groups (>8 players), otherwise 10s
    const playerCount = room.gameState.players ? room.gameState.players.length : 0;
    const heartbeatInterval = playerCount > 8 ? 5000 : 10000;

    room.heartbeatInterval = setInterval(() => {
        // Only emit if room still has connected clients
        if (room.displaySocketId || room.hostSocketId) {
            io.to(roomCode).emit('state:heartbeat', {
                team1Score: room.gameState.team1Score,
                team2Score: room.gameState.team2Score,
                strikes: room.gameState.strikes,
                currentRound: room.gameState.currentRound,
                currentTurnPlayer: room.gameState.currentTurnPlayer,
                faceOffActive: room.gameState.faceOffActive,
                faceOffPhase: room.gameState.faceOffPhase,
                stealPhase: room.gameState.stealPhase,
                // Include player connection status for sync
                players: room.gameState.players ? room.gameState.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    team: p.team,
                    disconnected: p.disconnected || false
                })) : []
            });
        }
    }, heartbeatInterval);
}

// Stop heartbeat for a room
function stopHeartbeat(roomCode) {
    const room = getRoom(roomCode);
    if (room && room.heartbeatInterval) {
        clearInterval(room.heartbeatInterval);
        room.heartbeatInterval = null;
    }
}

// Get current turn player safely (returns null if player doesn't exist or is disconnected)
function getCurrentTurnPlayer(room) {
    if (!room || !room.gameState || !room.gameState.currentTurnPlayer) {
        return null;
    }
    const player = room.gameState.players.find(p => p.id === room.gameState.currentTurnPlayer);
    if (!player || player.disconnected) {
        return null;
    }
    return player;
}

// Get next connected player on a team (skips disconnected players)
function getNextConnectedPlayerOnTeam(room, teamNumber, currentPlayerId) {
    if (!room || !room.gameState) return null;

    const teamPlayers = teamNumber === 1 ? room.gameState.team1Players : room.gameState.team2Players;
    if (!teamPlayers || teamPlayers.length === 0) return null;

    const currentIdx = teamPlayers.indexOf(currentPlayerId);
    let nextIdx = currentIdx === -1 ? 0 : currentIdx;
    let attempts = 0;

    while (attempts < teamPlayers.length) {
        nextIdx = (nextIdx + 1) % teamPlayers.length;
        const candidateId = teamPlayers[nextIdx];
        const candidate = room.gameState.players.find(p => p.id === candidateId);
        if (candidate && !candidate.disconnected) {
            return candidate;
        }
        attempts++;
    }

    return null; // All players on team are disconnected
}

// Get next player in the face-off chain
function getNextChainPlayer(room) {
    const { buzzerWinner, buzzerLoser, faceOffAttempts, players, team1Players, team2Players } = room.gameState;

    // Get team info for buzzer players
    const winnerPlayer = players.find(p => p.id === buzzerWinner);
    const loserPlayer = players.find(p => p.id === buzzerLoser);
    const winnerTeam = winnerPlayer?.team;
    const loserTeam = loserPlayer?.team;

    const attempted = new Set(faceOffAttempts);

    // 1. If buzzer loser hasn't tried yet and is connected, they go next
    if (buzzerLoser && !attempted.has(buzzerLoser)) {
        const loser = players.find(p => p.id === buzzerLoser);
        if (loser && !loser.disconnected) {
            return loser;
        }
    }

    // 2. Alternate between teams, getting next player who hasn't tried
    const winnerTeamPlayers = winnerTeam === 1 ? team1Players : team2Players;
    const loserTeamPlayers = loserTeam === 1 ? team1Players : team2Players;

    // Count attempts per team
    const winnerTeamAttempts = faceOffAttempts.filter(id => {
        const p = players.find(pl => pl.id === id);
        return p?.team === winnerTeam;
    }).length;
    const loserTeamAttempts = faceOffAttempts.filter(id => {
        const p = players.find(pl => pl.id === id);
        return p?.team === loserTeam;
    }).length;

    // Winner's team goes first in the chain (after buzzer phase)
    let nextTeamPlayers, otherTeamPlayers;
    if (winnerTeamAttempts <= loserTeamAttempts) {
        nextTeamPlayers = winnerTeamPlayers;
        otherTeamPlayers = loserTeamPlayers;
    } else {
        nextTeamPlayers = loserTeamPlayers;
        otherTeamPlayers = winnerTeamPlayers;
    }

    // Find next unattempted connected player on the prioritized team
    for (const playerId of nextTeamPlayers) {
        if (!attempted.has(playerId)) {
            const player = players.find(p => p.id === playerId);
            if (player && !player.disconnected) {
                return player;
            }
        }
    }

    // Try other team
    for (const playerId of otherTeamPlayers) {
        if (!attempted.has(playerId)) {
            const player = players.find(p => p.id === playerId);
            if (player && !player.disconnected) {
                return player;
            }
        }
    }

    return null; // Everyone has tried or is disconnected
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

// Make OpenAI API call with timeout
function callOpenAI(question, answers, playerAnswer) {
    return new Promise((resolve, reject) => {
        const TIMEOUT_MS = 8000; // 8 second timeout
        let timeoutId = null;
        let requestCompleted = false;

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

        // Set up timeout
        timeoutId = setTimeout(() => {
            if (!requestCompleted) {
                requestCompleted = true;
                req.destroy();
                console.error('OpenAI API timeout after', TIMEOUT_MS, 'ms');
                reject(new Error('OpenAI API timeout - please try again'));
            }
        }, TIMEOUT_MS);

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (requestCompleted) return; // Already timed out
                requestCompleted = true;
                clearTimeout(timeoutId);

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
            if (requestCompleted) return; // Already timed out
            requestCompleted = true;
            clearTimeout(timeoutId);
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
    // API endpoint to generate player QR code (party mode)
    else if (url.pathname === '/api/player-qr-code' && req.method === 'GET') {
        const roomCode = url.searchParams.get('room');
        if (!roomCode) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Room code required' }));
            return;
        }

        // Construct the player URL
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host;
        const playerUrl = `${protocol}://${host}/player.html?room=${roomCode}`;

        QRCode.toDataURL(playerUrl, { width: 300, margin: 2 }, (err, dataUrl) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to generate QR code' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ qrCode: dataUrl, playerUrl }));
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
            // Stale socket reference - clear it and proceed
            room.hostSocketId = null;
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

        // Start heartbeat for state sync
        startHeartbeat(socket.roomCode);

        io.to(socket.roomCode).emit('game:started', room.gameState);
    });

    // Countdown finished - relay to all clients
    socket.on('countdown:finished', () => {
        if (!socket.roomCode) return;

        io.to(socket.roomCode).emit('countdown:completed');
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
        // Reset steal state
        room.gameState.stealPhase = false;
        room.gameState.stealingTeam = null;
        room.gameState.stealPlayerId = null;
        room.gameState.roundWinningTeam = null;
        
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
                if (room.gameState.revealedAnswers && room.gameState.revealedAnswers.includes(index)) {
                    roundPoints += answer.points;
                }
            });
        }

        // Set roundWinningTeam if not already set (board completed before 3 strikes)
        if (!room.gameState.roundWinningTeam) {
            room.gameState.roundWinningTeam = room.gameState.controllingTeam || 1;
        }

        // Auto-award points to winning team
        const winningTeam = room.gameState.roundWinningTeam;
        if (winningTeam === 1) {
            room.gameState.team1Score += roundPoints;
        } else {
            room.gameState.team2Score += roundPoints;
        }

        room.gameState.lastWinningTeam = winningTeam;
        room.gameState.lastPointsAwarded = roundPoints;
        
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
        if ((!socket.isHost && !socket.isDisplay) || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState.timerRunning = true;
        room.gameState.timerCurrentSeconds = seconds || room.gameState.timerSeconds;
        
        io.to(socket.roomCode).emit('timer:started', {
            seconds: room.gameState.timerCurrentSeconds
        });
    });
    
    socket.on('timer:pause', () => {
        if ((!socket.isHost && !socket.isDisplay) || !socket.roomCode) return;
        
        const room = getRoom(socket.roomCode);
        if (!room) return;
        
        room.gameState.timerRunning = false;
        
        io.to(socket.roomCode).emit('timer:paused');
    });
    
    socket.on('timer:reset', ({ seconds }) => {
        if ((!socket.isHost && !socket.isDisplay) || !socket.roomCode) return;
        
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
        if ((!socket.isHost && !socket.isDisplay) || !socket.roomCode) return;

        const room = getRoom(socket.roomCode);
        if (!room) return;

        room.gameState.timerCurrentSeconds = seconds;

        io.to(socket.roomCode).emit('timer:tick', { seconds });
    });

    socket.on('timer:stop', () => {
        if ((!socket.isHost && !socket.isDisplay) || !socket.roomCode) return;

        io.to(socket.roomCode).emit('timer:stopped');
    });

    socket.on('timer:finished', () => {
        if ((!socket.isHost && !socket.isDisplay) || !socket.roomCode) return;

        io.to(socket.roomCode).emit('timer:timesUp');
    });

    // Display signals that animations are complete - now emit pending updates
    socket.on('display:animationComplete', () => {
        if (!socket.isDisplay || !socket.roomCode) return;

        const room = getRoom(socket.roomCode);
        if (!room) return;

        // Emit pending entry log update (deferred until animation completes)
        if (room.gameState.pendingEntryLog) {
            io.to(socket.roomCode).emit('entryLog:updated', {
                entryLog: room.gameState.pendingEntryLog
            });
            room.gameState.pendingEntryLog = null;
        }

        if (room.gameState.pendingTurnChange) {
            io.to(socket.roomCode).emit('turn:changed', room.gameState.pendingTurnChange);
            room.gameState.pendingTurnChange = null;
        }

        // Emit pending steal phase (deferred until X animation completes)
        if (room.gameState.pendingStealPhase) {
            io.to(socket.roomCode).emit('steal:phase', room.gameState.pendingStealPhase);
            room.gameState.pendingStealPhase = null;
        }
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

        // Stop heartbeat
        stopHeartbeat(socket.roomCode);

        // Preserve party mode state (players, teams) for playing again
        const preservedPlayers = room.gameState.players || [];
        const preservedTeam1Players = room.gameState.team1Players || [];
        const preservedTeam2Players = room.gameState.team2Players || [];
        const hasPartyPlayers = preservedPlayers.length > 0;

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
            usedQuestionIndices: [],
            correctGuessesThisRound: [],
            lastWinningTeam: 0,
            lastPointsAwarded: 0,
            // Preserve party mode state
            partyMode: hasPartyPlayers,
            partyScreen: 'qr',
            players: preservedPlayers,
            team1Players: preservedTeam1Players,
            team2Players: preservedTeam2Players,
            currentBattlePlayers: [null, null],
            currentTurnPlayer: null,
            playerTurnIndex: { team1: 0, team2: 0 },
            faceOffActive: false,
            buzzerPhase: false,
            buzzerWinner: null,
            buzzerLoser: null,
            faceOffAttempts: [],
            faceOffPhase: 'buzzer',
            controllingTeam: null,
            stealPhase: false,
            stealingTeam: null,
            stealPlayerId: null,
            roundWinningTeam: null,
            pendingTurnChange: null,
            pendingStealPhase: null,
            // Reset timer config to defaults
            timerConfig: {
                enabled: true,
                buzzerTime: 7,
                afterBuzzerTime: 15,
                regularTime: 35,
                stealTime: 120
            }
        };

        io.to(socket.roomCode).emit('game:reset', room.gameState);

        // Emit partyScreen update so display shows QR screen
        if (hasPartyPlayers) {
            io.to(socket.roomCode).emit('partyScreen:updated', { screen: 'qr' });
        }
    });
    
    // End game
    socket.on('endGame', () => {
        if (!socket.isHost || !socket.roomCode) return;

        const room = getRoom(socket.roomCode);
        if (!room) return;

        // Stop heartbeat
        stopHeartbeat(socket.roomCode);

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

    // Panel toggle (host controls display panels)
    socket.on('panel:toggle', ({ panel }) => {
        if (!socket.isHost || !socket.roomCode) return;
        // Relay to all clients in the room (game display will handle it)
        io.to(socket.roomCode).emit('panel:toggle', { panel });
    });

    // ============ PARTY MODE EVENTS ============

    // Player joins party mode game
    socket.on('player:join', ({ roomCode, playerName }) => {
        const room = getRoom(roomCode);
        if (!room) {
            socket.emit('player:error', { message: 'Room not found' });
            return;
        }

        // Generate unique player ID
        const playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        const player = {
            id: playerId,
            name: playerName,
            socketId: socket.id,
            team: null
        };

        room.gameState.players.push(player);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.isPlayer = true;
        socket.playerId = playerId;

        console.log(`Player ${playerName} (${playerId}) joined room ${roomCode}`);

        // Confirm join to player
        socket.emit('player:joined', {
            playerId,
            playerName,
            gameState: room.gameState
        });

        // Notify everyone in room about updated player list
        io.to(roomCode).emit('players:updated', {
            players: room.gameState.players
        });
    });

    // Player attempts to reconnect with saved ID
    socket.on('player:reconnect', ({ roomCode, playerId, playerName }) => {
        const room = getRoom(roomCode);
        if (!room) {
            socket.emit('player:error', { message: 'Room not found' });
            return;
        }

        // Find the disconnected player by ID
        const player = room.gameState.players.find(p => p.id === playerId);

        if (player) {
            // Restore the player's connection
            player.socketId = socket.id;
            player.disconnected = false;

            socket.join(roomCode);
            socket.roomCode = roomCode;
            socket.isPlayer = true;
            socket.playerId = playerId;

            console.log(`Player ${player.name} (${playerId}) reconnected to room ${roomCode}`);

            // Send reconnection confirmation with full game state
            socket.emit('player:reconnected', {
                playerId: player.id,
                playerName: player.name,
                team: player.team,
                gameState: room.gameState
            });

            // Notify everyone about player reconnection
            io.to(roomCode).emit('players:updated', {
                players: room.gameState.players
            });
            io.to(roomCode).emit('player:reconnected:broadcast', {
                playerId: player.id,
                playerName: player.name
            });
        } else {
            // Player ID not found - fall back to new join with same name
            // Check if someone with this name exists but has a different ID
            const existingByName = room.gameState.players.find(
                p => p.name.toLowerCase() === playerName.toLowerCase() && p.disconnected
            );

            if (existingByName) {
                // Reconnect to existing player slot by name
                existingByName.socketId = socket.id;
                existingByName.disconnected = false;

                socket.join(roomCode);
                socket.roomCode = roomCode;
                socket.isPlayer = true;
                socket.playerId = existingByName.id;

                console.log(`Player ${existingByName.name} reconnected by name to room ${roomCode}`);

                socket.emit('player:reconnected', {
                    playerId: existingByName.id,
                    playerName: existingByName.name,
                    team: existingByName.team,
                    gameState: room.gameState
                });

                io.to(roomCode).emit('players:updated', {
                    players: room.gameState.players
                });
                io.to(roomCode).emit('player:reconnected:broadcast', {
                    playerId: existingByName.id,
                    playerName: existingByName.name
                });
            } else {
                // No matching player found - tell client to do fresh join
                socket.emit('player:reconnectFailed', {
                    message: 'Player session not found. Please join as a new player.',
                    shouldRejoin: true
                });
            }
        }
    });

    // Host or display assigns player to team (party mode)
    socket.on('player:assignTeam', ({ playerId, team }) => {
        if ((!socket.isHost && !socket.isDisplay) || !socket.roomCode) return;

        const room = getRoom(socket.roomCode);
        if (!room) return;

        // Find the player
        const player = room.gameState.players.find(p => p.id === playerId);
        if (!player) return;

        // Remove from old team if assigned
        if (player.team === 1) {
            room.gameState.team1Players = room.gameState.team1Players.filter(id => id !== playerId);
        } else if (player.team === 2) {
            room.gameState.team2Players = room.gameState.team2Players.filter(id => id !== playerId);
        }

        // Assign to new team
        player.team = team;
        if (team === 1) {
            room.gameState.team1Players.push(playerId);
        } else if (team === 2) {
            room.gameState.team2Players.push(playerId);
        }

        // Notify everyone
        io.to(socket.roomCode).emit('teams:updated', {
            players: room.gameState.players,
            team1Players: room.gameState.team1Players,
            team2Players: room.gameState.team2Players
        });
    });

    // Host or display navigates party mode screens
    socket.on('partyScreen:navigate', ({ screen, team1Name, team2Name, totalRounds }) => {
        if ((!socket.isHost && !socket.isDisplay) || !socket.roomCode) return;

        const room = getRoom(socket.roomCode);
        if (!room) return;

        room.gameState.partyScreen = screen;

        // If navigating to game with settings, start the party game directly
        if (screen === 'game' && team1Name !== undefined) {
            room.gameState.partyMode = true;
            room.gameState.team1Name = team1Name || 'TEAM 1';
            room.gameState.team2Name = team2Name || 'TEAM 2';
            room.gameState.totalRounds = totalRounds || 7;
            room.gameState.currentRound = 1;
            room.gameState.team1Score = 0;
            room.gameState.team2Score = 0;
            room.gameState.screen = 'game';
            room.gameState.usedQuestionIndices = [];
            room.gameState.playerTurnIndex = { team1: 0, team2: 0 };

            // Start heartbeat for state sync
            startHeartbeat(socket.roomCode);

            io.to(socket.roomCode).emit('partyGame:started', room.gameState);
        } else {
            // Broadcast screen change to all clients
            io.to(socket.roomCode).emit('partyScreen:updated', { screen });
        }
    });

    // Timer config update from host
    socket.on('timerConfig:update', (config) => {
        if (!socket.isHost || !socket.roomCode) return;

        const room = getRoom(socket.roomCode);
        if (!room) return;

        // Update room's timer config
        room.gameState.timerConfig = {
            enabled: config.enabled !== undefined ? config.enabled : true,
            buzzerTime: config.buzzerTime || 7,
            afterBuzzerTime: config.afterBuzzerTime || 15,
            regularTime: config.regularTime || 35,
            stealTime: config.stealTime || 120
        };

        // Also update totalRounds if provided
        if (config.totalRounds !== undefined) {
            room.gameState.totalRounds = config.totalRounds;
        }

        // Broadcast to all clients (include totalRounds)
        io.to(socket.roomCode).emit('timerConfig:updated', {
            ...room.gameState.timerConfig,
            totalRounds: room.gameState.totalRounds
        });
    });

    // Auto-timer expired - treat as wrong answer
    socket.on('autoTimer:expired', () => {
        if (!socket.roomCode) return;

        const room = getRoom(socket.roomCode);
        if (!room || !room.gameState.partyMode) return;

        // Only the display should emit timer expiry
        if (!socket.isDisplay) return;

        const { faceOffPhase, currentTurnPlayer, stealPhase, players, controllingTeam } = room.gameState;

        // During steal phase - steal fails
        if (stealPhase) {
            room.gameState.roundWinningTeam = controllingTeam;
            room.gameState.stealPhase = false;

            io.to(socket.roomCode).emit('steal:failed', {
                controllingTeam: controllingTeam,
                stealPlayerName: 'Time expired',
                roundPoints: room.gameState.roundPointsEarned
            });
            return;
        }

        // During face-off chain - pass to next player
        if (faceOffPhase !== 'resolved') {
            if (currentTurnPlayer && !room.gameState.faceOffAttempts.includes(currentTurnPlayer)) {
                room.gameState.faceOffAttempts.push(currentTurnPlayer);
            }
            room.gameState.faceOffPhase = 'chain';

            // Emit X popup
            const player = players.find(p => p.id === currentTurnPlayer);
            io.to(socket.roomCode).emit('answer:incorrect', {
                strikes: room.gameState.strikes,
                playerName: player ? player.name : 'Unknown',
                playerAnswer: '(Time expired)'
            });

            // Get next player in chain
            let nextPlayer = getNextChainPlayer(room);

            if (!nextPlayer) {
                room.gameState.faceOffAttempts = [];
                const buzzerWinnerPlayer = players.find(p => p.id === room.gameState.buzzerWinner);
                nextPlayer = buzzerWinnerPlayer || getNextChainPlayer(room);
            }

            if (nextPlayer) {
                room.gameState.currentTurnPlayer = nextPlayer.id;
                if (!room.gameState.currentBattlePlayers.includes(nextPlayer.id)) {
                    room.gameState.currentBattlePlayers.push(nextPlayer.id);
                }
                io.to(socket.roomCode).emit('faceOff:chainNext', {
                    nextPlayerId: nextPlayer.id,
                    nextPlayerName: nextPlayer.name,
                    team: nextPlayer.team
                });
            }
            return;
        }

        // During regular play - add strike and pass turn
        if (room.gameState.strikes < 3) {
            room.gameState.strikes++;
        }

        const player = players.find(p => p.id === currentTurnPlayer);
        io.to(socket.roomCode).emit('answer:incorrect', {
            strikes: room.gameState.strikes,
            playerName: player ? player.name : 'Unknown',
            playerAnswer: '(Time expired)'
        });

        // Check for 3 strikes - trigger steal phase
        if (room.gameState.strikes === 3) {
            const opposingTeam = controllingTeam === 1 ? 2 : 1;
            const opposingPlayers = opposingTeam === 1
                ? room.gameState.team1Players
                : room.gameState.team2Players;

            if (opposingPlayers.length > 0) {
                const stealPlayerId = opposingPlayers[0];
                const stealPlayer = players.find(p => p.id === stealPlayerId);

                room.gameState.stealPhase = true;
                room.gameState.stealingTeam = opposingTeam;
                room.gameState.stealPlayerId = stealPlayerId;
                room.gameState.currentTurnPlayer = stealPlayerId;

                // Defer steal phase until X animation completes
                room.gameState.pendingStealPhase = {
                    stealingTeam: opposingTeam,
                    stealingTeamName: opposingTeam === 1 ? room.gameState.team1Name : room.gameState.team2Name,
                    stealPlayerId: stealPlayerId,
                    stealPlayerName: stealPlayer ? stealPlayer.name : 'Unknown',
                    roundPoints: room.gameState.roundPointsEarned
                };

                // Safety: emit steal phase after 8 seconds if display doesn't respond
                setTimeout(() => {
                    if (room.gameState.pendingStealPhase) {
                        io.to(socket.roomCode).emit('steal:phase', room.gameState.pendingStealPhase);
                        room.gameState.pendingStealPhase = null;
                    }
                }, 8000);
                return;
            } else {
                room.gameState.roundWinningTeam = controllingTeam;
            }
        }

        // Advance to next player on controlling team
        const teamPlayers = controllingTeam === 1
            ? room.gameState.team1Players
            : room.gameState.team2Players;

        if (teamPlayers.length === 0) {
            console.error('No players on controlling team');
            return;
        }

        const currentIdx = teamPlayers.indexOf(currentTurnPlayer);
        const safeIdx = currentIdx === -1 ? teamPlayers.length - 1 : currentIdx;
        const nextIdx = (safeIdx + 1) % teamPlayers.length;
        const nextPlayerId = teamPlayers[nextIdx];
        const nextPlayer = players.find(p => p.id === nextPlayerId);

        room.gameState.currentTurnPlayer = nextPlayerId;

        io.to(socket.roomCode).emit('turn:changed', {
            currentTurnPlayer: nextPlayerId,
            currentTurnPlayerName: nextPlayer ? nextPlayer.name : 'Unknown',
            faceOffActive: false,
            faceOffPhase: room.gameState.faceOffPhase
        });
    });

    // Host or display starts party mode game
    socket.on('partyGame:start', ({ team1Name, team2Name, totalRounds }) => {
        if ((!socket.isHost && !socket.isDisplay) || !socket.roomCode) return;

        const room = getRoom(socket.roomCode);
        if (!room) return;

        room.gameState.partyMode = true;
        room.gameState.team1Name = team1Name || 'TEAM 1';
        room.gameState.team2Name = team2Name || 'TEAM 2';
        room.gameState.totalRounds = totalRounds || 7;
        room.gameState.currentRound = 1;
        room.gameState.team1Score = 0;
        room.gameState.team2Score = 0;
        room.gameState.screen = 'game';
        room.gameState.usedQuestionIndices = [];
        room.gameState.playerTurnIndex = { team1: 0, team2: 0 };

        // Start heartbeat for state sync
        startHeartbeat(socket.roomCode);

        io.to(socket.roomCode).emit('partyGame:started', room.gameState);
    });

    // Host starts next battle (face-off between two players)
    socket.on('partyGame:nextBattle', () => {
        if (!socket.isHost || !socket.roomCode) return;

        const room = getRoom(socket.roomCode);
        if (!room) return;

        // Reset face-off chain state for new battle
        room.gameState.faceOffAttempts = [];
        room.gameState.faceOffPhase = 'buzzer';
        room.gameState.controllingTeam = null;

        const { team1Players, team2Players, playerTurnIndex, players } = room.gameState;

        if (team1Players.length === 0 || team2Players.length === 0) {
            socket.emit('partyGame:error', { message: 'Both teams need at least one player' });
            return;
        }

        // Get next player from each team (wrapping around)
        const team1Index = playerTurnIndex.team1 % team1Players.length;
        const team2Index = playerTurnIndex.team2 % team2Players.length;

        const team1PlayerId = team1Players[team1Index];
        const team2PlayerId = team2Players[team2Index];

        // Increment indices for next battle
        room.gameState.playerTurnIndex.team1++;
        room.gameState.playerTurnIndex.team2++;

        room.gameState.currentBattlePlayers = [team1PlayerId, team2PlayerId];
        room.gameState.faceOffActive = true;
        room.gameState.currentTurnPlayer = null; // Will be set after buzzer
        room.gameState.buzzerPhase = true;
        room.gameState.buzzerWinner = null;
        room.gameState.buzzerLoser = null;

        // Get player names for announcement
        const team1Player = players.find(p => p.id === team1PlayerId);
        const team2Player = players.find(p => p.id === team2PlayerId);

        io.to(socket.roomCode).emit('battle:started', {
            team1Player: team1Player ? { id: team1Player.id, name: team1Player.name } : null,
            team2Player: team2Player ? { id: team2Player.id, name: team2Player.name } : null,
            faceOffActive: true
        });
    });

    // Host sets which player has the turn (after face-off)
    socket.on('partyGame:setTurn', ({ playerId }) => {
        if (!socket.isHost || !socket.roomCode) return;

        const room = getRoom(socket.roomCode);
        if (!room) return;

        room.gameState.currentTurnPlayer = playerId;
        room.gameState.faceOffActive = false;

        const player = room.gameState.players.find(p => p.id === playerId);

        io.to(socket.roomCode).emit('turn:changed', {
            currentTurnPlayer: playerId,
            currentTurnPlayerName: player ? player.name : null,
            playerName: player ? player.name : null,
            faceOffActive: false,
            faceOffPhase: room.gameState.faceOffPhase
        });
    });

    // Player buzzes in during face-off
    socket.on('player:buzz', () => {
        if (!socket.isPlayer || !socket.roomCode) return;

        const room = getRoom(socket.roomCode);
        if (!room || !room.gameState.buzzerPhase) return;

        const playerId = socket.playerId;

        // Check if player is in current battle
        if (!room.gameState.currentBattlePlayers.includes(playerId)) return;

        // First buzz wins
        if (!room.gameState.buzzerWinner) {
            room.gameState.buzzerWinner = playerId;
            room.gameState.buzzerLoser = room.gameState.currentBattlePlayers.find(
                id => id !== playerId
            );
            room.gameState.buzzerPhase = false;
            room.gameState.currentTurnPlayer = playerId;
            room.gameState.faceOffActive = false;

            // Emit results to all players
            const winnerPlayer = room.gameState.players.find(p => p.id === playerId);
            io.to(socket.roomCode).emit('buzzer:result', {
                winner: room.gameState.buzzerWinner,
                loser: room.gameState.buzzerLoser,
                winnerName: winnerPlayer ? winnerPlayer.name : 'Unknown'
            });
        }
    });

    // Player submits answer
    socket.on('player:submitAnswer', async ({ playerAnswer }) => {
        if (!socket.isPlayer || !socket.roomCode) return;

        const room = getRoom(socket.roomCode);
        if (!room || !room.gameState.partyMode) return;

        // ATOMIC: Check AND set flag immediately (no gap for race condition)
        if (roomAnswerProcessing.get(socket.roomCode)) {
            socket.emit('player:answerBusy', { message: 'Processing another answer, please wait...' });
            return;
        }
        roomAnswerProcessing.set(socket.roomCode, true);  // SET IMMEDIATELY after check

        const playerId = socket.playerId;
        const { currentBattlePlayers, currentTurnPlayer, faceOffActive, faceOffPhase } = room.gameState;

        // Validation depends on face-off phase - clear flag on each early return
        if (faceOffPhase !== 'resolved') {
            // During face-off/chain: must be in the battle
            if (!currentBattlePlayers.includes(playerId)) {
                roomAnswerProcessing.set(socket.roomCode, false);
                socket.emit('player:notYourTurn', { message: "You're not in the current battle" });
                return;
            }
            // During active face-off, either buzzer player can answer
            // During chain, must be currentTurnPlayer
            if (!faceOffActive && currentTurnPlayer !== playerId) {
                roomAnswerProcessing.set(socket.roomCode, false);
                socket.emit('player:notYourTurn', { message: "It's not your turn to answer yet!" });
                return;
            }
        } else {
            // After face-off resolved: only currentTurnPlayer can answer
            if (currentTurnPlayer !== playerId) {
                roomAnswerProcessing.set(socket.roomCode, false);
                socket.emit('player:notYourTurn', { message: "It's not your turn to answer yet!" });
                return;
            }
        }

        // Process the answer (similar to checkAnswer but from player)
        if (!room.gameState.currentQuestion) {
            roomAnswerProcessing.set(socket.roomCode, false);
            socket.emit('player:error', { message: 'No question loaded' });
            return;
        }

        const allAnswers = room.gameState.currentQuestion.answers.map(a => a.text);
        const player = room.gameState.players.find(p => p.id === playerId);

        // Broadcast that player submitted an answer (for "Player says..." popup)
        io.to(socket.roomCode).emit('partyAnswer:submitted', {
            playerName: player ? player.name : 'Unknown',
            playerAnswer: playerAnswer
        });

        // Also broadcast timer:stopped so players see timer stop immediately
        io.to(socket.roomCode).emit('timer:stopped');

        // Record start time for minimum delay calculation (prevents animation order bug)
        const processingStartTime = Date.now();
        const MIN_RESULT_DELAY = 150; // ms - ensures client has time to set up partyAnswerProcessing

        try {
            const response = await callOpenAI(
                room.gameState.currentQuestion.question,
                allAnswers,
                playerAnswer
            );

            const chatResponse = response.choices[0].message.content.trim();
            const cleanedResponse = chatResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonResponse = JSON.parse(cleanedResponse);

            const isCorrect = jsonResponse.match && jsonResponse.matchedAnswer;

            // Ensure minimum delay before emitting results (fixes animation order bug)
            const elapsed = Date.now() - processingStartTime;
            if (elapsed < MIN_RESULT_DELAY) {
                await new Promise(resolve => setTimeout(resolve, MIN_RESULT_DELAY - elapsed));
            }

            // Add to entry log
            room.gameState.entryLog.push({
                entry: playerAnswer,
                isCorrect,
                playerName: player ? player.name : 'Unknown',
                playerId,
                timestamp: new Date()
            });

            // Send result to player
            socket.emit('player:answerResult', {
                playerAnswer,
                ...jsonResponse
            });

            if (isCorrect) {
                // Handle steal phase - correct answer
                if (room.gameState.stealPhase) {
                    // Find and reveal the matched answer first
                    const matchedIndex = room.gameState.currentQuestion.answers.findIndex(
                        ans => ans.text.toLowerCase() === jsonResponse.matchedAnswer.toLowerCase()
                    );

                    if (matchedIndex !== -1 && !room.gameState.revealedAnswers.includes(matchedIndex)) {
                        room.gameState.revealedAnswers.push(matchedIndex);
                        const answer = room.gameState.currentQuestion.answers[matchedIndex];
                        const points = answer.points;
                        room.gameState.roundPointsEarned += points;

                        // Track correct guess
                        if (!room.gameState.correctGuessesThisRound) {
                            room.gameState.correctGuessesThisRound = [];
                        }
                        room.gameState.correctGuessesThisRound.push({
                            answer: answer.text,
                            points: points,
                            playerName: player ? player.name : 'Unknown'
                        });

                        // Emit answer:correct to reveal on board
                        io.to(socket.roomCode).emit('answer:correct', {
                            index: matchedIndex,
                            answerText: answer.text,
                            points,
                            roundPointsEarned: room.gameState.roundPointsEarned,
                            playerName: player ? player.name : 'Unknown',
                            playerAnswer: playerAnswer
                        });
                    }

                    // Stealing team wins all revealed points (now includes new answer)
                    room.gameState.roundWinningTeam = room.gameState.stealingTeam;
                    room.gameState.stealPhase = false;

                    io.to(socket.roomCode).emit('steal:success', {
                        stealingTeam: room.gameState.stealingTeam,
                        stealPlayerName: player ? player.name : 'Unknown',
                        roundPoints: room.gameState.roundPointsEarned
                    });

                    // Defer entry log update until animation completes
                    room.gameState.pendingEntryLog = [...room.gameState.entryLog];
                    return;
                }

                const matchedIndex = room.gameState.currentQuestion.answers.findIndex(
                    ans => ans.text.toLowerCase() === jsonResponse.matchedAnswer.toLowerCase()
                );

                if (matchedIndex !== -1 && !room.gameState.revealedAnswers.includes(matchedIndex)) {
                    room.gameState.revealedAnswers.push(matchedIndex);
                    const answer = room.gameState.currentQuestion.answers[matchedIndex];
                    const points = answer.points;
                    room.gameState.roundPointsEarned += points;

                    if (!room.gameState.correctGuessesThisRound) {
                        room.gameState.correctGuessesThisRound = [];
                    }
                    room.gameState.correctGuessesThisRound.push({
                        answer: answer.text,
                        points: points,
                        playerName: player ? player.name : 'Unknown'
                    });

                    io.to(socket.roomCode).emit('answer:correct', {
                        index: matchedIndex,
                        answerText: answer.text,
                        points,
                        roundPointsEarned: room.gameState.roundPointsEarned,
                        playerName: player ? player.name : 'Unknown',
                        playerAnswer: playerAnswer
                    });

                    // Check if board is cleared (all answers revealed)
                    const totalAnswers = room.gameState.currentQuestion.answers.length;
                    const revealedCount = room.gameState.revealedAnswers.length;

                    if (revealedCount === totalAnswers && !room.gameState.stealPhase) {
                        room.gameState.roundWinningTeam = room.gameState.controllingTeam;

                        io.to(socket.roomCode).emit('board:cleared', {
                            winningTeam: room.gameState.controllingTeam,
                            winningTeamName: room.gameState.controllingTeam === 1
                                ? room.gameState.team1Name
                                : room.gameState.team2Name,
                            roundPoints: room.gameState.roundPointsEarned
                        });
                    }

                    // If face-off is still active (chain phase), resolve it
                    if (room.gameState.faceOffPhase === 'chain' || room.gameState.faceOffPhase === 'buzzer') {
                        const winningTeam = player.team;
                        const teamPlayers = winningTeam === 1 ? room.gameState.team1Players : room.gameState.team2Players;

                        if (teamPlayers.length === 0) {
                            console.error('No players on winning team');
                            return;
                        }

                        const currentIdx = teamPlayers.indexOf(playerId);
                        const safeIdx = currentIdx === -1 ? teamPlayers.length - 1 : currentIdx;
                        const nextIdx = (safeIdx + 1) % teamPlayers.length;
                        const nextPlayerId = teamPlayers[nextIdx];
                        const nextPlayer = room.gameState.players.find(p => p.id === nextPlayerId);

                        room.gameState.currentTurnPlayer = nextPlayerId;
                        room.gameState.controllingTeam = winningTeam;
                        room.gameState.faceOffPhase = 'resolved';
                        room.gameState.faceOffActive = false;

                        io.to(socket.roomCode).emit('faceOff:won', {
                            winningTeam,
                            winningPlayerId: playerId,
                            winningPlayerName: player ? player.name : 'Unknown',
                            nextPlayerId: nextPlayerId,
                            nextPlayerName: nextPlayer ? nextPlayer.name : 'Unknown'
                        });
                    } else if (room.gameState.faceOffPhase === 'resolved') {
                        // After face-off resolved, advance to next player on controlling team
                        const teamPlayers = room.gameState.controllingTeam === 1
                            ? room.gameState.team1Players
                            : room.gameState.team2Players;

                        if (teamPlayers.length === 0) {
                            console.error('No players on controlling team');
                            return;
                        }

                        const currentIdx = teamPlayers.indexOf(playerId);
                        const safeIdx = currentIdx === -1 ? teamPlayers.length - 1 : currentIdx;
                        const nextIdx = (safeIdx + 1) % teamPlayers.length;
                        const nextPlayerId = teamPlayers[nextIdx];
                        const nextPlayer = room.gameState.players.find(p => p.id === nextPlayerId);

                        room.gameState.currentTurnPlayer = nextPlayerId;

                        // Store pending turn change - will be emitted when display signals animation complete
                        room.gameState.pendingTurnChange = {
                            currentTurnPlayer: nextPlayerId,
                            currentTurnPlayerName: nextPlayer ? nextPlayer.name : 'Unknown',
                            faceOffActive: false,
                            faceOffPhase: room.gameState.faceOffPhase
                        };

                        // Safety: emit turn change after 8 seconds if display doesn't respond
                        setTimeout(() => {
                            if (room.gameState.pendingTurnChange) {
                                io.to(socket.roomCode).emit('turn:changed', room.gameState.pendingTurnChange);
                                room.gameState.pendingTurnChange = null;
                            }
                        }, 8000);
                    }
                } else if (matchedIndex !== -1) {
                    // Answer was correct but already revealed - tell player to try again
                    socket.emit('answer:duplicate', {
                        playerAnswer: playerAnswer,
                        matchedAnswer: jsonResponse.matchedAnswer
                    });
                }
            } else {
                // Handle steal phase - wrong answer
                if (room.gameState.stealPhase) {
                    // Controlling team keeps points
                    room.gameState.roundWinningTeam = room.gameState.controllingTeam;
                    room.gameState.stealPhase = false;

                    io.to(socket.roomCode).emit('steal:failed', {
                        controllingTeam: room.gameState.controllingTeam,
                        stealPlayerName: player ? player.name : 'Unknown',
                        roundPoints: room.gameState.roundPointsEarned
                    });

                    // Defer entry log update until animation completes
                    room.gameState.pendingEntryLog = [...room.gameState.entryLog];
                    return;
                }

                // Face-off chain logic: pass to next player (NO strike increment during face-off)
                if (room.gameState.faceOffPhase !== 'resolved') {
                    // Emit X popup during face-off (strikes stay at 0)
                    io.to(socket.roomCode).emit('answer:incorrect', {
                        strikes: room.gameState.strikes,
                        playerName: player ? player.name : 'Unknown',
                        playerAnswer: playerAnswer
                    });

                    // Add to attempts
                    if (!room.gameState.faceOffAttempts.includes(playerId)) {
                        room.gameState.faceOffAttempts.push(playerId);
                    }
                    room.gameState.faceOffPhase = 'chain';

                    // Get next player in chain
                    let nextPlayer = getNextChainPlayer(room);

                    if (!nextPlayer) {
                        // Everyone has tried - reset and cycle back to buzzer winner
                        room.gameState.faceOffAttempts = [];
                        const buzzerWinnerPlayer = room.gameState.players.find(
                            p => p.id === room.gameState.buzzerWinner
                        );
                        nextPlayer = buzzerWinnerPlayer || getNextChainPlayer(room);
                    }

                    if (nextPlayer) {
                        room.gameState.currentTurnPlayer = nextPlayer.id;
                        // Add next player to battle so they pass validation
                        if (!room.gameState.currentBattlePlayers.includes(nextPlayer.id)) {
                            room.gameState.currentBattlePlayers.push(nextPlayer.id);
                        }
                        io.to(socket.roomCode).emit('faceOff:chainNext', {
                            nextPlayerId: nextPlayer.id,
                            nextPlayerName: nextPlayer.name,
                            team: nextPlayer.team
                        });
                    }
                } else {
                    // Face-off is resolved - increment strike first, then emit
                    if (room.gameState.strikes < 3) {
                        room.gameState.strikes++;
                    }

                    // Emit X popup with UPDATED strike count
                    io.to(socket.roomCode).emit('answer:incorrect', {
                        strikes: room.gameState.strikes,
                        playerName: player ? player.name : 'Unknown',
                        playerAnswer: playerAnswer
                    });

                    // Check for 3 strikes - trigger steal phase
                    if (room.gameState.strikes === 3) {
                        // Trigger steal phase
                        const opposingTeam = room.gameState.controllingTeam === 1 ? 2 : 1;
                        const opposingPlayers = opposingTeam === 1
                            ? room.gameState.team1Players
                            : room.gameState.team2Players;

                        if (opposingPlayers.length > 0) {
                            const stealPlayerId = opposingPlayers[0];
                            const stealPlayer = room.gameState.players.find(p => p.id === stealPlayerId);

                            room.gameState.stealPhase = true;
                            room.gameState.stealingTeam = opposingTeam;
                            room.gameState.stealPlayerId = stealPlayerId;
                            room.gameState.currentTurnPlayer = stealPlayerId;

                            // Defer entry log update until animation completes
                            room.gameState.pendingEntryLog = [...room.gameState.entryLog];

                            // Defer steal phase until X animation completes
                            room.gameState.pendingStealPhase = {
                                stealingTeam: opposingTeam,
                                stealingTeamName: opposingTeam === 1 ? room.gameState.team1Name : room.gameState.team2Name,
                                stealPlayerId: stealPlayerId,
                                stealPlayerName: stealPlayer ? stealPlayer.name : 'Unknown',
                                roundPoints: room.gameState.roundPointsEarned
                            };

                            // Safety: emit steal phase after 8 seconds if display doesn't respond
                            setTimeout(() => {
                                if (room.gameState.pendingStealPhase) {
                                    io.to(socket.roomCode).emit('steal:phase', room.gameState.pendingStealPhase);
                                    room.gameState.pendingStealPhase = null;
                                }
                            }, 8000);
                            return; // Don't pass turn normally
                        } else {
                            // No opposing players - controlling team keeps points
                            room.gameState.roundWinningTeam = room.gameState.controllingTeam;
                        }
                    }

                    // Advance to next player on controlling team
                    const teamPlayers = room.gameState.controllingTeam === 1
                        ? room.gameState.team1Players
                        : room.gameState.team2Players;

                    if (teamPlayers.length === 0) {
                        console.error('No players on controlling team');
                        return;
                    }

                    const currentIdx = teamPlayers.indexOf(playerId);
                    const safeIdx = currentIdx === -1 ? teamPlayers.length - 1 : currentIdx;
                    const nextIdx = (safeIdx + 1) % teamPlayers.length;
                    const nextPlayerId = teamPlayers[nextIdx];
                    const nextPlayer = room.gameState.players.find(p => p.id === nextPlayerId);

                    room.gameState.currentTurnPlayer = nextPlayerId;

                    // Store pending turn change - will be emitted when display signals animation complete
                    room.gameState.pendingTurnChange = {
                        currentTurnPlayer: nextPlayerId,
                        currentTurnPlayerName: nextPlayer ? nextPlayer.name : 'Unknown',
                        faceOffActive: false,
                        faceOffPhase: room.gameState.faceOffPhase
                    };

                    // Safety: emit turn change after 8 seconds if display doesn't respond
                    setTimeout(() => {
                        if (room.gameState.pendingTurnChange) {
                            io.to(socket.roomCode).emit('turn:changed', room.gameState.pendingTurnChange);
                            room.gameState.pendingTurnChange = null;
                        }
                        if (room.gameState.pendingEntryLog) {
                            io.to(socket.roomCode).emit('entryLog:updated', {
                                entryLog: room.gameState.pendingEntryLog
                            });
                            room.gameState.pendingEntryLog = null;
                        }
                    }, 8000);
                }
            }

            // Defer entry log update until animation completes
            room.gameState.pendingEntryLog = [...room.gameState.entryLog];

        } catch (error) {
            console.error('Error checking player answer:', error);
            socket.emit('player:error', { message: error.message });
        } finally {
            // Always clear processing flag
            roomAnswerProcessing.set(socket.roomCode, false);
        }
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
                if (socket.isPlayer && socket.playerId) {
                    // Mark player as disconnected instead of removing them
                    const player = room.gameState.players.find(p => p.id === socket.playerId);
                    // Only mark as disconnected if this socket is still the active socket
                    // (prevents race condition where player reconnected before old disconnect fires)
                    if (player && player.socketId === socket.id) {
                        player.disconnected = true;
                        player.socketId = null;
                        console.log(`Player ${player.name} (${socket.playerId}) marked as disconnected`);
                    }

                    // If this player was the current turn player, skip to next player
                    if (room.gameState.currentTurnPlayer === socket.playerId && room.gameState.controllingTeam) {
                        const teamPlayers = room.gameState.controllingTeam === 1
                            ? room.gameState.team1Players
                            : room.gameState.team2Players;

                        // Find next connected player on the team
                        const currentIdx = teamPlayers.indexOf(socket.playerId);
                        let nextIdx = currentIdx;
                        let attempts = 0;
                        let nextPlayerId = null;

                        while (attempts < teamPlayers.length) {
                            nextIdx = (nextIdx + 1) % teamPlayers.length;
                            const candidateId = teamPlayers[nextIdx];
                            const candidatePlayer = room.gameState.players.find(p => p.id === candidateId);
                            if (candidatePlayer && !candidatePlayer.disconnected) {
                                nextPlayerId = candidateId;
                                break;
                            }
                            attempts++;
                        }

                        if (nextPlayerId) {
                            const nextPlayer = room.gameState.players.find(p => p.id === nextPlayerId);
                            room.gameState.currentTurnPlayer = nextPlayerId;

                            io.to(socket.roomCode).emit('turn:skipped', {
                                skippedPlayerId: socket.playerId,
                                skippedPlayerName: player ? player.name : 'Unknown',
                                reason: 'disconnected'
                            });

                            io.to(socket.roomCode).emit('turn:changed', {
                                currentTurnPlayer: nextPlayerId,
                                currentTurnPlayerName: nextPlayer ? nextPlayer.name : 'Unknown',
                                faceOffActive: room.gameState.faceOffActive,
                                faceOffPhase: room.gameState.faceOffPhase
                            });
                        }
                    }

                    // Notify everyone about player disconnect (keep them in lists)
                    io.to(socket.roomCode).emit('players:updated', {
                        players: room.gameState.players
                    });
                    io.to(socket.roomCode).emit('teams:updated', {
                        players: room.gameState.players,
                        team1Players: room.gameState.team1Players,
                        team2Players: room.gameState.team2Players
                    });
                    io.to(socket.roomCode).emit('player:disconnected', {
                        playerId: socket.playerId,
                        playerName: player ? player.name : 'Unknown'
                    });
                }

                // Stop heartbeat if both display and host disconnected
                if (!room.displaySocketId && !room.hostSocketId && room.heartbeatInterval) {
                    clearInterval(room.heartbeatInterval);
                    room.heartbeatInterval = null;
                }
            }
        }
    });
});

// Clean up old rooms periodically (every hour)
setInterval(() => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [code, room] of gameRooms.entries()) {
        if (room.createdAt < oneHourAgo) {
            // Check if sockets are actually connected (not just stored IDs)
            const displayConnected = room.displaySocketId && io.sockets.sockets.get(room.displaySocketId);
            const hostConnected = room.hostSocketId && io.sockets.sockets.get(room.hostSocketId);

            if (!displayConnected && !hostConnected) {
                // Clear heartbeat interval if running
                if (room.heartbeatInterval) {
                    clearInterval(room.heartbeatInterval);
                }
                // Clear roomAnswerProcessing entry
                roomAnswerProcessing.delete(code);
                gameRooms.delete(code);
                console.log(`Cleaned up old room: ${code}`);
            }
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
