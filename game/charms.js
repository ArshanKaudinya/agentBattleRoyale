const CHARMS = {
  rage: {
    name: 'Rage',
    effect: '+50% attack damage for 3 turns',
    duration: 3,
    uses: 1,
    cost: 'full_turn',
    description: 'Activate to boost all attack damage by 50% for 3 turns. Costs your entire turn.'
  },
  teleport: {
    name: 'Teleport',
    effect: 'Jump to any tile within 8 tiles',
    uses: 1,
    cost: 'replaces_move',
    description: 'Teleport up to 8 tiles in any direction. Replaces your move action.'
  },
  heal: {
    name: 'Heal',
    effect: 'Restore 40% of max health',
    uses: 1,
    cost: 'free_action',
    description: 'Heal 40% of your max HP. Free action - can be used alongside another action.'
  },
  reversal: {
    name: 'Reversal',
    effect: 'Next attack against you hits the attacker instead',
    duration: -1, // until triggered
    uses: 1,
    cost: 'full_turn',
    description: 'The next attack against you is reflected back to the attacker. Costs your entire turn.'
  }
};

function activateCharm(agent, gameState) {
  const charm = agent.charm;
  if (!charm || charm.uses_left <= 0) {
    gameState.combat_log.push({
      turn: gameState.meta.turn,
      event: `${agent.id} tried to use charm but has none left`
    });
    return false;
  }

  const charmDef = CHARMS[charm.type];

  switch (charm.type) {
    case 'rage':
      agent.active_effects.push({
        type: 'rage',
        modifier: 0.5,
        turns_left: 3
      });
      agent.damage_bonus += 0.5;
      gameState.combat_log.push({
        turn: gameState.meta.turn,
        event: `${agent.id} activated RAGE! +50% damage for 3 turns`,
        type: 'charm'
      });
      break;

    case 'teleport':
      // Teleport is handled specially in combat.js - it needs target position
      // This just marks it as activated; the move logic handles placement
      gameState.combat_log.push({
        turn: gameState.meta.turn,
        event: `${agent.id} activated TELEPORT!`,
        type: 'charm'
      });
      break;

    case 'heal':
      const healAmount = Math.floor(agent.max_health * 0.4);
      const oldHealth = agent.health;
      agent.health = Math.min(agent.health + healAmount, agent.max_health);
      const healed = agent.health - oldHealth;
      gameState.combat_log.push({
        turn: gameState.meta.turn,
        event: `${agent.id} used HEAL! Restored ${healed} HP (${agent.health}/${agent.max_health})`,
        type: 'heal'
      });
      break;

    case 'reversal':
      agent.has_reversal_active = true;
      gameState.combat_log.push({
        turn: gameState.meta.turn,
        event: `${agent.id} activated REVERSAL! Next attack will be reflected`,
        type: 'charm'
      });
      break;
  }

  charm.uses_left--;
  return true;
}

module.exports = { CHARMS, activateCharm };
