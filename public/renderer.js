// Canvas-based pixel art renderer for the battle arena

const CELL_SIZE = 18;
const GRID_SIZE = 32;
const CANVAS_SIZE = CELL_SIZE * GRID_SIZE;

let canvas, ctx;
let animationEffects = [];
let speechBubbles = [];

function initRenderer() {
  canvas = document.getElementById('arena-canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
}

function render(state) {
  if (!ctx) return;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  renderGrid(state);
  renderObstacles(state.obstacles);
  renderItems(state);
  renderAgents(state);
  renderEffects();
  renderSpeechBubbles();
}

function renderGrid(state) {
  const zone = state.meta.zone;

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const px = x * CELL_SIZE;
      const py = y * CELL_SIZE;

      // Check if in zone
      const dist = Math.sqrt((x - zone.center[0]) ** 2 + (y - zone.center[1]) ** 2);
      const inZone = dist <= zone.radius;

      if (inZone) {
        // Safe zone - dark green tint
        ctx.fillStyle = '#1a2a1a';
      } else {
        // Danger zone - red tint
        ctx.fillStyle = '#2a1212';
      }
      ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

      // Grid lines
      ctx.strokeStyle = inZone ? '#223322' : '#331818';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);

      // Zone boundary glow
      const boundaryDist = Math.abs(dist - zone.radius);
      if (boundaryDist < 1.5 && inZone) {
        ctx.fillStyle = `rgba(255, 60, 60, ${0.3 - boundaryDist * 0.2})`;
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
      }
    }
  }
}

function renderObstacles(obstacles) {
  if (!obstacles || obstacles.length === 0) return;

  for (const obs of obstacles) {
    const px = obs[0] * CELL_SIZE;
    const py = obs[1] * CELL_SIZE;

    // Draw solid obstacle
    ctx.fillStyle = '#64748b';
    ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

    // Border for definition
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);

    // Cross-hatch pattern
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + CELL_SIZE, py + CELL_SIZE);
    ctx.moveTo(px + CELL_SIZE, py);
    ctx.lineTo(px, py + CELL_SIZE);
    ctx.stroke();
  }
}

function renderObstaclePreview(obstacles) {
  if (!ctx) return;

  // Clear canvas
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Draw basic grid
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const px = x * CELL_SIZE;
      const py = y * CELL_SIZE;

      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
    }
  }

  // Draw obstacles
  renderObstacles(obstacles);

  // Draw zone preview (faint)
  ctx.strokeStyle = 'rgba(255, 60, 60, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(
    16 * CELL_SIZE + CELL_SIZE / 2,
    16 * CELL_SIZE + CELL_SIZE / 2,
    12 * CELL_SIZE,
    0,
    Math.PI * 2
  );
  ctx.stroke();
}

function renderAgents(state) {
  if (!state.agents) return;

  for (const agent of Object.values(state.agents)) {
    const px = agent.position[0] * CELL_SIZE;
    const py = agent.position[1] * CELL_SIZE;

    // Get sprite
    let sprite;
    if (agent.is_alive) {
      sprite = window.PIXELS.generateAgentSprite(agent.id, agent.archetype);
    } else {
      sprite = window.PIXELS.generateDeadSprite();
    }

    if (!sprite) continue;

    // Draw sprite scaled to cell
    drawSprite(sprite, px, py, CELL_SIZE, CELL_SIZE);

    // Health bar
    if (agent.is_alive) {
      const barWidth = CELL_SIZE - 2;
      const barHeight = 3;
      const barX = px + 1;
      const barY = py + CELL_SIZE - 4;
      const healthPct = agent.health / agent.max_health;

      // Background
      ctx.fillStyle = '#000000';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      // Health fill
      let healthColor = '#00ff00';
      if (healthPct <= 0.25) healthColor = '#ff0000';
      else if (healthPct <= 0.5) healthColor = '#ffaa00';

      ctx.fillStyle = healthColor;
      ctx.fillRect(barX, barY, barWidth * healthPct, barHeight);

      // Defending indicator
      if (agent.is_defending) {
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - 1, py - 1, CELL_SIZE + 2, CELL_SIZE + 2);
      }

      // Shield indicator
      if (agent.has_shield) {
        ctx.strokeStyle = '#c0c0c0';
        ctx.lineWidth = 1.5;
        const cx = px + CELL_SIZE / 2;
        const cy = py + CELL_SIZE / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, CELL_SIZE / 2 + 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Reversal indicator
      if (agent.has_reversal_active) {
        ctx.strokeStyle = '#ff44ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px - 2, py - 2, CELL_SIZE + 4, CELL_SIZE + 4);
      }
    }

    // Name label
    ctx.fillStyle = agent.is_alive ? (agent.color || '#ffffff') : '#666666';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      agent.id.toUpperCase(),
      px + CELL_SIZE / 2,
      py - 2
    );
  }
}

function renderItems(state) {
  if (!state.items) return;

  const time = Date.now() / 1000;

  for (const item of state.items) {
    const px = item.position[0] * CELL_SIZE;
    const py = item.position[1] * CELL_SIZE;

    // Pulsing effect
    const pulse = 0.8 + Math.sin(time * 3) * 0.2;

    const sprite = window.PIXELS.ITEM_SPRITES[item.type];
    if (sprite) {
      ctx.globalAlpha = pulse;
      drawSprite(sprite, px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      ctx.globalAlpha = 1;
    } else {
      // Fallback: colored dot
      ctx.fillStyle = '#ffd700';
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, CELL_SIZE / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawSprite(sprite, x, y, width, height) {
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

// Animation effects
function addAttackEffect(fromPos, toPos, color) {
  animationEffects.push({
    type: 'attack_line',
    fromX: fromPos[0] * CELL_SIZE + CELL_SIZE / 2,
    fromY: fromPos[1] * CELL_SIZE + CELL_SIZE / 2,
    toX: toPos[0] * CELL_SIZE + CELL_SIZE / 2,
    toY: toPos[1] * CELL_SIZE + CELL_SIZE / 2,
    color: color || '#ff4444',
    alpha: 1,
    createdAt: Date.now()
  });
}

function addDamageEffect(pos, damage) {
  animationEffects.push({
    type: 'damage_number',
    x: pos[0] * CELL_SIZE + CELL_SIZE / 2,
    y: pos[1] * CELL_SIZE - 5,
    text: `-${damage}`,
    color: '#ff4444',
    alpha: 1,
    vy: -1,
    createdAt: Date.now()
  });
}

function addHealEffect(pos, amount) {
  animationEffects.push({
    type: 'damage_number',
    x: pos[0] * CELL_SIZE + CELL_SIZE / 2,
    y: pos[1] * CELL_SIZE - 5,
    text: `+${amount}`,
    color: '#44ff44',
    alpha: 1,
    vy: -1,
    createdAt: Date.now()
  });
}

function addExplosionEffect(pos) {
  animationEffects.push({
    type: 'explosion',
    x: pos[0] * CELL_SIZE + CELL_SIZE / 2,
    y: pos[1] * CELL_SIZE + CELL_SIZE / 2,
    radius: 2,
    maxRadius: CELL_SIZE,
    alpha: 1,
    createdAt: Date.now()
  });
}

function showSpeechBubble(agentId, text, pos) {
  // Remove existing bubble for this agent
  speechBubbles = speechBubbles.filter(b => b.agentId !== agentId);

  if (!text || text.length === 0) return;

  // Truncate long text
  const displayText = text.length > 60 ? text.substring(0, 57) + '...' : text;

  speechBubbles.push({
    agentId,
    text: displayText,
    x: pos[0] * CELL_SIZE + CELL_SIZE / 2,
    y: pos[1] * CELL_SIZE - 15,
    alpha: 1,
    createdAt: Date.now()
  });
}

function renderEffects() {
  const now = Date.now();

  animationEffects = animationEffects.filter(effect => {
    const age = now - effect.createdAt;
    if (age > 1500) return false;

    const fadeStart = 800;
    if (age > fadeStart) {
      effect.alpha = 1 - (age - fadeStart) / (1500 - fadeStart);
    }

    ctx.globalAlpha = effect.alpha;

    switch (effect.type) {
      case 'attack_line':
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(effect.fromX, effect.fromY);
        ctx.lineTo(effect.toX, effect.toY);
        ctx.stroke();
        break;

      case 'damage_number':
        effect.y += effect.vy;
        ctx.fillStyle = effect.color;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(effect.text, effect.x, effect.y);
        break;

      case 'explosion':
        effect.radius = Math.min(effect.radius + 1, effect.maxRadius);
        ctx.strokeStyle = '#ff8844';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
        ctx.stroke();
        break;
    }

    ctx.globalAlpha = 1;
    return true;
  });
}

function renderSpeechBubbles() {
  const now = Date.now();

  speechBubbles = speechBubbles.filter(bubble => {
    const age = now - bubble.createdAt;
    if (age > 3000) return false;

    if (age > 2000) {
      bubble.alpha = 1 - (age - 2000) / 1000;
    }

    ctx.globalAlpha = bubble.alpha;

    // Bubble background
    ctx.font = '7px monospace';
    const metrics = ctx.measureText(bubble.text);
    const padding = 4;
    const bw = metrics.width + padding * 2;
    const bh = 14;
    let bx = bubble.x - bw / 2;
    let by = bubble.y - bh;

    // Keep on screen
    bx = Math.max(2, Math.min(CANVAS_SIZE - bw - 2, bx));
    by = Math.max(2, by);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 3);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(bubble.text, bx + padding, by + 10);

    ctx.globalAlpha = 1;
    return true;
  });
}

// Animation loop
let animating = false;

function startAnimationLoop(getState) {
  if (animating) return;
  animating = true;

  function loop() {
    if (!animating) return;
    const state = getState();
    if (state && state.meta && state.meta.phase !== 'waiting') {
      render(state);
    }
    requestAnimationFrame(loop);
  }
  loop();
}

function stopAnimationLoop() {
  animating = false;
}

function clearCanvas() {
  if (!ctx) return;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  animationEffects = [];
  speechBubbles = [];
}

window.RENDERER = {
  initRenderer,
  render,
  startAnimationLoop,
  stopAnimationLoop,
  clearCanvas,
  addAttackEffect,
  addDamageEffect,
  addHealEffect,
  addExplosionEffect,
  showSpeechBubble,
  renderObstacles,
  renderObstaclePreview
};
