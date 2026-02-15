const { getRandomEmptyTileInZone } = require('./grid');

const DROP_TYPES = [
  { type: 'health_pack', effect: '+30 HP', weight: 30 },
  { type: 'damage_amp', effect: '+30% attack 3 turns', weight: 25 },
  { type: 'speed_boost', effect: '+2 speed 3 turns', weight: 25 },
  { type: 'shield_token', effect: 'Immune to next attack', weight: 20 }
];

function weightedRandom(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

function spawnDrop(gameState) {
  const drop = weightedRandom(DROP_TYPES);
  const pos = getRandomEmptyTileInZone(
    gameState.meta.zone,
    gameState.agents,
    gameState.items
  );

  const item = {
    type: drop.type,
    effect: drop.effect,
    position: pos
  };

  gameState.items.push(item);
  gameState.combat_log.push({
    turn: gameState.meta.turn,
    event: `${drop.type.replace('_', ' ')} spawned at [${pos[0]}, ${pos[1]}]`,
    type: 'spawn'
  });

  return item;
}

function applyItem(agent, item, gameState) {
  switch (item.type) {
    case 'health_pack':
      const oldHealth = agent.health;
      agent.health = Math.min(agent.health + 30, agent.max_health);
      const healed = agent.health - oldHealth;
      gameState.combat_log.push({
        turn: gameState.meta.turn,
        event: `${agent.id} picked up health pack! +${healed} HP (${agent.health}/${agent.max_health})`,
        type: 'pickup'
      });
      break;

    case 'damage_amp':
      agent.active_effects.push({
        type: 'damage_amp',
        modifier: 0.3,
        turns_left: 3
      });
      agent.damage_bonus += 0.3;
      gameState.combat_log.push({
        turn: gameState.meta.turn,
        event: `${agent.id} picked up damage amp! +30% damage for 3 turns`,
        type: 'pickup'
      });
      break;

    case 'speed_boost':
      agent.active_effects.push({
        type: 'speed_boost',
        modifier: 2,
        turns_left: 3
      });
      agent.speed_bonus += 2;
      gameState.combat_log.push({
        turn: gameState.meta.turn,
        event: `${agent.id} picked up speed boost! +2 speed for 3 turns`,
        type: 'pickup'
      });
      break;

    case 'shield_token':
      agent.has_shield = true;
      gameState.combat_log.push({
        turn: gameState.meta.turn,
        event: `${agent.id} picked up shield token! Immune to next attack`,
        type: 'pickup'
      });
      break;
  }
}

function removeItemAt(gameState, pos) {
  gameState.items = gameState.items.filter(
    item => !(item.position[0] === pos[0] && item.position[1] === pos[1])
  );
}

function getItemAt(gameState, pos) {
  return gameState.items.find(
    item => item.position[0] === pos[0] && item.position[1] === pos[1]
  );
}

module.exports = { DROP_TYPES, spawnDrop, applyItem, removeItemAt, getItemAt };
