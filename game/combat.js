const { calculatePosition, isValidPosition, isOccupied, isObstacle, getDistance, getAdjacentPositions } = require('./grid');
const { activateCharm } = require('./charms');
const { applyItem, removeItemAt, getItemAt } = require('./spawns');
const { GRID_SIZE } = require('./constants');

function executeAction(agentId, action, gameState) {
  const agent = gameState.agents[agentId];
  if (!agent || !agent.is_alive) return [];

  const events = [];

  switch (action.action) {
    case 'move': {
      let targetPos;

      // Handle teleport charm used as move replacement
      if (action.params && action.params.teleport_to) {
        const tp = action.params.teleport_to;
        if (agent.charm && agent.charm.type === 'teleport' && agent.charm.uses_left > 0) {
          const dist = getDistance(agent.position, tp);
          if (dist <= 8 && isValidPosition(tp) && !isOccupied(tp, gameState.agents) && !isObstacle(tp, gameState.obstacles)) {
            agent.position = tp;
            agent.charm.uses_left--;
            events.push({
              type: 'teleport',
              agentId,
              from: agent.position,
              to: tp
            });
            gameState.combat_log.push({
              turn: gameState.meta.turn,
              event: `${agentId} TELEPORTED to [${tp[0]}, ${tp[1]}]!`,
              type: 'move'
            });
          }
        }
      } else {
        const direction = action.params && action.params.direction;
        const tiles = Math.min(
          (action.params && action.params.tiles) || 1,
          agent.stats.speed + agent.speed_bonus
        );

        targetPos = calculatePosition(agent.position, direction, tiles);

        if (targetPos && isValidPosition(targetPos) && !isOccupied(targetPos, gameState.agents) && !isObstacle(targetPos, gameState.obstacles)) {
          const oldPos = [...agent.position];
          agent.position = targetPos;
          events.push({
            type: 'move',
            agentId,
            from: oldPos,
            to: targetPos
          });
          gameState.combat_log.push({
            turn: gameState.meta.turn,
            event: `${agentId} moved ${direction} ${tiles} tiles to [${targetPos[0]}, ${targetPos[1]}]`,
            type: 'move'
          });
        } else {
          gameState.combat_log.push({
            turn: gameState.meta.turn,
            event: `${agentId} tried to move but position invalid/occupied`,
            type: 'move'
          });
        }
      }

      // Auto-pickup items at new position
      const item = getItemAt(gameState, agent.position);
      if (item) {
        applyItem(agent, item, gameState);
        removeItemAt(gameState, agent.position);
        events.push({ type: 'pickup', agentId, item: item.type });
      }
      break;
    }

    case 'attack': {
      const targetId = action.params && action.params.target_id;
      const attackType = (action.params && action.params.attack_type) || 'melee';
      const target = gameState.agents[targetId];

      if (!target || !target.is_alive) {
        gameState.combat_log.push({
          turn: gameState.meta.turn,
          event: `${agentId} tried to attack ${targetId} but target is invalid/dead`,
          type: 'combat'
        });
        break;
      }

      const attackDef = agent.attacks[attackType];
      if (!attackDef) {
        gameState.combat_log.push({
          turn: gameState.meta.turn,
          event: `${agentId} tried unknown attack type: ${attackType}`,
          type: 'combat'
        });
        break;
      }

      // Check cooldown
      if (agent.cooldowns[attackType] > 0) {
        gameState.combat_log.push({
          turn: gameState.meta.turn,
          event: `${agentId} ${attackType} on cooldown (${agent.cooldowns[attackType]} turns)`,
          type: 'combat'
        });
        break;
      }

      const distance = getDistance(agent.position, target.position);

      // Check range
      if (distance > attackDef.range) {
        gameState.combat_log.push({
          turn: gameState.meta.turn,
          event: `${agentId} ${attackType} out of range (distance: ${distance}, range: ${attackDef.range})`,
          type: 'combat'
        });
        break;
      }

      // Handle slam (hits all adjacent)
      if (attackDef.hits_all_adjacent) {
        const adjPositions = getAdjacentPositions(agent.position);
        const adjTargets = Object.values(gameState.agents).filter(
          a => a.is_alive && a.id !== agentId &&
            adjPositions.some(p => p[0] === a.position[0] && p[1] === a.position[1])
        );

        if (adjTargets.length === 0) {
          gameState.combat_log.push({
            turn: gameState.meta.turn,
            event: `${agentId} slam missed - no adjacent enemies`,
            type: 'combat'
          });
        } else {
          for (const adjTarget of adjTargets) {
            let damage = attackDef.damage;
            damage *= (1 + agent.damage_bonus);
            damage = resolveDamageOnTarget(agent, adjTarget, damage, gameState, events);
          }
        }

        agent.cooldowns[attackType] = attackDef.cooldown;
        break;
      }

      // Calculate base damage
      let damage = attackDef.damage;

      // Mage ranged scaling
      if (attackType === 'ranged' && agent.archetype === 'mage') {
        damage = Math.max(10 - distance, 4);
      }

      // Apply damage bonus from effects
      damage *= (1 + agent.damage_bonus);

      // Resolve damage on target (defense, reversal, shield)
      resolveDamageOnTarget(agent, target, damage, gameState, events);

      // Self-damage (berserker charge)
      if (attackDef.self_damage) {
        agent.health -= attackDef.self_damage;
        gameState.combat_log.push({
          turn: gameState.meta.turn,
          event: `${agentId} took ${attackDef.self_damage} recoil damage (${agent.health} HP)`,
          type: 'self_damage'
        });
        events.push({
          type: 'self_damage',
          agentId,
          damage: attackDef.self_damage
        });
      }

      // Set cooldown
      agent.cooldowns[attackType] = attackDef.cooldown;
      break;
    }

    case 'defend': {
      if (agent.cooldowns.defend > 0) {
        gameState.combat_log.push({
          turn: gameState.meta.turn,
          event: `${agentId} tried to defend but on cooldown (${agent.cooldowns.defend} turns)`,
          type: 'combat'
        });
        break;
      }

      agent.is_defending = true;
      agent.cooldowns.defend = 3;
      events.push({ type: 'defend', agentId });
      gameState.combat_log.push({
        turn: gameState.meta.turn,
        event: `${agentId} is defending! (70% damage reduction)`,
        type: 'defend'
      });
      break;
    }

    case 'use_charm': {
      const success = activateCharm(agent, gameState);
      if (success) {
        events.push({ type: 'charm', agentId, charm: agent.charm.type });
      }
      break;
    }
  }

  // Handle free action (heal charm can be used alongside other actions)
  if (action.free_action === 'use_charm') {
    if (agent.charm && agent.charm.type === 'heal' && agent.charm.uses_left > 0) {
      activateCharm(agent, gameState);
      events.push({ type: 'charm', agentId, charm: 'heal' });
    }
  }

  // Store last action
  agent.last_action = describeAction(action);

  return events;
}

function resolveDamageOnTarget(attacker, target, damage, gameState, events) {
  // Check if target is defending
  if (target.is_defending) {
    damage *= 0.3;
    target.is_defending = false;
    gameState.combat_log.push({
      turn: gameState.meta.turn,
      event: `${target.id} defended! Damage reduced to ${Math.round(damage)}`,
      type: 'defend_trigger'
    });
  }

  // Check reversal
  if (target.has_reversal_active) {
    attacker.health -= damage;
    target.has_reversal_active = false;
    gameState.combat_log.push({
      turn: gameState.meta.turn,
      event: `${target.id} REVERSED attack! ${attacker.id} took ${Math.round(damage)} damage`,
      type: 'reversal'
    });
    events.push({
      type: 'reversal',
      targetId: target.id,
      attackerId: attacker.id,
      damage: Math.round(damage)
    });
    return 0;
  }

  // Check shield
  if (target.has_shield) {
    target.has_shield = false;
    gameState.combat_log.push({
      turn: gameState.meta.turn,
      event: `${target.id}'s shield absorbed the attack!`,
      type: 'shield'
    });
    events.push({
      type: 'shield_break',
      targetId: target.id
    });
    return 0;
  }

  // Apply damage
  damage = Math.round(damage);
  target.health -= damage;
  gameState.combat_log.push({
    turn: gameState.meta.turn,
    event: `${attacker.id} hit ${target.id} for ${damage} damage (${target.health} HP remaining)`,
    type: 'damage'
  });
  events.push({
    type: 'attack',
    attackerId: attacker.id,
    targetId: target.id,
    damage,
    targetHealth: target.health
  });

  return damage;
}

function tickCooldowns(agent) {
  for (const key of Object.keys(agent.cooldowns)) {
    if (agent.cooldowns[key] > 0) {
      agent.cooldowns[key]--;
    }
  }
}

function tickEffects(agent) {
  agent.active_effects = agent.active_effects.filter(effect => {
    effect.turns_left--;
    if (effect.turns_left <= 0) {
      // Remove the effect's modifier
      if (effect.type === 'rage' || effect.type === 'damage_amp') {
        agent.damage_bonus = Math.max(0, agent.damage_bonus - effect.modifier);
      } else if (effect.type === 'speed_boost') {
        agent.speed_bonus = Math.max(0, agent.speed_bonus - effect.modifier);
      }
      return false;
    }
    return true;
  });
}

function describeAction(action) {
  switch (action.action) {
    case 'move':
      if (action.params && action.params.direction) {
        return `move_${action.params.direction}_${action.params.tiles || 1}`;
      }
      return 'move';
    case 'attack':
      return `${action.params.attack_type}_${action.params.target_id}`;
    case 'defend':
      return 'defend';
    case 'use_charm':
      return 'use_charm';
    default:
      return 'unknown';
  }
}

module.exports = { executeAction, tickCooldowns, tickEffects };
