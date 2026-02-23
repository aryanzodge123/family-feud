# Family Feud Game

A web-based Family Feud game with AI-powered answer checking. Supports three modes: single-device, two-device (display + host), and party mode (display + host + player phones).

## Tech Stack

- **Runtime:** Node.js (no framework -- pure HTTP server)
- **Realtime:** Socket.IO v4.7.4
- **Frontend:** Vanilla JS, HTML, CSS (no build step)
- **AI:** OpenAI API (gpt-4o-mini) for answer matching
- **QR Codes:** `qrcode` npm package (server-side generation)
- **Questions:** Loaded from `questions1.csv` at runtime

## Setup

1. **Install Node.js** -- https://nodejs.org/

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure API Key** -- pick one method:
   - **Environment variable (recommended):** `export OPENAI_API_KEY=your-key-here`
   - **Config file:** Copy `config.json.example` to `config.json` and add your key
   - Get a key at https://platform.openai.com/api-keys

4. **Start the server**
   ```bash
   node server.js
   ```

5. **Open in browser** -- http://localhost:3000

## Game Modes

### Single Device Mode
One screen with game board and controls. Good for quick play or testing.
- Keyboard shortcuts: **N** = New Question, **R** = Reveal, **S** = Strike, **A** = Add Points

### Display Mode (2 Devices)
TV/projector shows the game board. Host controls from a phone.
1. Select "Display Mode" on the TV
2. Scan the QR code with your phone to open the host panel
3. Enter the password to connect
4. Control the game from your phone

### Party Mode (3+ Devices)
TV/projector + host phone + player phones. Players buzz in and answer from their own devices.
1. Select "Party Mode" on the TV
2. Host scans QR code to connect
3. Players scan the player QR code to join
4. Host assigns players to teams
5. Configure rounds and timer settings
6. Start the game -- face-offs, turn rotation, and steal phases run automatically

## File Structure

```
server.js       -- Node.js HTTP server + Socket.IO backend
script.js       -- Main display/game logic (runs in index.html)
host.js         -- Host control panel logic (runs in host.html)
player.js       -- Player interface logic (runs in player.html)
index.html      -- Game display page (TV/projector screen)
host.html       -- Host control panel page (phone)
player.html     -- Player interface page (phone)
styles.css      -- Display page styles
host.css        -- Host page styles
player.css      -- Player page styles
questions1.csv  -- Question database (CSV format)
package.json    -- Dependencies: socket.io, qrcode
```

## Architecture

See [`docs/CODEMAPS/`](docs/CODEMAPS/) for detailed architecture documentation:

- [INDEX.md](docs/CODEMAPS/INDEX.md) -- Architecture overview with diagrams
- [server.md](docs/CODEMAPS/server.md) -- Backend: HTTP endpoints, Socket.IO events, room management
- [display.md](docs/CODEMAPS/display.md) -- Display page: screens, popups, game logic
- [host.md](docs/CODEMAPS/host.md) -- Host panel: authentication, controls, party flow
- [player.md](docs/CODEMAPS/player.md) -- Player interface: buzzer, answers, turns
- [socket-events.md](docs/CODEMAPS/socket-events.md) -- Complete Socket.IO event reference

## Deployment

### Render (Recommended)

1. Create a Web Service at https://render.com and connect your GitHub repo
2. Add the `OPENAI_API_KEY` environment variable in Render dashboard
3. Pushes to `main` trigger automatic deployment

### Other Platforms

Works on any platform that runs Node.js (Railway, Fly.io, Heroku, etc.). Set `OPENAI_API_KEY` as an environment variable and run `node server.js`.

## CI/CD

GitHub Actions pipeline runs on pushes and PRs to `main`/`master`:
1. **Secret Scanning** -- checks for exposed credentials
2. **Build Validation** -- validates syntax and required files
3. **Deployment** -- deploys to Render (if secrets configured)

Required GitHub secrets for deployment: `RENDER_API_KEY`, `RENDER_SERVICE_ID`.

## Security

- `config.json` is in `.gitignore` -- never commit API keys
- In production, use the `OPENAI_API_KEY` environment variable instead of `config.json`
- The CI pipeline scans for exposed secrets automatically
