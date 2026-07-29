import { TilePosition } from '@tibia-like/shared';

export type { TilePosition };

export type WorldPosition = {
    x: number;
    y: number;
};

/**
 * Converts logical tile coordinates into world pixel coordinates,
 * centered within the tile. This is the single source of truth for
 * that conversion so entities and the scene never drift apart.
 */
export const tileToWorldPosition = (
    tileX: number,
    tileY: number,
    tileSize: number
): WorldPosition => {
    return {
        x: tileX * tileSize + tileSize / 2,
        y: tileY * tileSize + tileSize / 2
    };
};
