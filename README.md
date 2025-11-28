# Family Feud Game

A web-based Family Feud game with ChatGPT-powered answer checking.

## Setup

1. **Install Node.js** (if not already installed)
   - Download from https://nodejs.org/

2. **Configure API Key**
   - Copy `config.json.example` to `config.json`
   - Open `config.json` and replace `YOUR_OPENAI_API_KEY_HERE` with your actual OpenAI API key
   - Get your API key from https://platform.openai.com/api-keys

3. **Start the Server**
   ```bash
   node server.js
   ```

4. **Open in Browser**
   - Navigate to `http://localhost:3000`
   - The game will load automatically

## How to Play

1. Click "New Question" to load a question
2. When a player gives an answer, type it in the "Player Answer Check" box
3. Click "Check Answer" or press Enter
4. The system will automatically:
   - Reveal the answer if it matches (and auto-fill points)
   - Add a strike if it doesn't match

## Files

- `index.html` - Main game interface
- `styles.css` - Styling
- `script.js` - Frontend game logic
- `server.js` - Backend server (handles ChatGPT API calls)
- `config.json` - Configuration file (contains API key - **DO NOT COMMIT**)
- `questions.csv` - Game questions and answers
- `package.json` - Node.js dependencies

## GitHub Repository

### Getting Started

To clone and set up this repository:

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd AZ
   ```

2. **Set up configuration**
   ```bash
   cp config.json.example config.json
   ```
   Then edit `config.json` and add your OpenAI API key.

3. **Run the application**
   ```bash
   node server.js
   ```

### Repository

[GitHub Repository](https://github.com/your-username/your-repo-name) - Update this link after creating your repository

## Security Note

The `config.json` file contains your API key and should never be committed to version control. It's already included in `.gitignore`. Always use `config.json.example` as a template for creating your local `config.json` file.

