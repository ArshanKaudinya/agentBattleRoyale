const { GRID_SIZE, DIRECTIONS } = require('./constants');

function calculatePosition(position, direction, tiles) {
  const delta = DIRECTIONS[direction];
  if (!delta) return null;
  return [
    position[0] + delta[0] * tiles,
    position[1] + delta[1] * tiles
  ];
}

function isValidPosition(pos) {
  return pos[0] >= 0 && pos[0] < GRID_SIZE && pos[1] >= 0 && pos[1] < GRID_SIZE;
}

function isOccupied(pos, agents) {
  return Object.values(agents).some(
    a => a.is_alive && a.position[0] === pos[0] && a.position[1] === pos[1]
  );
}

function isObstacle(pos, obstacles) {
  if (!obstacles) return false;
  return obstacles.some(obs => obs[0] === pos[0] && obs[1] === pos[1]);
}

function getDistance(a, b) {
  // Manhattan distance for game mechanics (movement, attack range)
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function getEuclideanDistance(a, b) {
  // Euclidean distance for zone checks
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

function isInZone(pos, zone) {
  return getEuclideanDistance(pos, zone.center) <= zone.radius;
}

function getRandomEmptyTileInZone(zone, agents, items, obstacles) {
  const maxAttempts = 100;
  for (let i = 0; i < maxAttempts; i++) {
    const x = Math.floor(Math.random() * GRID_SIZE);
    const y = Math.floor(Math.random() * GRID_SIZE);
    const pos = [x, y];

    if (!isInZone(pos, zone)) continue;
    if (isOccupied(pos, agents)) continue;
    if (items.some(item => item.position[0] === x && item.position[1] === y)) continue;
    if (isObstacle(pos, obstacles)) continue;

    return pos;
  }
  // Fallback: zone center area
  return [zone.center[0] + Math.floor(Math.random() * 3) - 1,
          zone.center[1] + Math.floor(Math.random() * 3) - 1];
}

function getAdjacentPositions(pos) {
  const adjacent = [];
  for (const dir of Object.values(DIRECTIONS)) {
    const newPos = [pos[0] + dir[0], pos[1] + dir[1]];
    if (isValidPosition(newPos)) {
      adjacent.push(newPos);
    }
  }
  return adjacent;
}

module.exports = {
  calculatePosition,
  isValidPosition,
  isOccupied,
  isObstacle,
  getDistance,
  getEuclideanDistance,
  isInZone,
  getRandomEmptyTileInZone,
  getAdjacentPositions
};
