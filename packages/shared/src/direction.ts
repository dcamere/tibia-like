/**
 * A single-step movement intent. Shared between client and server: the
 * client only ever sends a Direction, never a raw position — the
 * authoritative side (server, once it exists) is responsible for turning
 * this into a validated tile position.
 */
export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTIONS: readonly Direction[] = [
    'up',
    'down',
    'left',
    'right'
];

export type TileDelta = {
    deltaX: number;
    deltaY: number;
};

/**
 * Maps each Direction to the tile delta it represents. Used by the
 * client to move locally today, and by the server later to validate the
 * exact same intents authoritatively (Fase G).
 */
export const DIRECTION_DELTAS: Record<Direction, TileDelta> = {
    up: { deltaX: 0, deltaY: -1 },
    down: { deltaX: 0, deltaY: 1 },
    left: { deltaX: -1, deltaY: 0 },
    right: { deltaX: 1, deltaY: 0 }
};

export const isDirection = (value: unknown): value is Direction => {
    return typeof value === 'string' && value in DIRECTION_DELTAS;
};
