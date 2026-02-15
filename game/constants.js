const GRID_SIZE = 32;
const MAX_TURNS = 50;
const ZONE_SHRINK_INTERVAL = 8;
const ZONE_SHRINK_AMOUNT = 2;
const ZONE_DAMAGE = 5;
const SPAWN_INTERVAL = 3;
const LLM_TIMEOUT = 15000;
const TURN_DELAY_MS = 2000;

const ZONE_INITIAL = {
  center: [16, 16],
  radius: 12
};

// Random positions within radius 10 of center — all agents start inside zone
function generateStartingPositions() {
  const positions = [];
  const center = [16, 16];
  while (positions.length < 4) {
    const x = center[0] + Math.floor(Math.random() * 21) - 10;
    const y = center[1] + Math.floor(Math.random() * 21) - 10;
    if (x < 1 || x > 30 || y < 1 || y > 30) continue;
    const occupied = positions.some(p => p[0] === x && p[1] === y);
    if (occupied) continue;
    const dist = Math.sqrt((x - center[0]) ** 2 + (y - center[1]) ** 2);
    if (dist > 10) continue;
    positions.push([x, y]);
  }
  return positions;
}
const AGENTS = [
  { id: 'gpt', name: 'GPT-4', model: 'gpt-4', color: '#10a37f' },
  { id: 'claude', name: 'Claude', model: 'claude', color: '#d4886f' },
  { id: 'haiku', name: 'Haiku', model: 'claude-haiku-4-5', color: '#4285f4' },
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
  generateStartingPositions,
  AGENTS,
  DIRECTIONS
};
