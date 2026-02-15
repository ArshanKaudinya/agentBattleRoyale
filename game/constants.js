const GRID_SIZE = 32;
const MAX_TURNS = 50;
const ZONE_SHRINK_INTERVAL = 8;
const ZONE_SHRINK_AMOUNT = 2;
const ZONE_DAMAGE = 10;
const SPAWN_INTERVAL = 3;
const LLM_TIMEOUT = 10000;
const TURN_DELAY_MS = 2000;

const ZONE_INITIAL = {
  center: [16, 16],
  radius: 16
};

const STARTING_POSITIONS = [
  [2, 2],
  [2, 29],
  [29, 2],
  [29, 29]
];

const AGENTS = [
  { id: 'gpt', name: 'GPT-4', model: 'gpt-4', color: '#10a37f' },
  { id: 'claude', name: 'Claude', model: 'claude', color: '#d4886f' },
  { id: 'gemini', name: 'Gemini', model: 'gemini', color: '#4285f4' },
  { id: 'mini', name: 'GPT-Mini', model: 'gpt-4o-mini', color: '#9333ea' }
];

const DIRECTIONS = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0]
};

module.exports = {
  GRID_SIZE,
  MAX_TURNS,
  ZONE_SHRINK_INTERVAL,
  ZONE_SHRINK_AMOUNT,
  ZONE_DAMAGE,
  SPAWN_INTERVAL,
  LLM_TIMEOUT,
  TURN_DELAY_MS,
  ZONE_INITIAL,
  STARTING_POSITIONS,
  AGENTS,
  DIRECTIONS
};
