# Agent Battle Royale

## Project overview
@README.md

## Stack
- Backend: Node.js + Express (CommonJS `require` syntax)
- Frontend: Vanilla JS + Canvas (no framework)
- Real-time: Server-Sent Events (SSE)
- LLM SDKs: openai, @anthropic-ai/sdk

## Commands
- `npm start` — run server on port 3000
- `npm run dev` — run with --watch for auto-restart

## Architecture
- `server.js` — Express server with 5 API routes
- `game/` — Engine, combat, grid, archetypes, charms, spawns
- `llm/` — Provider orchestration + per-model wrappers (openai.js, openai-mini.js, anthropic.js, anthropic-haiku.js)
- `llm/prompt.js` — Prompt engineering for archetype selection and turn actions
- `public/` — Frontend: app.js (SSE client + UI), renderer.js (canvas), pixels.js (sprites), style.css

## Key patterns
- Game loop runs in `game/engine.js` via `runGame()` → `runRound()` per turn
- LLM calls are parallel with 10s timeout; fastest response acts first
- All LLM responses must be parsed as JSON; fallback to defend on parse failure
- SSE broadcasts game events to all connected clients
- Agent IDs: `gpt`, `claude`, `haiku`, `mini` — these map to provider functions in `llm/provider.js`

## Environment variables
- `OPENAI_API_KEY` — used by gpt (gpt-4o) and mini (gpt-4o-mini)
- `ANTHROPIC_API_KEY` — used by claude (claude-sonnet-4) and haiku (claude-haiku-4-5)

## Code style
- Use CommonJS (require/module.exports), NOT ES modules
- Keep LLM provider files minimal (~20 lines each)
- No TypeScript, no build step
