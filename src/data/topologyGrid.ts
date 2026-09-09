/** Shared world-coordinate grid for node placement and movement. */
export const TOPOLOGY_GRID: [number, number] = [24, 24];

export function snapTopologyPosition(position: { x: number; y: number }) {
  return {
    x: Math.round(position.x / TOPOLOGY_GRID[0]) * TOPOLOGY_GRID[0],
    y: Math.round(position.y / TOPOLOGY_GRID[1]) * TOPOLOGY_GRID[1],
  };
}
