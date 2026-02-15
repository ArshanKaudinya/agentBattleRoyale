const {
  GRID_SIZE, MAX_TURNS, ZONE_SHRINK_INTERVAL, ZONE_SHRINK_AMOUNT,
  ZONE_DAMAGE, SPAWN_INTERVAL, TURN_DELAY_MS, ZONE_INITIAL,
  generateStartingPositions, AGENTS
} = require('./constants');
const { ARCHETYPES } = require('./archetypes');
const { CHARMS } = require('./charms');
const { isInZone } = require('./grid');
const { executeAction, tickCooldowns, tickEffects } = require('./combat');
const { spawnDrop } = require('./spawns');
const { buildArchetypeSelectionPrompt, buildTurnPrompt } = require('../llm/prompt');
const { getAllActions, getArchetypeChoices } = require('../llm/provider');

// SSE clients
let sseClients = [];

function addSSEClient(res) {
  sseClients.push(res);
  res.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
}

function emitEvent(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      // Client disconnected
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function createAgent(agentDef, archetype, charm, position) {
  const arch = ARCHETYPES[archetype];
  return {
    id: agentDef.id,
    name: agentDef.name,
    model: agentDef.model,
    color: agentDef.color,
    archetype: archetype,
    position: [...position],
    health: arch.health,
    max_health: arch.health,
    stats: {
      attack: arch.attack,
      defense: arch.defense,
      speed: arch.speed
    },
    attacks: JSON.parse(JSON.stringify(arch.attacks)),
    charm: {
      type: charm,
      uses_left: 1
    },
    cooldowns: {
      defend: 0,
      ...Object.fromEntries(
        Object.keys(arch.attacks).map(k => [k, 0])
      )
    },
    active_effects: [],
    damage_bonus: 0,
    speed_bonus: 0,
    has_shield: false,
    is_defending: false,
    has_reversal_active: false,
    last_action: null,
    is_alive: true,
    reasoning: ''
  };
}

async function initGame() {
  const gameState = {
    meta: {
      turn: 1,
      phase: 'initializing',
      zone: {
        center: [...ZONE_INITIAL.center],
        radius: ZONE_INITIAL.radius,
        next_shrink_turn: ZONE_SHRINK_INTERVAL + 1
      }
    },
    agents: {},
    items: [],
    combat_log: [],
    events: []
  };

  emitEvent('game_init', { phase: 'archetype_selection' });

  // Phase 1: Each LLM chooses an archetype
  console.log('=== ARCHETYPE SELECTION ===');
  const agentDefs = AGENTS.map((a, i) => ({ ...a, index: i }));
  const choices = await getArchetypeChoices(agentDefs, buildArchetypeSelectionPrompt);

  // Resolve archetype choices (no duplicates)
  const availableArchetypes = ['berserker', 'tank', 'scout', 'mage'];
  const assignedArchetypes = {};

  // Sort by response time (fastest gets first pick)
  const sortedChoices = [...choices].sort((a, b) => a.responseTime - b.responseTime);

  for (const choice of sortedChoices) {
    let archetype = choice.parsed?.archetype?.toLowerCase();

    // Validate and handle duplicates
    if (!archetype || !availableArchetypes.includes(archetype)) {
      // Pick random from remaining
      archetype = availableArchetypes[Math.floor(Math.random() * availableArchetypes.length)];
    }

    assignedArchetypes[choice.agentId] = archetype;
    availableArchetypes.splice(availableArchetypes.indexOf(archetype), 1);

    const reasoning = choice.parsed?.reasoning || 'No reasoning provided';
    console.log(`  ${choice.agentId} chose ${archetype} (${choice.responseTime}ms): "${reasoning}"`);

    emitEvent('archetype_chosen', {
      agentId: choice.agentId,
      archetype,
      reasoning,
      responseTime: choice.responseTime
    });

    await sleep(500); // Brief pause for frontend animation
  }

  // Phase 2: Assign random charms
  const charmTypes = shuffleArray(['rage', 'teleport', 'heal', 'reversal']);

  // Phase 3: Create agents at random positions inside zone
  const startingPositions = generateStartingPositions();
  for (let i = 0; i < AGENTS.length; i++) {
    const agentDef = AGENTS[i];
    const archetype = assignedArchetypes[agentDef.id];
    const charm = charmTypes[i];
    const position = startingPositions[i];

    gameState.agents[agentDef.id] = createAgent(agentDef, archetype, charm, position);

    console.log(`  ${agentDef.id}: ${archetype} with ${charm} charm at [${position}]`);
  }

  gameState.meta.phase = 'running';

  gameState.combat_log.push({
    turn: 0,
    event: 'Battle Royale begins! 4 agents enter, 1 survives.',
    type: 'system'
  });

  emitEvent('game_start', {
    agents: gameState.agents,
    zone: gameState.meta.zone
  });

  return gameState;
}

async function runRound(gameState) {
  const turn = gameState.meta.turn;
  console.log(`\n=== TURN ${turn} ===`);

  emitEvent('turn_start', {
    turn,
    zone: gameState.meta.zone,
    agents: gameState.agents
  });

  // Get alive agents
  const aliveAgents = Object.values(gameState.agents).filter(a => a.is_alive);

  if (aliveAgents.length <= 1) {
    return checkWinCondition(gameState);
  }

  // Reset defending status at start of turn
  for (const agent of aliveAgents) {
    // is_defending resets if it was set from a previous turn's defense action
    // (it persists for one turn, then the attack resolution consumes it)
  }

  // Get all actions from LLMs in parallel
  const actions = await getAllActions(aliveAgents, buildTurnPrompt, gameState);

  // Execute actions in order (fastest responder first)
  for (const result of actions) {
    const agent = gameState.agents[result.agentId];
    if (!agent || !agent.is_alive) continue;

    const reasoning = result.parsed.reasoning || '';
    agent.reasoning = reasoning;

    console.log(`  ${result.agentId} (${result.responseTime}ms): ${result.parsed.action} - "${reasoning}"`);

    const events = executeAction(result.agentId, result.parsed, gameState);

    emitEvent('action_executed', {
      agentId: result.agentId,
      action: result.parsed,
      reasoning,
      responseTime: result.responseTime,
      events,
      timedOut: result.timedOut,
      error: result.error
    });

    // Brief pause between actions for visual effect
    await sleep(300);
  }

  // Tick cooldowns and effects for all alive agents
  for (const agent of Object.values(gameState.agents)) {
    if (agent.is_alive) {
      tickCooldowns(agent);
      tickEffects(agent);
    }
  }

  // Apply zone damage
  for (const agent of Object.values(gameState.agents)) {
    if (agent.is_alive && !isInZone(agent.position, gameState.meta.zone)) {
      agent.health -= ZONE_DAMAGE;
      gameState.combat_log.push({
        turn,
        event: `${agent.id} is outside the zone! -${ZONE_DAMAGE} HP (${agent.health} remaining)`,
        type: 'zone_damage'
      });
      emitEvent('zone_damage', { agentId: agent.id, damage: ZONE_DAMAGE, health: agent.health });
    }
  }

  // Check deaths
  const eliminations = [];
  for (const agent of Object.values(gameState.agents)) {
    if (agent.is_alive && agent.health <= 0) {
      agent.is_alive = false;
      agent.health = 0;
      eliminations.push(agent.id);
      gameState.combat_log.push({
        turn,
        event: `${agent.id} has been ELIMINATED!`,
        type: 'elimination'
      });
      console.log(`  *** ${agent.id} ELIMINATED ***`);
      emitEvent('agent_eliminated', {
        agentId: agent.id,
        turn
      });
    }
  }

  // Spawn drops every 3 turns
  if (turn % SPAWN_INTERVAL === 0 && turn > 0) {
    const item = spawnDrop(gameState);
    emitEvent('item_spawned', { item });
  }

  // Shrink zone
  if (turn % ZONE_SHRINK_INTERVAL === 0 && turn > 0) {
    gameState.meta.zone.radius = Math.max(
      4,
      gameState.meta.zone.radius - ZONE_SHRINK_AMOUNT
    );
    gameState.meta.zone.next_shrink_turn = turn + ZONE_SHRINK_INTERVAL;
    gameState.combat_log.push({
      turn,
      event: `Zone shrinks! New radius: ${gameState.meta.zone.radius}`,
      type: 'zone_shrink'
    });
    console.log(`  Zone shrinks to radius ${gameState.meta.zone.radius}`);
    emitEvent('zone_shrink', {
      radius: gameState.meta.zone.radius,
      next_shrink: gameState.meta.zone.next_shrink_turn
    });
  }

  // Increment turn
  gameState.meta.turn++;

  // Emit turn end
  emitEvent('turn_end', {
    turn,
    agents: gameState.agents,
    items: gameState.items,
    zone: gameState.meta.zone
  });

  // Check win condition
  return checkWinCondition(gameState);
}

function checkWinCondition(gameState) {
  const alive = Object.values(gameState.agents).filter(a => a.is_alive);

  if (alive.length === 1) {
    return alive[0].id;
  }

  if (alive.length === 0) {
    // All dead simultaneously - highest max health wins (shouldn't normally happen)
    return Object.values(gameState.agents).sort((a, b) => b.max_health - a.max_health)[0].id;
  }

  if (gameState.meta.turn > MAX_TURNS) {
    // Time limit - highest HP wins
    const winner = alive.sort((a, b) => b.health - a.health)[0];
    return winner.id;
  }

  return null; // Game continues
}

let gameRunning = false;
let stopRequested = false;

async function runGame(gameState) {
  gameRunning = true;
  stopRequested = false;

  await sleep(1000); // Let frontend connect

  while (gameRunning && !stopRequested) {
    const winner = await runRound(gameState);

    if (winner) {
      gameState.meta.phase = 'finished';
      gameState.meta.winner = winner;

      const winnerAgent = gameState.agents[winner];
      console.log(`\n=== GAME OVER ===`);
      console.log(`Winner: ${winner} (${winnerAgent.archetype}) with ${winnerAgent.health} HP!`);

      gameState.combat_log.push({
        turn: gameState.meta.turn,
        event: `${winner} wins the Battle Royale!`,
        type: 'victory'
      });

      emitEvent('game_over', {
        winner,
        winnerAgent,
        turn: gameState.meta.turn,
        agents: gameState.agents
      });

      gameRunning = false;
      break;
    }

    await sleep(TURN_DELAY_MS);
  }
}

function stopGame() {
  stopRequested = true;
  gameRunning = false;
}

function isGameRunning() {
  return gameRunning;
}

module.exports = { initGame, runGame, stopGame, isGameRunning, addSSEClient, emitEvent };
