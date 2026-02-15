const { getDistance, isInZone } = require('../game/grid');
const { ARCHETYPES } = require('../game/archetypes');
const { CHARMS } = require('../game/charms');

const PERSONALITIES = {
  gpt: 'You are a calculating strategist. You analyze probability, optimize expected value, and make the mathematically optimal play. You think several moves ahead.',
  claude: 'You are a thoughtful tactician. You consider the broader situation, adapt to changing circumstances, and balance aggression with caution. You look for the smart play.',
  gemini: 'You are a creative improviser. You look for unexpected plays, clever combos, and unconventional strategies. You like to surprise your opponents.',
  mini: 'You are a bold fighter. You favor aggression, decisive action, and calculated risks. You believe the best defense is a good offense.'
};

const ARCHETYPE_TIPS = {
  berserker: 'Your charge attack hits HARD (12 damage at range 3) but costs 10 HP to yourself. Use it to finish off weakened enemies. Your melee is solid at 9 damage with no cooldown. You thrive in all-in fights.',
  tank: 'You have the most HP (150) and highest defense (8). Your slam hits ALL adjacent enemies for 8 damage. Play the long game - you outlast everyone. Move toward the center and let others fight.',
  scout: 'You are the FASTEST (4 speed). Quick strike hits at range 2 for 7 damage. Use your speed to kite slower enemies, grab items, and pick off wounded targets. Avoid prolonged fights.',
  mage: 'Your ranged attack hits at up to 6 tiles with NO cooldown! Damage: 10 at range 1, down to 4 at range 6. KEEP YOUR DISTANCE. You die fast up close (only 80 HP, 2 defense). Position is everything.'
};

function buildArchetypeSelectionPrompt(agentId, agentName) {
  const personality = PERSONALITIES[agentId] || '';

  let prompt = `${personality}

You are ${agentName} entering a battle royale against 3 other AI agents on a 32x32 grid. Before the fight begins, you must choose your archetype.

=== AVAILABLE ARCHETYPES ===

`;

  for (const [key, arch] of Object.entries(ARCHETYPES)) {
    prompt += `**${arch.name.toUpperCase()}**
  Health: ${arch.health} | Attack: ${arch.attack} | Defense: ${arch.defense} | Speed: ${arch.speed}
  Attacks:`;

    for (const [atkName, atk] of Object.entries(arch.attacks)) {
      prompt += `\n    - ${atkName}: Range ${atk.range}, Damage ${atk.damage}`;
      if (atk.cooldown > 0) prompt += `, Cooldown ${atk.cooldown} turns`;
      if (atk.self_damage) prompt += `, Self-damage ${atk.self_damage}`;
      if (atk.hits_all_adjacent) prompt += `, Hits ALL adjacent enemies`;
      if (atkName === 'ranged' && key === 'mage') prompt += ` (scales: 10 at range 1, 4 at range 6)`;
    }

    prompt += `\n  Strategy: ${arch.description}\n\n`;
  }

  prompt += `Choose wisely - your archetype determines your entire playstyle.

Respond with ONLY this JSON:
{"reasoning": "your strategic thought about why this archetype suits you", "archetype": "berserker/tank/scout/mage"}`;

  return prompt;
}

function buildTurnPrompt(agent, gameState) {
  const personality = PERSONALITIES[agent.id] || '';
  const archTip = ARCHETYPE_TIPS[agent.archetype] || '';
  const zone = gameState.meta.zone;
  const inZone = isInZone(agent.position, zone);
  const turnsUntilShrink = gameState.meta.zone.next_shrink_turn - gameState.meta.turn;

  let prompt = `${personality}

You are a ${ARCHETYPES[agent.archetype].name} in an AI battle royale. Goal: be the last one standing.

=== YOUR STATUS ===
Health: ${agent.health}/${agent.max_health}${agent.health <= agent.max_health * 0.3 ? ' *** CRITICAL! ***' : agent.health <= agent.max_health * 0.5 ? ' * LOW *' : ''}
Position: [${agent.position[0]}, ${agent.position[1]}]
Stats: Attack ${agent.stats.attack} | Defense ${agent.stats.defense} | Speed ${agent.stats.speed + agent.speed_bonus}
`;

  // Charm
  if (agent.charm) {
    const charmDef = CHARMS[agent.charm.type];
    if (agent.charm.uses_left > 0) {
      prompt += `Lucky Charm: ${charmDef.name} - ${charmDef.description} [AVAILABLE]\n`;
    } else {
      prompt += `Lucky Charm: ${charmDef.name} [USED]\n`;
    }
  }

  // Cooldowns
  prompt += `\nCooldowns:\n`;
  for (const [key, val] of Object.entries(agent.cooldowns)) {
    prompt += `  - ${key}: ${val > 0 ? val + ' turns' : 'READY'}\n`;
  }

  // Active effects
  if (agent.active_effects.length > 0) {
    prompt += `\nActive Buffs:\n`;
    for (const effect of agent.active_effects) {
      prompt += `  - ${effect.type}: ${effect.turns_left} turns remaining\n`;
    }
  }

  if (agent.has_shield) prompt += `  - Shield Token: ACTIVE (blocks next hit)\n`;
  if (agent.is_defending) prompt += `  - Defending: 70% damage reduction this turn\n`;
  if (agent.has_reversal_active) prompt += `  - Reversal: ACTIVE (next hit reflects back)\n`;

  // Battlefield
  prompt += `
=== BATTLEFIELD ===
Turn: ${gameState.meta.turn}/${50}
Zone: Center [${zone.center[0]}, ${zone.center[1]}], Radius ${zone.radius}`;

  if (turnsUntilShrink <= 3 && turnsUntilShrink > 0) {
    prompt += ` *** SHRINKS IN ${turnsUntilShrink} TURNS! ***`;
  }

  prompt += `\nYou are ${inZone ? 'INSIDE the safe zone' : 'OUTSIDE THE ZONE! You take 10 damage per turn! GET INSIDE!'}`;

  // Opponents
  prompt += `\n\n=== OPPONENTS ===\n`;
  const aliveOpponents = Object.values(gameState.agents).filter(
    a => a.id !== agent.id && a.is_alive
  );
  const deadOpponents = Object.values(gameState.agents).filter(
    a => a.id !== agent.id && !a.is_alive
  );

  for (const opp of aliveOpponents) {
    const dist = getDistance(agent.position, opp.position);
    const oppInZone = isInZone(opp.position, zone);
    const healthPct = Math.round((opp.health / opp.max_health) * 100);
    let healthLabel = '';
    if (healthPct <= 25) healthLabel = ' (CRITICAL)';
    else if (healthPct <= 50) healthLabel = ' (wounded)';

    prompt += `- ${opp.id} [${ARCHETYPES[opp.archetype].name}]: ${opp.health}/${opp.max_health} HP${healthLabel} at [${opp.position[0]}, ${opp.position[1]}]`;
    prompt += ` | Distance: ${dist} tiles`;
    if (!oppInZone) prompt += ' | OUTSIDE ZONE';
    if (opp.is_defending) prompt += ' | DEFENDING';
    if (opp.has_shield) prompt += ' | HAS SHIELD';
    if (opp.last_action) prompt += ` | Last: ${opp.last_action}`;
    prompt += '\n';

    // Tactical context
    const canMelee = dist <= 1;
    const canSpecial = Object.entries(agent.attacks).some(
      ([name, atk]) => name !== 'melee' && dist <= atk.range && agent.cooldowns[name] === 0
    );
    if (canMelee) prompt += `  ^ IN MELEE RANGE!\n`;
    else if (canSpecial) prompt += `  ^ In range of your special attack!\n`;
  }

  if (deadOpponents.length > 0) {
    prompt += `\nEliminated: ${deadOpponents.map(o => o.id).join(', ')}\n`;
  }

  // Items
  if (gameState.items.length > 0) {
    prompt += `\n=== ITEMS ON GROUND ===\n`;
    for (const item of gameState.items) {
      const dist = getDistance(agent.position, item.position);
      const canReach = dist <= agent.stats.speed + agent.speed_bonus;
      prompt += `- ${item.type.replace('_', ' ')} at [${item.position[0]}, ${item.position[1]}] (${dist} tiles away${canReach ? ' - REACHABLE this turn!' : ''})\n`;
    }
  }

  // Abilities
  prompt += `\n=== YOUR ABILITIES ===\n`;
  for (const [name, atk] of Object.entries(agent.attacks)) {
    const ready = agent.cooldowns[name] === 0;
    prompt += `- ${name}: Range ${atk.range}, `;
    if (name === 'ranged' && agent.archetype === 'mage') {
      prompt += `Damage ${Math.max(10 - 1, 4)}-10 (closer = more damage)`;
    } else {
      prompt += `Damage ${atk.damage}`;
    }
    if (atk.cooldown > 0) prompt += `, Cooldown ${atk.cooldown}`;
    if (atk.self_damage) prompt += `, Self-damage ${atk.self_damage}`;
    if (atk.hits_all_adjacent) prompt += `, Hits ALL adjacent`;
    prompt += ready ? ' [READY]' : ` [COOLDOWN: ${agent.cooldowns[name]} turns]`;
    prompt += '\n';
  }

  prompt += `- Defend: Block 70% damage (3-turn cooldown) ${agent.cooldowns.defend === 0 ? '[READY]' : `[COOLDOWN: ${agent.cooldowns.defend} turns]`}\n`;

  // Recent combat history
  const recentLog = gameState.combat_log
    .filter(l => l.turn >= gameState.meta.turn - 2 && (l.type === 'damage' || l.type === 'reversal' || l.type === 'defend_trigger' || l.type === 'charm'))
    .slice(-5);

  if (recentLog.length > 0) {
    prompt += `\n=== RECENT EVENTS ===\n`;
    for (const entry of recentLog) {
      prompt += `- ${entry.event}\n`;
    }
  }

  // Strategy tips
  prompt += `\n=== STRATEGY ===\n${archTip}\n`;

  if (!inZone) {
    prompt += `URGENT: You are outside the zone! Move toward center [${zone.center[0]}, ${zone.center[1]}] immediately!\n`;
  }

  // Output format
  prompt += `
OUTPUT JSON ONLY. Choose ONE action:

Move: {"reasoning": "why", "action": "move", "params": {"direction": "north/south/east/west", "tiles": ${agent.stats.speed + agent.speed_bonus}}}

Attack: {"reasoning": "why", "action": "attack", "params": {"target_id": "${aliveOpponents[0]?.id || 'opponent_id'}", "attack_type": "melee"}}

Defend: {"reasoning": "why", "action": "defend"}

Use Charm: {"reasoning": "why", "action": "use_charm"}
${agent.charm && agent.charm.type === 'heal' && agent.charm.uses_left > 0 ? '\nFREE HEAL: Add "free_action": "use_charm" to any action to heal for free!' : ''}

YOUR TURN:`;

  return prompt;
}

module.exports = { buildArchetypeSelectionPrompt, buildTurnPrompt };
