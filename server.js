require('dotenv').config();

const express = require('express');
const path = require('path');
const { initGame, runGame, stopGame, isGameRunning, addSSEClient } = require('./game/engine');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let gameState = null;

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start a new game
app.post('/api/start', async (req, res) => {
  if (isGameRunning()) {
    return res.status(400).json({ error: 'Game already running' });
  }

  try {
    // Extract and validate obstacles
    const obstacles = req.body.obstacles || [];

    if (obstacles.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 obstacles allowed' });
    }

    for (const obs of obstacles) {
      if (!Array.isArray(obs) || obs.length !== 2 ||
          obs[0] < 0 || obs[0] >= 32 || obs[1] < 0 || obs[1] >= 32) {
        return res.status(400).json({ error: 'Invalid obstacle coordinates' });
      }
    }

    gameState = await initGame(obstacles);
    res.json({ status: 'started', agents: gameState.agents });

    // Run game loop in background
    runGame(gameState).catch(err => {
      console.error('Game loop error:', err);
    });
  } catch (err) {
    console.error('Failed to start game:', err);
    res.status(500).json({ error: 'Failed to start game: ' + err.message });
  }
});

// Get current game state
app.get('/api/state', (req, res) => {
  if (!gameState) {
    return res.json({ meta: { phase: 'waiting' } });
  }
  res.json(gameState);
});

// Reset the game
app.post('/api/reset', (req, res) => {
  stopGame();
  gameState = null;
  res.json({ status: 'reset' });
});

// SSE endpoint for real-time updates
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`);

  // If game is already running, send current state
  if (gameState) {
    res.write(`event: state_sync\ndata: ${JSON.stringify(gameState)}\n\n`);
  }

  // Register this client for future events
  addSSEClient(res);

  // Keep alive ping every 30s
  const keepAlive = setInterval(() => {
    try {
      res.write(`:keepalive\n\n`);
    } catch (e) {
      clearInterval(keepAlive);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Agent Battle Royale running on http://localhost:${PORT}`);
  console.log('Press Start to begin the battle!');
});
