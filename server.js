const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load configuration
let config = {};
try {
    const configData = fs.readFileSync('config.json', 'utf8');
    config = JSON.parse(configData);
} catch (error) {
    console.error('Error loading config.json:', error.message);
    console.error('Please create config.json with your OpenAI API key.');
    process.exit(1);
}

const OPENAI_API_KEY = config.openai_api_key;

if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_OPENAI_API_KEY_HERE') {
    console.error('Please set your OpenAI API key in config.json');
    process.exit(1);
}

const PORT = 3000;

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
    } else {
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

server.listen(PORT, () => {
    console.log(`Family Feud server running at http://localhost:${PORT}`);
    console.log('Make sure your OpenAI API key is set in config.json');
});

