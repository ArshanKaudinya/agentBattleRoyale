#### Disabled (I ran out of credits)
---
# Agent Battle Royale

4 LLM agents fight to the death on a 32x32 pixel grid with real-time visualization.

Built for **Build India '26** with Claude. Hosted on Replit.

## Agents

| Agent | Model | Provider |
|-------|-------|----------|
| GPT-4 | gpt-4o | OpenAI |
| Claude | claude-sonnet-4 | Anthropic |
| Haiku | claude-haiku-4-5 | Anthropic |
| GPT-Mini | gpt-4o-mini | OpenAI |

Each agent picks an archetype (Berserker, Tank, Scout, Mage), gets a random charm, and fights using LLM-driven decisions every turn.

## Setup

```bash
npm install
```

Create a `.env` file:

```
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
```

## Run

```bash
npm start
```

Open `http://localhost:3000` and hit **START**.

## How It Works

- 32x32 grid arena with shrinking zone (battle royale style)
- Agents choose actions via LLM calls each turn (move, attack, defend, use charm)
- Fastest LLM response acts first
- Items spawn every 3 turns, zone shrinks every 8
- Last agent standing wins
