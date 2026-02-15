const ARCHETYPES = {
  berserker: {
    name: 'Berserker',
    health: 100,
    attack: 9,
    defense: 3,
    speed: 2,
    attacks: {
      melee: { range: 1, damage: 9, cooldown: 0 },
      charge: { range: 3, damage: 12, cooldown: 2, self_damage: 10 }
    },
    description: 'High burst damage, hurts self with charge, medium survivability'
  },
  tank: {
    name: 'Tank',
    health: 150,
    attack: 5,
    defense: 8,
    speed: 1,
    attacks: {
      melee: { range: 1, damage: 5, cooldown: 0 },
      slam: { range: 1, damage: 8, hits_all_adjacent: true, cooldown: 3 }
    },
    description: 'Survives longest, lowest DPS, slow but tanky'
  },
  scout: {
    name: 'Scout',
    health: 90,
    attack: 6,
    defense: 4,
    speed: 4,
    attacks: {
      melee: { range: 1, damage: 6, cooldown: 0 },
      quick_strike: { range: 2, damage: 7, cooldown: 1 }
    },
    description: 'Mobile harasser, fast but fragile in sustained fights'
  },
  mage: {
    name: 'Mage',
    health: 80,
    attack: 8,
    defense: 2,
    speed: 2,
    attacks: {
      melee: { range: 1, damage: 4, cooldown: 0 },
      ranged: { range: 6, damage: 10, cooldown: 0 }
    },
    description: 'Range control, dies if caught, ranged damage scales with distance'
  }
};

module.exports = { ARCHETYPES };
