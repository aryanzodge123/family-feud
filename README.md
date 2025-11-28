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

[GitHub Repository](https://github.com/aryanzodge123/family-feud) - View the source code on GitHub

## CI/CD Pipeline

This repository uses GitHub Actions for continuous integration and deployment. Every push to the `main` branch automatically triggers:

1. **Secret Scanning** - Scans the codebase for exposed API keys, tokens, or credentials
2. **Build & Validation** - Validates Node.js syntax and ensures all required files are present
3. **Deployment** - Automatically deploys to production (if configured)

### Workflow Details

The CI/CD pipeline runs on:
- Every push to `main` or `master` branch
- Pull requests to `main` or `master` branch

### Setting Up Deployment

#### Option 1: Deploy to Render (Recommended)

1. **Create a Render Account**
   - Sign up at https://render.com
   - Create a new Web Service
   - Connect your GitHub repository

2. **Configure GitHub Secrets**
   - Go to your repository Settings → Secrets and variables → Actions
   - Add the following secrets:
     - `RENDER_API_KEY`: Get from https://dashboard.render.com/account/api-keys
     - `RENDER_SERVICE_ID`: Found in your Render service settings (Service Details)

3. **Configure Render Environment Variables**
   - In your Render dashboard, go to your service → Environment
   - Add: `OPENAI_API_KEY` = your OpenAI API key
   - The `PORT` variable is automatically set by Render

4. **Automatic Deployments**
   - Once configured, every push to `main` will trigger a deployment
   - Render will automatically detect the `Procfile` and deploy your service

#### Option 2: Other Platforms

The workflow can be adapted for other platforms like Railway, Fly.io, or Heroku by modifying the deployment job in `.github/workflows/deploy.yml`.

### Required GitHub Secrets

For automated deployment, you need to configure these secrets in your GitHub repository:

- `RENDER_API_KEY` (if using Render) - Your Render API key
- `RENDER_SERVICE_ID` (if using Render) - Your Render service ID

**Note:** The OpenAI API key should be configured in your hosting platform's environment variables, NOT in GitHub secrets for security.

### Local Development vs Production

- **Local Development**: Uses `config.json` file for the API key
- **Production**: Uses `OPENAI_API_KEY` environment variable (more secure)
- The server automatically detects which method to use

## Security Note

The `config.json` file contains your API key and should never be committed to version control. It's already included in `.gitignore`. Always use `config.json.example` as a template for creating your local `config.json` file.

The CI/CD pipeline automatically scans for secrets and will fail if any credentials are detected in committed files.

