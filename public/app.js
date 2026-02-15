// Frontend orchestrator - SSE client, state management, UI updates

let currentState = null;
let eventSource = null;
let gamePhase = 'waiting'; // waiting, initializing, running, finished

// DOM elements
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const turnDisplay = document.getElementById('turn-display');
const zoneDisplay = document.getElementById('zone-display');
const phaseDisplay = document.getElementById('phase-display');
const combatLog = document.getElementById('combat-log');
const agentCards = document.getElementById('agent-cards');
const killFeed = document.getElementById('kill-feed');
const victoryOverlay = document.getElementById('victory-overlay');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.RENDERER.initRenderer();
  connectSSE();

  startBtn.addEventListener('click', startGame);
  resetBtn.addEventListener('click', resetGame);

  // Initial state fetch
  fetchState();
});

// SSE Connection
function connectSSE() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource('/api/events');

  eventSource.addEventListener('connected', (e) => {
    console.log('SSE connected');
  });

  eventSource.addEventListener('state_sync', (e) => {
    const state = JSON.parse(e.data);
    currentState = state;
    updateUI(state);
  });

  eventSource.addEventListener('game_init', (e) => {
    const data = JSON.parse(e.data);
    gamePhase = 'initializing';
    phaseDisplay.textContent = 'SELECTING ARCHETYPES...';
    phaseDisplay.className = 'phase-badge initializing';
    addLogEntry('Battle Royale initializing! Agents choosing archetypes...', 'system');
  });

  eventSource.addEventListener('archetype_chosen', (e) => {
    const data = JSON.parse(e.data);
    addLogEntry(
      `${data.agentId.toUpperCase()} chose ${data.archetype.toUpperCase()} (${data.responseTime}ms): "${data.reasoning}"`,
      'archetype',
      data.agentId
    );
  });

  eventSource.addEventListener('game_start', (e) => {
    const data = JSON.parse(e.data);
    gamePhase = 'running';
    currentState = { meta: { phase: 'running', turn: 1, zone: data.zone }, agents: data.agents, items: [], combat_log: [] };
    phaseDisplay.textContent = 'BATTLE IN PROGRESS';
    phaseDisplay.className = 'phase-badge running';
    updateAgentCards(data.agents);
    window.RENDERER.startAnimationLoop(() => currentState);
    addLogEntry('FIGHT! The Battle Royale has begun!', 'system');
  });

  eventSource.addEventListener('turn_start', (e) => {
    const data = JSON.parse(e.data);
    if (currentState) {
      currentState.meta.turn = data.turn;
      currentState.meta.zone = data.zone;
      currentState.agents = data.agents;
    }
    turnDisplay.textContent = data.turn;
    zoneDisplay.textContent = data.zone.radius;

    // Zone shrink warning
    const turnsUntilShrink = data.zone.next_shrink_turn - data.turn;
    if (turnsUntilShrink <= 2 && turnsUntilShrink > 0) {
      zoneDisplay.classList.add('warning');
    } else {
      zoneDisplay.classList.remove('warning');
    }
  });

  eventSource.addEventListener('action_executed', (e) => {
    const data = JSON.parse(e.data);

    // Show reasoning bubble
    if (currentState && currentState.agents[data.agentId]) {
      const agent = currentState.agents[data.agentId];
      window.RENDERER.showSpeechBubble(data.agentId, data.reasoning, agent.position);
    }

    // Process visual effects
    if (data.events) {
      for (const evt of data.events) {
        processVisualEvent(evt);
      }
    }

    // Log the action
    const actionText = formatAction(data.agentId, data.action, data.responseTime);
    addLogEntry(actionText, 'action', data.agentId);

    // Update agent card with response time
    updateAgentResponseTime(data.agentId, data.responseTime, data.timedOut);
  });

  eventSource.addEventListener('zone_damage', (e) => {
    const data = JSON.parse(e.data);
    if (currentState && currentState.agents[data.agentId]) {
      currentState.agents[data.agentId].health = data.health;
      addLogEntry(`${data.agentId.toUpperCase()} takes ${data.damage} zone damage! (${data.health} HP)`, 'zone', data.agentId);
    }
  });

  eventSource.addEventListener('agent_eliminated', (e) => {
    const data = JSON.parse(e.data);
    if (currentState && currentState.agents[data.agentId]) {
      currentState.agents[data.agentId].is_alive = false;
      currentState.agents[data.agentId].health = 0;
    }
    addLogEntry(`${data.agentId.toUpperCase()} has been ELIMINATED!`, 'elimination');
    showKillFeed(data.agentId);
    updateAgentCards(currentState?.agents);
  });

  eventSource.addEventListener('item_spawned', (e) => {
    const data = JSON.parse(e.data);
    if (currentState) {
      currentState.items.push(data.item);
    }
  });

  eventSource.addEventListener('zone_shrink', (e) => {
    const data = JSON.parse(e.data);
    if (currentState) {
      currentState.meta.zone.radius = data.radius;
      currentState.meta.zone.next_shrink_turn = data.next_shrink;
    }
    zoneDisplay.textContent = data.radius;
    addLogEntry(`ZONE SHRINKS! New radius: ${data.radius}`, 'zone');
  });

  eventSource.addEventListener('turn_end', (e) => {
    const data = JSON.parse(e.data);
    if (currentState) {
      currentState.agents = data.agents;
      currentState.items = data.items;
      currentState.meta.zone = data.zone;
    }
    updateAgentCards(data.agents);
  });

  eventSource.addEventListener('game_over', (e) => {
    const data = JSON.parse(e.data);
    gamePhase = 'finished';
    phaseDisplay.textContent = 'GAME OVER';
    phaseDisplay.className = 'phase-badge finished';
    addLogEntry(`${data.winner.toUpperCase()} WINS THE BATTLE ROYALE!`, 'victory');
    showVictory(data.winner, data.winnerAgent, data.turn);
    startBtn.disabled = false;
  });

  eventSource.onerror = () => {
    console.log('SSE connection lost, reconnecting...');
    setTimeout(connectSSE, 2000);
  };
}

function processVisualEvent(evt) {
  if (!currentState) return;

  switch (evt.type) {
    case 'attack': {
      const attacker = currentState.agents[evt.attackerId];
      const target = currentState.agents[evt.targetId];
      if (attacker && target) {
        window.RENDERER.addAttackEffect(attacker.position, target.position, attacker.color);
        window.RENDERER.addDamageEffect(target.position, evt.damage);
        // Update health in our local state
        target.health = evt.targetHealth;
      }
      break;
    }
    case 'self_damage': {
      const agent = currentState.agents[evt.agentId];
      if (agent) {
        window.RENDERER.addDamageEffect(agent.position, evt.damage);
      }
      break;
    }
    case 'reversal': {
      const attacker = currentState.agents[evt.attackerId];
      if (attacker) {
        window.RENDERER.addExplosionEffect(attacker.position);
        window.RENDERER.addDamageEffect(attacker.position, evt.damage);
      }
      break;
    }
    case 'shield_break': {
      const target = currentState.agents[evt.targetId];
      if (target) {
        window.RENDERER.addExplosionEffect(target.position);
      }
      break;
    }
    case 'move': {
      // Agent moved - local state will update on turn_end
      break;
    }
    case 'charm': {
      const agent = currentState.agents[evt.agentId];
      if (agent) {
        window.RENDERER.addHealEffect(agent.position, '');
      }
      break;
    }
    case 'pickup': {
      addLogEntry(`${evt.agentId.toUpperCase()} picked up ${evt.item.replace('_', ' ')}!`, 'pickup', evt.agentId);
      break;
    }
  }
}

function formatAction(agentId, action, responseTime) {
  const name = agentId.toUpperCase();
  const ms = responseTime ? `(${responseTime}ms)` : '';

  switch (action.action) {
    case 'move':
      return `${name} moves ${action.params?.direction} ${action.params?.tiles || 1} tiles ${ms}`;
    case 'attack':
      return `${name} attacks ${action.params?.target_id?.toUpperCase()} with ${action.params?.attack_type || 'melee'} ${ms}`;
    case 'defend':
      return `${name} defends ${ms}`;
    case 'use_charm':
      return `${name} uses their lucky charm! ${ms}`;
    default:
      return `${name} does something ${ms}`;
  }
}

// UI Updates
function updateAgentCards(agents) {
  if (!agents) return;

  const leftSidebar = document.getElementById('sidebar-left');
  const rightSidebar = document.getElementById('sidebar-right');
  leftSidebar.innerHTML = '';
  rightSidebar.innerHTML = '';

  const agentList = Object.values(agents);

  for (let i = 0; i < agentList.length; i++) {
    const agent = agentList[i];
    const card = document.createElement('div');
    card.className = `agent-card ${agent.is_alive ? '' : 'dead'}`;
    card.style.borderColor = agent.color || '#444';

    const healthPct = Math.max(0, (agent.health / agent.max_health) * 100);
    let healthColor = '#00ff00';
    if (healthPct <= 25) healthColor = '#ff4444';
    else if (healthPct <= 50) healthColor = '#ffaa00';

    // Draw mini sprite
    const miniCanvas = document.createElement('canvas');
    miniCanvas.width = 30;
    miniCanvas.height = 30;
    miniCanvas.className = 'mini-sprite';
    const miniCtx = miniCanvas.getContext('2d');
    miniCtx.imageSmoothingEnabled = false;

    let sprite;
    if (agent.is_alive) {
      sprite = window.PIXELS.generateAgentSprite(agent.id, agent.archetype);
    } else {
      sprite = window.PIXELS.generateDeadSprite();
    }
    if (sprite) {
      drawSpriteToCtx(miniCtx, sprite, 0, 0, 30, 30);
    }

    const effectsHtml = [];
    if (agent.has_shield) effectsHtml.push('<span class="effect-badge shield">SHIELD</span>');
    if (agent.is_defending) effectsHtml.push('<span class="effect-badge defend">DEF</span>');
    if (agent.has_reversal_active) effectsHtml.push('<span class="effect-badge reversal">REV</span>');
    if (agent.active_effects) {
      for (const eff of agent.active_effects) {
        effectsHtml.push(`<span class="effect-badge buff">${eff.type.replace('_', ' ').toUpperCase()} (${eff.turns_left})</span>`);
      }
    }

    card.innerHTML = `
      <div class="agent-header">
        <div class="agent-sprite-container"></div>
        <div class="agent-info">
          <div class="agent-name" style="color: ${agent.color}">${agent.name}</div>
          <div class="agent-archetype">${agent.archetype ? agent.archetype.toUpperCase() : '?'}</div>
        </div>
        <div class="agent-response-time" id="rt-${agent.id}"></div>
      </div>
      <div class="health-bar-container">
        <div class="health-bar-fill" style="width: ${healthPct}%; background: ${healthColor}"></div>
        <span class="health-text">${Math.max(0, agent.health)}/${agent.max_health}</span>
      </div>
      <div class="agent-details">
        <span class="stat">ATK:${agent.stats?.attack || '?'}</span>
        <span class="stat">DEF:${agent.stats?.defense || '?'}</span>
        <span class="stat">SPD:${agent.stats?.speed || '?'}</span>
      </div>
      <div class="agent-charm">
        Charm: ${agent.charm ? `${agent.charm.type.toUpperCase()} ${agent.charm.uses_left > 0 ? '✦' : '✗'}` : 'None'}
      </div>
      <div class="agent-effects">${effectsHtml.join(' ')}</div>
      ${agent.reasoning ? `<div class="agent-reasoning">"${truncate(agent.reasoning, 80)}"</div>` : ''}
    `;

    // Insert mini canvas
    const spriteContainer = card.querySelector('.agent-sprite-container');
    spriteContainer.appendChild(miniCanvas);

    // First 2 agents go left, last 2 go right
    if (i < 2) {
      leftSidebar.appendChild(card);
    } else {
      rightSidebar.appendChild(card);
    }
  }
}

function drawSpriteToCtx(targetCtx, sprite, x, y, width, height) {
  const rows = sprite.length;
  const cols = sprite[0].length;
  const pixelW = width / cols;
  const pixelH = height / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const color = sprite[row][col];
      if (color) {
        targetCtx.fillStyle = color;
        targetCtx.fillRect(
          x + col * pixelW,
          y + row * pixelH,
          Math.ceil(pixelW),
          Math.ceil(pixelH)
        );
      }
    }
  }
}

function updateAgentResponseTime(agentId, responseTime, timedOut) {
  const el = document.getElementById(`rt-${agentId}`);
  if (el) {
    el.textContent = timedOut ? 'TIMEOUT' : `${responseTime}ms`;
    el.className = `agent-response-time ${timedOut ? 'timeout' : responseTime < 2000 ? 'fast' : 'slow'}`;
  }
}

function addLogEntry(text, type, agentId) {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type || 'info'}`;

  if (agentId) {
    const colors = {
      gpt: '#10a37f',
      claude: '#d4886f',
      gemini: '#4285f4',
      mini: '#9333ea'
    };
    entry.style.borderLeftColor = colors[agentId] || '#444';
  }

  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.innerHTML = `<span class="log-time">${timeStr}</span> ${text}`;

  combatLog.appendChild(entry);
  combatLog.scrollTop = combatLog.scrollHeight;

  // Keep last 100 entries
  while (combatLog.children.length > 100) {
    combatLog.removeChild(combatLog.firstChild);
  }
}

function showKillFeed(agentId) {
  const entry = document.createElement('div');
  entry.className = 'kill-entry';
  entry.textContent = `☠ ${agentId.toUpperCase()} ELIMINATED`;
  killFeed.appendChild(entry);

  // Fade out after 4 seconds
  setTimeout(() => {
    entry.classList.add('fade-out');
    setTimeout(() => entry.remove(), 1000);
  }, 4000);
}

function showVictory(winnerId, winnerAgent, turn) {
  victoryOverlay.classList.add('visible');

  const colors = {
    gpt: '#10a37f',
    claude: '#d4886f',
    gemini: '#4285f4',
    mini: '#9333ea'
  };

  // Draw big sprite
  const bigCanvas = document.getElementById('victory-sprite');
  bigCanvas.width = 120;
  bigCanvas.height = 120;
  const bigCtx = bigCanvas.getContext('2d');
  bigCtx.imageSmoothingEnabled = false;

  const sprite = window.PIXELS.generateAgentSprite(winnerId, winnerAgent.archetype);
  if (sprite) {
    drawSpriteToCtx(bigCtx, sprite, 0, 0, 120, 120);
  }

  document.getElementById('victory-name').textContent = winnerAgent.name;
  document.getElementById('victory-name').style.color = colors[winnerId] || '#fff';
  document.getElementById('victory-archetype').textContent = winnerAgent.archetype.toUpperCase();
  document.getElementById('victory-stats').textContent =
    `${winnerAgent.health} HP remaining | Turn ${turn}`;
}

function hideVictory() {
  victoryOverlay.classList.remove('visible');
}

async function startGame() {
  startBtn.disabled = true;
  hideVictory();
  combatLog.innerHTML = '';

  try {
    const res = await fetch('/api/start', { method: 'POST' });
    const data = await res.json();

    if (data.error) {
      addLogEntry(`Error: ${data.error}`, 'error');
      startBtn.disabled = false;
    }
  } catch (err) {
    addLogEntry(`Failed to start: ${err.message}`, 'error');
    startBtn.disabled = false;
  }
}

async function resetGame() {
  try {
    await fetch('/api/reset', { method: 'POST' });
    currentState = null;
    gamePhase = 'waiting';
    phaseDisplay.textContent = 'WAITING';
    phaseDisplay.className = 'phase-badge waiting';
    turnDisplay.textContent = '0';
    zoneDisplay.textContent = '16';
    agentCards.innerHTML = '';
    combatLog.innerHTML = '';
    killFeed.innerHTML = '';
    startBtn.disabled = false;
    hideVictory();
    window.RENDERER.stopAnimationLoop();
    // Reconnect SSE
    connectSSE();
  } catch (err) {
    console.error('Reset error:', err);
  }
}

async function fetchState() {
  try {
    const res = await fetch('/api/state');
    const state = await res.json();
    if (state.meta && state.meta.phase !== 'waiting') {
      currentState = state;
      updateUI(state);
    }
  } catch (err) {
    console.error('State fetch error:', err);
  }
}

function updateUI(state) {
  if (!state || !state.meta) return;

  turnDisplay.textContent = state.meta.turn || 0;
  zoneDisplay.textContent = state.meta.zone?.radius || 16;

  if (state.agents) {
    updateAgentCards(state.agents);
  }

  if (state.meta.phase === 'running') {
    gamePhase = 'running';
    phaseDisplay.textContent = 'BATTLE IN PROGRESS';
    phaseDisplay.className = 'phase-badge running';
    startBtn.disabled = true;
    window.RENDERER.startAnimationLoop(() => currentState);
  } else if (state.meta.phase === 'finished') {
    gamePhase = 'finished';
    phaseDisplay.textContent = 'GAME OVER';
    phaseDisplay.className = 'phase-badge finished';
    startBtn.disabled = false;
    if (state.meta.winner && state.agents[state.meta.winner]) {
      showVictory(state.meta.winner, state.agents[state.meta.winner], state.meta.turn);
    }
  }
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}
