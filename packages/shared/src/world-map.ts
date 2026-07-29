import { isBlockingTile, type TileType } from './tile-type';

export { isBlockingTile, TileType } from './tile-type';

export const TILE_SIZE = 32;

const MAP_SEED = 1337;
const GENERATED_MAP_WIDTH_IN_TILES = 80;
const GENERATED_MAP_HEIGHT_IN_TILES = 80;
const SAFE_ZONE_MAX_X = 18;
const SAFE_ZONE_MAX_Y = 18;

const seededNoise = (tileX: number, tileY: number): number => {
    const value = Math.sin(tileX * 12.9898 + tileY * 78.233 + MAP_SEED) * 43758.5453;
    return value - Math.floor(value);
};

const generateWorldMap = (): TileType[][] => {
    const generated: TileType[][] = [];

    for (let tileY = 0; tileY < GENERATED_MAP_HEIGHT_IN_TILES; tileY += 1) {
        const row: TileType[] = [];

        for (let tileX = 0; tileX < GENERATED_MAP_WIDTH_IN_TILES; tileX += 1) {
            if (tileX <= SAFE_ZONE_MAX_X && tileY <= SAFE_ZONE_MAX_Y) {
                row.push(0);
                continue;
            }

            const noiseValue = seededNoise(tileX, tileY);

            if (noiseValue > 0.93) {
                row.push(1);
                continue;
            }

            if (noiseValue > 0.86) {
                row.push(2);
                continue;
            }

            if (noiseValue > 0.8) {
                row.push(3);
                continue;
            }

            row.push(0);
        }

        generated.push(row);
    }

    return generated;
};

export const WORLD_MAP: TileType[][] = generateWorldMap();

export const MAP_WIDTH_IN_TILES = WORLD_MAP[0].length;
export const MAP_HEIGHT_IN_TILES = WORLD_MAP.length;

export const WORLD_WIDTH = MAP_WIDTH_IN_TILES * TILE_SIZE;
export const WORLD_HEIGHT = MAP_HEIGHT_IN_TILES * TILE_SIZE;

export const isWalkableTile = (tileX: number, tileY: number): boolean => {
    if (
        tileX < 0 ||
        tileX >= MAP_WIDTH_IN_TILES ||
        tileY < 0 ||
        tileY >= MAP_HEIGHT_IN_TILES
    ) {
        return false;
    }

    const tile = WORLD_MAP[tileY]?.[tileX];

    if (tile === undefined) {
        return false;
    }

    return !isBlockingTile(tile);
};