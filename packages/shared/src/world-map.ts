import { isBlockingTile, TileType, type TileType as TileTypeValue } from './tile-type';
import type { TilePosition } from './tile-position';

export { isBlockingTile, TileType } from './tile-type';

export const TILE_SIZE = 32;

const MAP_SEED = 1337;
const GENERATED_MAP_WIDTH_IN_TILES = 80;
const GENERATED_MAP_HEIGHT_IN_TILES = 80;
const CITY_MIN_X = 8;
const CITY_MAX_X = 34;
const CITY_MIN_Y = 8;
const CITY_MAX_Y = 34;
const CITY_CENTER_X = 21;
const CITY_CENTER_Y = 21;

export const STARTER_CITY_SPAWN_TILES: readonly TilePosition[] = [
    { tileX: 20, tileY: 20 },
    { tileX: 21, tileY: 20 },
    { tileX: 22, tileY: 20 },
    { tileX: 20, tileY: 21 },
    { tileX: 21, tileY: 21 },
    { tileX: 22, tileY: 21 }
];

export const STARTER_CITY_DEFAULT_SPAWN: TilePosition = {
    tileX: 21,
    tileY: 21
};

const seededNoise = (tileX: number, tileY: number): number => {
    const value = Math.sin(tileX * 12.9898 + tileY * 78.233 + MAP_SEED) * 43758.5453;
    return value - Math.floor(value);
};

const isInsideCityBounds = (tileX: number, tileY: number): boolean => {
    return (
        tileX >= CITY_MIN_X &&
        tileX <= CITY_MAX_X &&
        tileY >= CITY_MIN_Y &&
        tileY <= CITY_MAX_Y
    );
};

const paintRoad = (
    map: TileTypeValue[][],
    fromX: number,
    toX: number,
    fromY: number,
    toY: number
): void => {
    for (let tileY = fromY; tileY <= toY; tileY += 1) {
        for (let tileX = fromX; tileX <= toX; tileX += 1) {
            map[tileY][tileX] = TileType.Road;
        }
    }
};

const paintWallRectangle = (
    map: TileTypeValue[][],
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
): void => {
    for (let tileX = minX; tileX <= maxX; tileX += 1) {
        map[minY][tileX] = TileType.Wall;
        map[maxY][tileX] = TileType.Wall;
    }

    for (let tileY = minY; tileY <= maxY; tileY += 1) {
        map[tileY][minX] = TileType.Wall;
        map[tileY][maxX] = TileType.Wall;
    }
};

const addBuilding = (
    map: TileTypeValue[][],
    minX: number,
    minY: number,
    width: number,
    height: number,
    doorX: number,
    doorY: number
): void => {
    const maxX = minX + width - 1;
    const maxY = minY + height - 1;

    paintWallRectangle(map, minX, maxX, minY, maxY);

    for (let tileY = minY + 1; tileY < maxY; tileY += 1) {
        for (let tileX = minX + 1; tileX < maxX; tileX += 1) {
            map[tileY][tileX] = TileType.Road;
        }
    }

    map[doorY][doorX] = TileType.Road;
};

const applyStarterCity = (map: TileTypeValue[][]): void => {
    paintWallRectangle(map, CITY_MIN_X, CITY_MAX_X, CITY_MIN_Y, CITY_MAX_Y);

    const northGateX = CITY_CENTER_X;
    const southGateX = CITY_CENTER_X;
    const westGateY = CITY_CENTER_Y;
    const eastGateY = CITY_CENTER_Y;

    map[CITY_MIN_Y][northGateX] = TileType.Road;
    map[CITY_MIN_Y][northGateX - 1] = TileType.Road;
    map[CITY_MIN_Y][northGateX + 1] = TileType.Road;
    map[CITY_MAX_Y][southGateX] = TileType.Road;
    map[CITY_MAX_Y][southGateX - 1] = TileType.Road;
    map[CITY_MAX_Y][southGateX + 1] = TileType.Road;
    map[westGateY][CITY_MIN_X] = TileType.Road;
    map[westGateY - 1][CITY_MIN_X] = TileType.Road;
    map[westGateY + 1][CITY_MIN_X] = TileType.Road;
    map[eastGateY][CITY_MAX_X] = TileType.Road;
    map[eastGateY - 1][CITY_MAX_X] = TileType.Road;
    map[eastGateY + 1][CITY_MAX_X] = TileType.Road;

    paintRoad(map, CITY_CENTER_X - 1, CITY_CENTER_X + 1, CITY_MIN_Y + 1, CITY_MAX_Y - 1);
    paintRoad(map, CITY_MIN_X + 1, CITY_MAX_X - 1, CITY_CENTER_Y - 1, CITY_CENTER_Y + 1);
    paintRoad(map, CITY_CENTER_X - 3, CITY_CENTER_X + 3, CITY_CENTER_Y - 3, CITY_CENTER_Y + 3);

    addBuilding(map, 11, 11, 6, 5, 13, 15);
    addBuilding(map, 25, 11, 7, 5, 28, 15);
    addBuilding(map, 11, 25, 6, 5, 13, 25);
    addBuilding(map, 24, 25, 8, 5, 28, 25);

    for (let treeX = CITY_MIN_X + 2; treeX <= CITY_MAX_X - 2; treeX += 6) {
        map[CITY_MIN_Y + 2][treeX] = TileType.Tree;
        map[CITY_MAX_Y - 2][treeX] = TileType.Tree;
    }

    map[CITY_CENTER_Y - 5][CITY_CENTER_X] = TileType.Rock;
    map[CITY_CENTER_Y + 5][CITY_CENTER_X] = TileType.Rock;
};

const generateWorldMap = (): TileType[][] => {
    const generated: TileType[][] = [];

    for (let tileY = 0; tileY < GENERATED_MAP_HEIGHT_IN_TILES; tileY += 1) {
        const row: TileType[] = [];

        for (let tileX = 0; tileX < GENERATED_MAP_WIDTH_IN_TILES; tileX += 1) {
            row.push(TileType.Grass);
        }

        generated.push(row);
    }

    applyStarterCity(generated);

    for (let tileY = 0; tileY < GENERATED_MAP_HEIGHT_IN_TILES; tileY += 1) {
        for (let tileX = 0; tileX < GENERATED_MAP_WIDTH_IN_TILES; tileX += 1) {
            if (isInsideCityBounds(tileX, tileY)) {
                continue;
            }

            const noiseValue = seededNoise(tileX, tileY);

            if (noiseValue > 0.93) {
                generated[tileY][tileX] = TileType.Wall;
                continue;
            }

            if (noiseValue > 0.86) {
                generated[tileY][tileX] = TileType.Tree;
                continue;
            }

            if (noiseValue > 0.8) {
                generated[tileY][tileX] = TileType.Rock;
                continue;
            }
        }
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