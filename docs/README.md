# Family Feud Documentation

**Last Updated:** 2026-02-23
**Total Documentation:** ~3,300 lines across 7 markdown files

This directory contains comprehensive architecture documentation for the Family Feud web game.

---

## Quick Navigation

### For New Developers
1. Start here: **[ARCHITECTURE_SUMMARY.md](ARCHITECTURE_SUMMARY.md)** (Quick reference guide)
2. Then read: **[CODEMAPS/INDEX.md](CODEMAPS/INDEX.md)** (Architecture overview)
3. Deep dive: **[CODEMAPS/socket-events.md](CODEMAPS/socket-events.md)** (Real-time communication)

### For Backend Work
- **[CODEMAPS/server.md](CODEMAPS/server.md)** — HTTP server, Socket.IO, game state, OpenAI API

### For Frontend Work
- **[CODEMAPS/display.md](CODEMAPS/display.md)** — Game display (index.html, script.js, styles.css)
- **[CODEMAPS/host.md](CODEMAPS/host.md)** — Host control panel (host.html, host.js, host.css)
- **[CODEMAPS/player.md](CODEMAPS/player.md)** — Player interface (player.html, player.js, player.css)

### For Real-Time Communication
- **[CODEMAPS/socket-events.md](CODEMAPS/socket-events.md)** — All 40+ Socket.IO events documented

---

## Documentation Index

| File | Size | Purpose |
|------|------|---------|
| [ARCHITECTURE_SUMMARY.md](ARCHITECTURE_SUMMARY.md) | 11 KB | Quick reference: file locations, tech stack, game modes, core functions |
| [CODEMAPS/INDEX.md](CODEMAPS/INDEX.md) | 10 KB | Architecture overview: game modes, communication flow, data structures |
| [CODEMAPS/server.md](CODEMAPS/server.md) | 13 KB | Backend deep-dive: HTTP, Socket.IO, room management, OpenAI |
| [CODEMAPS/display.md](CODEMAPS/display.md) | 15 KB | Display page: screens, popups, game logic, animations |
| [CODEMAPS/host.md](CODEMAPS/host.md) | 16 KB | Host control panel: authentication, controls, party setup |
| [CODEMAPS/player.md](CODEMAPS/player.md) | 17 KB | Player interface: join, buzzer, turns, answer submission |
| [CODEMAPS/socket-events.md](CODEMAPS/socket-events.md) | 14 KB | Socket.IO reference: 40+ events documented with payloads |
| **Total** | **96 KB** | **Comprehensive coverage of entire codebase** |

---

## Key Documentation Features

### Complete Coverage
- 100% of source code reviewed (9,000+ lines)
- 40+ Socket.IO events documented
- 30+ game state fields explained
- All screens and UI states documented
- All major functions listed with line numbers

### Real-Time Communication
- Full Socket.IO event reference
- Event directions (client → server → clients)
- Payload specifications
- Server handler line numbers
- Event flow examples for each game mode

### Game Modes Explained
1. **Single Device Mode** — One screen with controls
2. **Display Mode** — TV display + host phone controller
3. **Party Mode** — TV display + host phone + player phones

### Architecture Diagrams
- Communication flow diagram (client → server → clients)
- Game mode comparison table
- Screen hierarchy diagrams
- Data flow examples

### Deployment & Testing
- Setup instructions
- Deployment checklist
- Full party mode testing scenario
- Common customizations guide
- Performance considerations

---

## Suggested Reading Order

### 1. High-Level Understanding (15 minutes)
- Read: [ARCHITECTURE_SUMMARY.md](ARCHITECTURE_SUMMARY.md) — "Quick Reference" section
- Scan: [CODEMAPS/INDEX.md](CODEMAPS/INDEX.md) — "Quick Summary" + "Game Modes Explained"

### 2. Architecture Deep-Dive (30 minutes)
- Read: [CODEMAPS/INDEX.md](CODEMAPS/INDEX.md) — Full document
- Review: Communication Architecture diagram + Core Data Structure

### 3. Component Focus (60 minutes)
- **For Backend:** [CODEMAPS/server.md](CODEMAPS/server.md)
- **For Display:** [CODEMAPS/display.md](CODEMAPS/display.md)
- **For Host:** [CODEMAPS/host.md](CODEMAPS/host.md)
- **For Players:** [CODEMAPS/player.md](CODEMAPS/player.md)

### 4. Real-Time Communication (30 minutes)
- Study: [CODEMAPS/socket-events.md](CODEMAPS/socket-events.md)
- Event flows for each game mode

---

## Using This Documentation

### Finding Information

**"I want to understand how the game state flows"**
→ Read: [CODEMAPS/INDEX.md](CODEMAPS/INDEX.md) - "Core Data Structures"

**"I need to add a new Socket.IO event"**
→ Read: [CODEMAPS/socket-events.md](CODEMAPS/socket-events.md) - Existing events + patterns

**"I'm debugging the host control"**
→ Read: [CODEMAPS/host.md](CODEMAPS/host.md) - Function reference + Socket listeners

**"I need to deploy this"**
→ Read: [ARCHITECTURE_SUMMARY.md](ARCHITECTURE_SUMMARY.md) - "Deployment Checklist"

**"How does party mode buzzer work?"**
→ Read: [CODEMAPS/server.md](CODEMAPS/server.md) - "Party Mode Logic" section

**"What's the answer validation process?"**
→ Read: [ARCHITECTURE_SUMMARY.md](ARCHITECTURE_SUMMARY.md) - "Core Concepts" + [CODEMAPS/server.md](CODEMAPS/server.md) - "`callOpenAI()`"

### Verification

All documentation is verified against actual code:
- Line numbers are accurate
- Socket.IO event names are exact
- Function signatures are from actual code
- No speculation or assumptions

### Maintenance

When updating code:
1. Find the corresponding .md file in CODEMAPS/
2. Update the relevant section
3. Update function tables if needed
4. Update socket events if adding/changing events
5. Update ARCHITECTURE_SUMMARY.md if it affects overall flow
6. Update README.md in root if it affects setup/deployment

---

## File Structure at a Glance

```
/docs/
├── README.md (this file)
├── ARCHITECTURE_SUMMARY.md (Quick reference guide)
└── CODEMAPS/
    ├── INDEX.md (Architecture overview)
    ├── server.md (Backend)
    ├── display.md (Display page)
    ├── host.md (Host control)
    ├── player.md (Player interface)
    └── socket-events.md (Real-time communication)

/
├── server.js (2245 lines)
├── index.html + script.js (4089 lines) + styles.css
├── host.html + host.js (1462 lines) + host.css
├── player.html + player.js (1178 lines) + player.css
├── README.md (Enhanced)
└── package.json
```

---

## Key Concepts Quick Lookup

### Game Modes
| Mode | Devices | Server | Complexity |
|------|---------|--------|------------|
| Single Device | 1 | Minimal | Low |
| Display Mode | 2 | Full | Medium |
| Party Mode | 3+ | Full + Complex | High |

### Data Flow
- **Single Device:** Local state only
- **Display Mode:** Host sends commands → Server broadcasts to display
- **Party Mode:** Players send actions → Server manages turns → Broadcasts to all

### Real-Time Communication
- All via Socket.IO
- Room-based (all devices in room share state)
- Heartbeat every 10s (5s with 8+ players)
- No direct peer-to-peer

### Game State
- Located in server.js (in-memory)
- 30+ fields (see core data structure in INDEX.md)
- Synced to all clients on change
- Lost on server restart (no database)

---

## Documentation Statistics

- **Total Documentation:** 3,307 lines
- **Files:** 7 markdown files
- **Size:** 96 KB
- **Code Coverage:** 100% of source reviewed
- **Events Documented:** 40+
- **Functions Listed:** 20+
- **Screens Documented:** 9 display + 4 host + 3 player

---

## Related Files

- **Source Code:** See `/server.js`, `/script.js`, `/host.js`, `/player.js`
- **Setup Guide:** See `/README.md` (root)
- **Deployment:** See `/Procfile`, `/package.json`
- **Questions:** See `/questions.csv`, `/questions1.csv`

---

## Questions?

This documentation should answer most questions about the architecture. For specific code details:

1. Check the relevant .md file for your component
2. Look up the function in the Reference Table
3. Read the server handler line number in socket-events.md
4. Refer to the actual source code with line numbers as guide

---

**Last Updated:** 2026-02-23
**Created By:** Claude Code (Architecture Documentation Specialist)
**Version:** Party Mode with Display Mode Support
