// Pixel art sprite definitions
// Each sprite is a 10x10 grid of hex colors (null = transparent)
// Colors: agent-specific base + archetype weapon/accessory

const _ = null; // transparent

const AGENT_COLORS = {
  gpt:    { body: '#10a37f', dark: '#0b7a5e', light: '#14d4a2', eye: '#ffffff' },
  claude: { body: '#d4886f', dark: '#a8654e', light: '#e8a68f', eye: '#ffffff' },
  gemini: { body: '#4285f4', dark: '#2b5ec2', light: '#6ba3ff', eye: '#ffffff' },
  mini:   { body: '#9333ea', dark: '#6b21b0', light: '#b366ff', eye: '#ffffff' }
};

function generateAgentSprite(agentId, archetype) {
  const c = AGENT_COLORS[agentId];
  if (!c) return null;

  const B = c.body;
  const D = c.dark;
  const L = c.light;
  const E = c.eye;
  const W = '#ffffff';
  const K = '#000000';
  const S = '#c0c0c0'; // silver for weapons
  const R = '#ff4444'; // red accent
  const G = '#ffd700'; // gold

  // Base character (all archetypes share this body)
  const base = [
    [_, _, _, B, B, B, B, _, _, _],
    [_, _, B, B, B, B, B, B, _, _],
    [_, _, B, E, K, B, K, E, _, _],
    [_, _, B, B, B, B, B, B, _, _],
    [_, _, _, B, D, D, B, _, _, _],
    [_, _, B, B, B, B, B, B, _, _],
    [_, _, B, B, B, B, B, B, _, _],
    [_, _, B, _, _, _, _, B, _, _],
    [_, _, D, _, _, _, _, D, _, _],
    [_, _, D, _, _, _, _, D, _, _],
  ];

  // Archetype-specific modifications
  switch (archetype) {
    case 'berserker':
      return [
        [_, _, R, B, B, B, B, R, _, _],
        [_, R, B, B, B, B, B, B, R, _],
        [_, _, B, E, K, B, K, E, _, _],
        [_, _, B, B, R, R, B, B, _, _],
        [_, S, _, B, D, D, B, _, S, _],
        [_, S, B, B, B, B, B, B, S, _],
        [_, S, B, B, B, B, B, B, _, _],
        [_, _, B, _, _, _, _, B, _, _],
        [_, _, D, _, _, _, _, D, _, _],
        [_, _, D, D, _, _, D, D, _, _],
      ];
    case 'tank':
      return [
        [_, _, S, S, S, S, S, S, _, _],
        [_, S, S, B, B, B, B, S, S, _],
        [_, _, B, E, K, B, K, E, _, _],
        [_, _, B, B, B, B, B, B, _, _],
        [_, S, S, B, D, D, B, S, S, _],
        [S, S, B, B, B, B, B, B, S, S],
        [_, S, B, B, B, B, B, B, S, _],
        [_, _, B, B, _, _, B, B, _, _],
        [_, _, D, D, _, _, D, D, _, _],
        [_, _, D, D, _, _, D, D, _, _],
      ];
    case 'scout':
      return [
        [_, _, _, B, B, B, B, _, _, _],
        [_, _, B, B, B, B, B, B, _, _],
        [_, _, B, E, K, B, K, E, _, _],
        [_, _, B, B, B, B, B, B, _, _],
        [_, _, L, B, D, D, B, L, _, _],
        [_, L, L, B, B, B, B, L, L, _],
        [L, _, B, B, B, B, B, B, _, L],
        [_, _, B, _, _, _, _, B, _, _],
        [_, _, D, _, _, _, _, D, _, _],
        [_, D, D, _, _, _, _, D, D, _],
      ];
    case 'mage':
      return [
        [_, _, G, B, B, B, B, G, _, _],
        [_, _, B, B, B, B, B, B, _, _],
        [_, _, B, E, K, B, K, E, _, _],
        [_, _, B, B, B, B, B, B, _, _],
        [_, _, _, B, D, D, B, _, _, G],
        [_, _, B, B, B, B, B, B, _, G],
        [_, L, B, L, B, B, L, B, _, G],
        [_, _, B, _, _, _, _, B, _, G],
        [_, _, D, _, _, _, _, D, _, G],
        [_, _, D, _, _, _, _, D, _, G],
      ];
    default:
      return base;
  }
}

// Dead agent sprite (ghost/gray)
function generateDeadSprite() {
  const G = '#666666';
  const D = '#444444';
  const L = '#888888';
  return [
    [_, _, _, G, G, G, G, _, _, _],
    [_, _, G, G, G, G, G, G, _, _],
    [_, _, G, L, D, G, D, L, _, _],
    [_, _, G, G, G, G, G, G, _, _],
    [_, _, _, G, G, G, G, _, _, _],
    [_, _, G, G, G, G, G, G, _, _],
    [_, _, G, _, G, G, _, G, _, _],
    [_, _, _, G, _, _, G, _, _, _],
    [_, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _],
  ];
}

// Item sprites (8x8)
const ITEM_SPRITES = {
  health_pack: [
    [_, _, _, _, _, _, _, _],
    [_, _, _, '#ff3333', '#ff3333', _, _, _],
    [_, _, '#ff3333', '#ff3333', '#ff3333', '#ff3333', _, _],
    [_, '#ff3333', '#ff3333', '#ffffff', '#ffffff', '#ff3333', '#ff3333', _],
    [_, '#ff3333', '#ff3333', '#ffffff', '#ffffff', '#ff3333', '#ff3333', _],
    [_, _, '#ff3333', '#ff3333', '#ff3333', '#ff3333', _, _],
    [_, _, _, '#ff3333', '#ff3333', _, _, _],
    [_, _, _, _, _, _, _, _],
  ],
  damage_amp: [
    [_, _, _, '#ff8800', _, _, _, _],
    [_, _, '#ff8800', '#ffaa00', '#ff8800', _, _, _],
    [_, '#ff8800', '#ffaa00', '#ffcc00', '#ffaa00', '#ff8800', _, _],
    [_, _, '#ff8800', '#ffaa00', '#ff8800', _, _, _],
    [_, _, _, '#ff8800', _, _, _, _],
    [_, _, _, '#ff8800', _, _, _, _],
    [_, _, '#ff6600', '#ff8800', '#ff6600', _, _, _],
    [_, _, _, _, _, _, _, _],
  ],
  speed_boost: [
    [_, _, _, _, '#44aaff', _, _, _],
    [_, _, _, '#44aaff', '#66ccff', _, _, _],
    [_, _, '#44aaff', '#66ccff', _, _, _, _],
    [_, '#44aaff', '#66ccff', '#44aaff', '#44aaff', '#44aaff', _, _],
    [_, _, _, _, _, '#66ccff', '#44aaff', _],
    [_, _, _, _, '#66ccff', '#44aaff', _, _],
    [_, _, _, '#66ccff', '#44aaff', _, _, _],
    [_, _, _, _, _, _, _, _],
  ],
  shield_token: [
    [_, _, '#c0c0c0', '#c0c0c0', '#c0c0c0', '#c0c0c0', _, _],
    [_, '#c0c0c0', '#e0e0e0', '#e0e0e0', '#e0e0e0', '#e0e0e0', '#c0c0c0', _],
    [_, '#c0c0c0', '#e0e0e0', '#88bbff', '#88bbff', '#e0e0e0', '#c0c0c0', _],
    [_, '#c0c0c0', '#e0e0e0', '#88bbff', '#88bbff', '#e0e0e0', '#c0c0c0', _],
    [_, _, '#c0c0c0', '#e0e0e0', '#e0e0e0', '#c0c0c0', _, _],
    [_, _, _, '#c0c0c0', '#c0c0c0', _, _, _],
    [_, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _],
  ]
};

// Export for use in renderer
window.PIXELS = {
  generateAgentSprite,
  generateDeadSprite,
  ITEM_SPRITES,
  AGENT_COLORS
};
