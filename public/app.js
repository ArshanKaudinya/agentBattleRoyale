// Professional Dashboard - Frontend orchestrator

let currentState = null;
let eventSource = null;
let gamePhase = 'waiting';
let lastActionEvents = []; // Store events from last action for damage display

// DOM elements
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const themeToggle = document.getElementById('theme-toggle');
const turnDisplay = document.getElementById('turn-display');
const zoneDisplay = document.getElementById('zone-display');
const statusText = document.getElementById('status-text');
const combatLog = document.getElementById('combat-log');
const commentaryFeed = document.getElementById('commentary-feed');
const agentCardsContainer = document.getElementById('agent-cards-container');
const liveFeed = document.getElementById('live-feed');
const trashTalk = document.getElementById('trash-talk');
const killFeed = document.getElementById('kill-feed');
const victoryOverlay = document.getElementById('victory-overlay');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.RENDERER.initRenderer();
  connectSSE();

  startBtn.addEventListener('click', startGame);
  resetBtn.addEventListener('click', resetGame);
  themeToggle.addEventListener('click', toggleTheme);

  // Load theme preference
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
  }

  fetchState();
});

// Theme toggle
function toggleTheme() {
  document.body.classList.toggle('light-theme');
  const isLight = document.body.classList.contains('light-theme');
  themeToggle.innerHTML = isLight
    ? '<i class="fa-solid fa-moon"></i>'
    : '<i class="fa-regular fa-sun"></i>';
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

// Helper to highlight agent names with their colors
function highlightAgentName(agentId) {
  const color = window.PIXELS?.AGENT_COLORS?.[agentId] || '#ffffff';
  return `<span style="color: ${color}; font-weight: 600;">${agentId.toUpperCase()}</span>`;
}

// Helper to highlight abilities
function highlightAbility(abilityName) {
  return `<span style="color: #fbbf24; font-weight: 600; text-transform: uppercase;">${abilityName}</span>`;
}

// SSE Connection
function connectSSE() {
  if (eventSource) eventSource.close();

  eventSource = new EventSource('/api/events');

  eventSource.addEventListener('connected', () => {
    console.log('SSE connected');
  });

  eventSource.addEventListener('state_sync', (e) => {
    currentState = JSON.parse(e.data);
    updateUI(currentState);
  });

  eventSource.addEventListener('game_init', () => {
    gamePhase = 'initializing';
    statusText.textContent = 'Selecting archetypes...';
    addLogEntry('system', 'Battle initializing - agents choosing archetypes');
  });

  eventSource.addEventListener('archetype_chosen', (e) => {
    const data = JSON.parse(e.data);
    addLogEntry('system', `${data.agentId.toUpperCase()} chose ${data.archetype.toUpperCase()} (${data.responseTime}ms)`);
    addLiveFeedEntry(0, data.agentId, data.reasoning);
  });

  eventSource.addEventListener('game_start', (e) => {
    const data = JSON.parse(e.data);
    gamePhase = 'running';
    currentState = {
      meta: { phase: 'running', turn: 1, zone: data.zone },
      agents: data.agents,
      items: [],
      combat_log: []
    };
    statusText.textContent = 'Battle in progress';
    updateAgentCards(data.agents);
    window.RENDERER.startAnimationLoop(() => currentState);
    addLogEntry('system', 'BATTLE START - All agents deployed');
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
  });

  eventSource.addEventListener('action_executed', (e) => {
    const data = JSON.parse(e.data);

    // Store events for damage display
    lastActionEvents = data.events || [];

    // Live feed entry
    if (data.reasoning) {
      addLiveFeedEntry(currentState?.meta?.turn || 0, data.agentId, data.reasoning);
    }

    // Trash talk from AI response
    if (data.action.trash_talk) {
      addTrashTalkEntry(currentState?.meta?.turn || 0, data.agentId, data.action.trash_talk);
    }

    // Visual effects
    if (currentState && currentState.agents[data.agentId]) {
      const agent = currentState.agents[data.agentId];
      window.RENDERER.showSpeechBubble(data.agentId, data.reasoning, agent.position);
    }

    if (data.events) {
      data.events.forEach(evt => processVisualEvent(evt));
    }

    // Combat log with timeout handling and damage info
    const actionText = formatActionLog(data.agentId, data.action, data.responseTime, data.timedOut, lastActionEvents);
    addLogEntry(getActionType(data.action.action), actionText);

    // Update agent response time
    updateAgentResponseTime(data.agentId, data.responseTime, data.timedOut);
  });

  eventSource.addEventListener('zone_damage', (e) => {
    const data = JSON.parse(e.data);
    if (currentState && currentState.agents[data.agentId]) {
      currentState.agents[data.agentId].health = data.health;
      addLogEntry('zone', `${highlightAgentName(data.agentId)} takes ${data.damage} zone damage`, `${data.health} HP remaining`);
    }
  });

  eventSource.addEventListener('agent_eliminated', (e) => {
    const data = JSON.parse(e.data);
    if (currentState && currentState.agents[data.agentId]) {
      currentState.agents[data.agentId].is_alive = false;
      currentState.agents[data.agentId].health = 0;
    }

    // Elimination trash talk
    const eliminationTaunts = [
      "GG. Better luck next time.",
      "Another one bites the dust.",
      "Outplayed.",
      "Too easy.",
      "Thanks for playing."
    ];

    // Random surviving agent trash talks the eliminated one
    const aliveAgents = Object.values(currentState?.agents || {}).filter(a => a.is_alive && a.id !== data.agentId);
    if (aliveAgents.length > 0) {
      const taunter = aliveAgents[Math.floor(Math.random() * aliveAgents.length)];
      const taunt = eliminationTaunts[Math.floor(Math.random() * eliminationTaunts.length)];
      addTrashTalkEntry(currentState?.meta?.turn || 0, taunter.id, taunt);
    }

    addLogEntry('elimination', `💀 ${highlightAgentName(data.agentId)} ELIMINATED`);
    showKillFeed(data.agentId);
    updateAgentCards(currentState?.agents);
  });

  eventSource.addEventListener('item_spawned', (e) => {
    const data = JSON.parse(e.data);
    if (currentState) currentState.items.push(data.item);
  });

  eventSource.addEventListener('zone_shrink', (e) => {
    const data = JSON.parse(e.data);
    if (currentState) {
      currentState.meta.zone.radius = data.radius;
      currentState.meta.zone.next_shrink_turn = data.next_shrink;
    }
    zoneDisplay.textContent = data.radius;
    addLogEntry('zone', `⚠️ ZONE SHRINKS`, `New radius: ${data.radius}`);
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

  eventSource.addEventListener('commentary', (e) => {
    const data = JSON.parse(e.data);
    addCommentaryEntry(data.turn, data.commentary);
  });

  eventSource.addEventListener('game_over', (e) => {
    const data = JSON.parse(e.data);
    gamePhase = 'finished';
    statusText.textContent = 'Game over';
    addLogEntry('system', `🏆 ${highlightAgentName(data.winner)} WINS`);
    showVictory(data.winner, data.winnerAgent, data.turn);
    startBtn.disabled = false;
  });

  eventSource.onerror = () => {
    console.log('SSE connection lost, reconnecting...');
    setTimeout(connectSSE, 2000);
  };
}

// Process visual events
function processVisualEvent(evt) {
  if (!currentState) return;

  switch (evt.type) {
    case 'attack': {
      const attacker = currentState.agents[evt.attackerId];
      const target = currentState.agents[evt.targetId];
      if (attacker && target) {
        window.RENDERER.addAttackEffect(attacker.position, target.position, attacker.color);
        window.RENDERER.addDamageEffect(target.position, evt.damage);
        target.health = evt.targetHealth;
      }
      break;
    }
    case 'self_damage': {
      const agent = currentState.agents[evt.agentId];
      if (agent) window.RENDERER.addDamageEffect(agent.position, evt.damage);
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
      if (target) window.RENDERER.addExplosionEffect(target.position);
      break;
    }
    case 'charm': {
      const agent = currentState.agents[evt.agentId];
      if (agent) window.RENDERER.addHealEffect(agent.position, '');
      break;
    }
    case 'pickup': {
      addLogEntry('pickup', `${highlightAgentName(evt.agentId)} picked up ${evt.item.replace('_', ' ')}`);
      break;
    }
  }
}

// Update agent cards
function updateAgentCards(agents) {
  if (!agents) return;

  agentCardsContainer.innerHTML = '';
  const agentList = Object.values(agents);

  agentList.forEach(agent => {
    const card = document.createElement('div');
    card.className = `agent-card ${agent.is_alive ? '' : 'dead'}`;
    card.style.borderColor = agent.color || '#444';

    const healthPct = Math.max(0, (agent.health / agent.max_health) * 100);
    let healthColor = '#10b981';
    if (healthPct <= 25) healthColor = '#ef4444';
    else if (healthPct <= 50) healthColor = '#f59e0b';

    const effectsBadges = [];
    if (agent.has_shield) effectsBadges.push('<span class="status-badge shield">SHIELD</span>');
    if (agent.is_defending) effectsBadges.push('<span class="status-badge defending">DEF</span>');
    if (agent.has_reversal_active) effectsBadges.push('<span class="status-badge buff">REV</span>');
    if (agent.active_effects) {
      agent.active_effects.forEach(eff => {
        effectsBadges.push(`<span class="status-badge buff">${eff.type.toUpperCase()}</span>`);
      });
    }

    card.innerHTML = `
      <div class="agent-card-header">
        <div class="agent-name" style="color: ${agent.color}">${agent.name}</div>
        <div class="agent-archetype">${agent.archetype || '?'}</div>
      </div>
      <div class="health-bar-container">
        <div class="health-bar-fill" style="width: ${healthPct}%; background: ${healthColor}"></div>
        <span class="health-text">${Math.max(0, agent.health)}/${agent.max_health}</span>
      </div>
      <div class="agent-stats">
        <div class="stat-item">ATK <span class="stat-value">${agent.stats?.attack || 0}</span></div>
        <div class="stat-item">DEF <span class="stat-value">${agent.stats?.defense || 0}</span></div>
        <div class="stat-item">SPD <span class="stat-value">${agent.stats?.speed || 0}</span></div>
      </div>
      <div class="agent-charm">${agent.charm ? `${agent.charm.type.toUpperCase()} ${agent.charm.uses_left > 0 ? '●' : '○'}` : 'No charm'}</div>
      <div class="agent-status">${effectsBadges.join(' ')}</div>
      <div class="agent-response-time" id="rt-${agent.id}"></div>
    `;

    agentCardsContainer.appendChild(card);
  });
}

function updateAgentResponseTime(agentId, responseTime, timedOut) {
  const el = document.getElementById(`rt-${agentId}`);
  if (el) {
    el.textContent = timedOut ? 'TIMEOUT' : `${responseTime}ms`;
    el.className = `agent-response-time ${timedOut ? '' : responseTime < 2000 ? 'fast' : 'slow'}`;
  }
}

// Live Feed
function addLiveFeedEntry(turn, agentId, reasoning) {
  const entry = document.createElement('div');
  entry.className = 'feed-entry';

  const colors = {
    gpt: '#10a37f',
    claude: '#d97757',
    haiku: '#a0a0a0',
    mini: '#9333ea'
  };

  entry.style.borderLeftColor = colors[agentId] || '#fff';

  entry.innerHTML = `
    <span class="feed-turn">[T${turn}]</span>
    <span class="feed-agent" style="color: ${colors[agentId]}">${agentId.toUpperCase()}:</span>
    <span class="feed-reasoning">${reasoning || 'No reasoning provided'}</span>
  `;

  // Check if user is at bottom before auto-scrolling
  const wasAtBottom = liveFeed.scrollHeight - liveFeed.scrollTop - liveFeed.clientHeight < 50;

  liveFeed.appendChild(entry);

  // Only auto-scroll if user was at bottom
  if (wasAtBottom) {
    liveFeed.scrollTop = liveFeed.scrollHeight;
  }

  // Keep last 50 entries
  while (liveFeed.children.length > 50) {
    liveFeed.removeChild(liveFeed.firstChild);
  }
}

// Trash Talk Feed
function addTrashTalkEntry(turn, agentId, message) {
  if (!trashTalk || !message) return;

  const entry = document.createElement('div');
  entry.className = 'trash-entry';

  const colors = {
    gpt: '#10a37f',
    claude: '#d97757',
    haiku: '#a0a0a0',
    mini: '#9333ea'
  };

  entry.style.borderLeftColor = colors[agentId] || '#fff';

  entry.innerHTML = `
    <div class="trash-meta">
      <span class="trash-turn">T${turn}</span>
      <span class="trash-agent" style="color: ${colors[agentId]}">${agentId.toUpperCase()}</span>
    </div>
    <div class="trash-message">"${message}"</div>
  `;

  // Check if user is at bottom before auto-scrolling
  const wasAtBottom = trashTalk.scrollHeight - trashTalk.scrollTop - trashTalk.clientHeight < 50;

  trashTalk.appendChild(entry);

  // Only auto-scroll if user was at bottom
  if (wasAtBottom) {
    trashTalk.scrollTop = trashTalk.scrollHeight;
  }

  // Keep last 30 entries
  while (trashTalk.children.length > 30) {
    trashTalk.removeChild(trashTalk.firstChild);
  }
}

// Commentary Feed
function addCommentaryEntry(turn, commentary) {
  if (!commentaryFeed || !commentary) return;

  const entry = document.createElement('div');
  entry.className = 'commentary-entry';

  entry.innerHTML = `
    <div class="commentary-turn">[TURN ${turn}]</div>
    <div>${commentary}</div>
  `;

  commentaryFeed.appendChild(entry);
  commentaryFeed.scrollTop = commentaryFeed.scrollHeight;

  // Keep last 20 entries
  while (commentaryFeed.children.length > 20) {
    commentaryFeed.removeChild(commentaryFeed.firstChild);
  }
}

// Combat Log with Font Awesome icons
const LOG_ICONS = {
  attack: '<i class="fa-solid fa-sword"></i>',
  defend: '<i class="fa-solid fa-shield"></i>',
  move: '<i class="fa-solid fa-person-running"></i>',
  pickup: '<i class="fa-solid fa-box"></i>',
  charm: '<i class="fa-solid fa-bolt"></i>',
  elimination: '<i class="fa-solid fa-skull"></i>',
  zone: '<i class="fa-solid fa-triangle-exclamation"></i>',
  system: '<i class="fa-solid fa-tower-broadcast"></i>'
};

function getActionType(action) {
  if (!action) return 'system';
  if (action === 'move') return 'move';
  if (action === 'attack') return 'attack';
  if (action === 'defend') return 'defend';
  if (action === 'use_charm') return 'charm';
  return 'system';
}
function formatActionLog(agentId, action, responseTime, timedOut, events = []) {
  const name = highlightAgentName(agentId);

  // Special message for timeout
  if (timedOut) {
    return `${name} was too slow to respond – Defends (TIMEOUT)`;
  }

  const ms = responseTime ? ` <span style="opacity: 0.6;">(${responseTime}ms)</span>` : '';

  switch (action.action) {
    case 'move':
      return `${name} moves ${action.params?.direction}${ms}`;
    case 'attack': {
      const targetId = action.params?.target_id;
      const targetName = targetId ? highlightAgentName(targetId) : 'TARGET';
      const ability = highlightAbility(action.params?.attack_type || 'melee');

      // Find damage from events
      const attackEvent = events && events.find(e => e.type === 'attack' && e.attackerId === agentId);
      const damageInfo = attackEvent ? ` → <span style="color: #ef4444; font-weight: 700;">${attackEvent.damage} damage</span>` : '';

      return `${name} attacks ${targetName} with ${ability}${damageInfo}${ms}`;
    }
    case 'defend':
      return `${name} ${highlightAbility('defends')}${ms}`;
    case 'use_charm':
      return `${name} uses ${highlightAbility('charm')}${ms}`;
    default:
      return `${name} acts${ms}`;
  }
}

// Helper to highlight damage in red
function highlightDamage(text) {
  // Highlight patterns like "X damage", "takes X", "X HP" in red
  return text
    .replace(/(\d+)\s*damage/gi, '<span style="color: #ef4444; font-weight: 600;">$1 damage</span>')
    .replace(/takes\s+(\d+)/gi, 'takes <span style="color: #ef4444; font-weight: 600;">$1</span>')
    .replace(/(\d+)\s*HP/g, '<span style="color: #ef4444; font-weight: 600;">$1 HP</span>');
}

function addLogEntry(type, text, detail) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;

  const icon = LOG_ICONS[type] || '';
  const timestamp = `[T${currentState?.meta?.turn || 0}]`;

  // Highlight damage in text and detail
  const highlightedText = highlightDamage(text);
  const highlightedDetail = detail ? highlightDamage(detail) : '';

  entry.innerHTML = `
    <span class="log-meta">${timestamp}</span>
    <span class="log-icon">${icon}</span>
    ${highlightedText}
    ${highlightedDetail ? `<span class="log-detail">↳ ${highlightedDetail}</span>` : ''}
  `;

  combatLog.appendChild(entry);
  combatLog.scrollTop = combatLog.scrollHeight;

  // Keep last 100 entries
  while (combatLog.children.length > 100) {
    combatLog.removeChild(combatLog.firstChild);
  }
}

// Kill Feed
function showKillFeed(agentId) {
  const entry = document.createElement('div');
  entry.className = 'kill-entry';
  entry.textContent = `☠ ${agentId.toUpperCase()} ELIMINATED`;
  killFeed.appendChild(entry);

  setTimeout(() => {
    entry.classList.add('fade-out');
    setTimeout(() => entry.remove(), 1000);
  }, 4000);
}

// Victory
function showVictory(winnerId, winnerAgent, turn) {
  victoryOverlay.classList.add('visible');

  const colors = {
    gpt: '#10a37f',
    claude: '#d97757',
    haiku: '#a0a0a0',
    mini: '#9333ea'
  };

  const canvas = document.getElementById('victory-sprite');
  canvas.width = 120;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const sprite = window.PIXELS.generateAgentSprite(winnerId, winnerAgent.archetype);
  if (sprite) drawSpriteToCtx(ctx, sprite, 0, 0, 120, 120);

  document.getElementById('victory-name').textContent = winnerAgent.name;
  document.getElementById('victory-name').style.color = colors[winnerId];
  document.getElementById('victory-archetype').textContent = winnerAgent.archetype.toUpperCase();
  document.getElementById('victory-stats').textContent = `${winnerAgent.health} HP remaining | Turn ${turn}`;
}

function drawSpriteToCtx(ctx, sprite, x, y, width, height) {
  const rows = sprite.length;
  const cols = sprite[0].length;
  const pixelW = width / cols;
  const pixelH = height / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const color = sprite[row][col];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(
          x + col * pixelW,
          y + row * pixelH,
          Math.ceil(pixelW),
          Math.ceil(pixelH)
        );
      }
    }
  }
}

// Game controls
async function startGame() {
  startBtn.disabled = true;
  victoryOverlay.classList.remove('visible');
  combatLog.innerHTML = '';
  liveFeed.innerHTML = '';

  try {
    const res = await fetch('/api/start', { method: 'POST' });
    const data = await res.json();

    if (data.error) {
      addLogEntry('system', `Error: ${data.error}`);
      startBtn.disabled = false;
    }
  } catch (err) {
    addLogEntry('system', `Failed to start: ${err.message}`);
    startBtn.disabled = false;
  }
}

async function resetGame() {
  try {
    await fetch('/api/reset', { method: 'POST' });
    currentState = null;
    gamePhase = 'waiting';
    statusText.textContent = 'Ready';
    turnDisplay.textContent = '0';
    zoneDisplay.textContent = '12';
    agentCardsContainer.innerHTML = '';
    combatLog.innerHTML = '';
    liveFeed.innerHTML = '';
    trashTalk.innerHTML = '';
    commentaryFeed.innerHTML = '';
    killFeed.innerHTML = '';
    startBtn.disabled = false;
    victoryOverlay.classList.remove('visible');
    window.RENDERER.stopAnimationLoop();
    window.RENDERER.clearCanvas();
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
  zoneDisplay.textContent = state.meta.zone?.radius || 12;

  if (state.agents) {
    updateAgentCards(state.agents);
  }

  if (state.meta.phase === 'running') {
    gamePhase = 'running';
    statusText.textContent = 'Battle in progress';
    startBtn.disabled = true;
    window.RENDERER.startAnimationLoop(() => currentState);
  } else if (state.meta.phase === 'finished') {
    gamePhase = 'finished';
    statusText.textContent = 'Game over';
    startBtn.disabled = false;
    if (state.meta.winner && state.agents[state.meta.winner]) {
      showVictory(state.meta.winner, state.agents[state.meta.winner], state.meta.turn);
    }
  }
}
