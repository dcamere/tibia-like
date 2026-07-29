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
    { tileX: 18, tileY: 21 },
    { tileX: 19, tileY: 21 },
    { tileX: 20, tileY: 21 },
    { tileX: 18, tileY: 22 },
    { tileX: 19, tileY: 22 },
    { tileX: 20, tileY: 22 }
];

export const STARTER_CITY_DEFAULT_SPAWN: TilePosition = {
    tileX: 19,
    tileY: 22
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

const paintTileRectangle = (
    map: TileTypeValue[][],
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    tileType: TileType
): void => {
    for (let tileY = minY; tileY <= maxY; tileY += 1) {
        for (let tileX = minX; tileX <= maxX; tileX += 1) {
            map[tileY][tileX] = tileType;
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

    paintTileRectangle(map, minX, maxX, minY, maxY, TileType.HouseRoof);

    for (let tileY = minY + 1; tileY < maxY; tileY += 1) {
        for (let tileX = minX + 1; tileX < maxX; tileX += 1) {
            map[tileY][tileX] = TileType.HouseFloor;
        }
    }

    map[doorY][doorX] = TileType.Bridge;
};

const addGarden = (
    map: TileTypeValue[][],
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
): void => {
    paintTileRectangle(map, minX, maxX, minY, maxY, TileType.Garden);

    for (let tileX = minX; tileX <= maxX; tileX += 1) {
        map[minY][tileX] = TileType.Fence;
        map[maxY][tileX] = TileType.Fence;
    }

    for (let tileY = minY; tileY <= maxY; tileY += 1) {
        map[tileY][minX] = TileType.Fence;
        map[tileY][maxX] = TileType.Fence;
    }

    for (let tileY = minY + 1; tileY < maxY; tileY += 1) {
        for (let tileX = minX + 1; tileX < maxX; tileX += 1) {
            const noise = seededNoise(tileX * 2, tileY * 3);

            if (noise > 0.83) {
                map[tileY][tileX] = TileType.Bush;
                continue;
            }

            if (noise > 0.65) {
                map[tileY][tileX] = TileType.Flower;
            }
        }
    }
};

const addMarket = (
    map: TileTypeValue[][],
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
): void => {
    paintTileRectangle(map, minX, maxX, minY, maxY, TileType.Road);

    for (let tileY = minY + 1; tileY <= maxY - 1; tileY += 2) {
        for (let tileX = minX + 1; tileX <= maxX - 1; tileX += 3) {
            if ((tileX + tileY) % 2 === 0) {
                map[tileY][tileX] = TileType.MarketStall;
                if (tileX + 1 <= maxX - 1) {
                    map[tileY][tileX + 1] = TileType.Crate;
                }
            }
        }
    }
};

const addMoatAndBridges = (map: TileTypeValue[][]): void => {
    const moatMinX = CITY_MIN_X - 2;
    const moatMaxX = CITY_MAX_X + 2;
    const moatMinY = CITY_MIN_Y - 2;
    const moatMaxY = CITY_MAX_Y + 2;

    for (let tileX = moatMinX; tileX <= moatMaxX; tileX += 1) {
        map[moatMinY][tileX] = TileType.Water;
        map[moatMaxY][tileX] = TileType.Water;
    }

    for (let tileY = moatMinY; tileY <= moatMaxY; tileY += 1) {
        map[tileY][moatMinX] = TileType.Water;
        map[tileY][moatMaxX] = TileType.Water;
    }

    for (let offset = -1; offset <= 1; offset += 1) {
        map[moatMinY][CITY_CENTER_X + offset] = TileType.Bridge;
        map[moatMaxY][CITY_CENTER_X + offset] = TileType.Bridge;
        map[CITY_CENTER_Y + offset][moatMinX] = TileType.Bridge;
        map[CITY_CENTER_Y + offset][moatMaxX] = TileType.Bridge;
    }
};

const applyStarterCity = (map: TileTypeValue[][]): void => {
    addMoatAndBridges(map);
    paintWallRectangle(map, CITY_MIN_X, CITY_MAX_X, CITY_MIN_Y, CITY_MAX_Y);

    const northGateX = CITY_CENTER_X;
    const southGateX = CITY_CENTER_X;
    const westGateY = CITY_CENTER_Y;
    const eastGateY = CITY_CENTER_Y;

    map[CITY_MIN_Y][northGateX] = TileType.Bridge;
    map[CITY_MIN_Y][northGateX - 1] = TileType.Bridge;
    map[CITY_MIN_Y][northGateX + 1] = TileType.Bridge;
    map[CITY_MAX_Y][southGateX] = TileType.Bridge;
    map[CITY_MAX_Y][southGateX - 1] = TileType.Bridge;
    map[CITY_MAX_Y][southGateX + 1] = TileType.Bridge;
    map[westGateY][CITY_MIN_X] = TileType.Bridge;
    map[westGateY - 1][CITY_MIN_X] = TileType.Bridge;
    map[westGateY + 1][CITY_MIN_X] = TileType.Bridge;
    map[eastGateY][CITY_MAX_X] = TileType.Bridge;
    map[eastGateY - 1][CITY_MAX_X] = TileType.Bridge;
    map[eastGateY + 1][CITY_MAX_X] = TileType.Bridge;

    paintRoad(map, CITY_CENTER_X - 1, CITY_CENTER_X + 1, CITY_MIN_Y + 1, CITY_MAX_Y - 1);
    paintRoad(map, CITY_MIN_X + 1, CITY_MAX_X - 1, CITY_CENTER_Y - 1, CITY_CENTER_Y + 1);
    paintRoad(map, CITY_CENTER_X - 3, CITY_CENTER_X + 3, CITY_CENTER_Y - 3, CITY_CENTER_Y + 3);
    paintRoad(map, CITY_MIN_X + 1, CITY_CENTER_X - 4, CITY_MIN_Y + 4, CITY_MIN_Y + 5);
    paintRoad(map, CITY_CENTER_X + 4, CITY_MAX_X - 1, CITY_MAX_Y - 5, CITY_MAX_Y - 4);

    addBuilding(map, 11, 11, 6, 5, 13, 15);
    addBuilding(map, 25, 11, 7, 5, 28, 15);
    addBuilding(map, 11, 25, 6, 5, 13, 25);
    addBuilding(map, 24, 25, 8, 5, 28, 25);

    addGarden(map, 17, 20, 11, 14);
    addGarden(map, 22, 25, 27, 30);
    addMarket(map, 16, 27, 17, 24);

    map[CITY_CENTER_Y][CITY_CENTER_X] = TileType.Fountain;
    map[CITY_CENTER_Y - 1][CITY_CENTER_X] = TileType.Fountain;
    map[CITY_CENTER_Y + 1][CITY_CENTER_X] = TileType.Fountain;
    map[CITY_CENTER_Y][CITY_CENTER_X - 1] = TileType.Fountain;
    map[CITY_CENTER_Y][CITY_CENTER_X + 1] = TileType.Fountain;

    map[CITY_CENTER_Y - 4][CITY_CENTER_X - 4] = TileType.Statue;
    map[CITY_CENTER_Y + 4][CITY_CENTER_X + 4] = TileType.Statue;

    map[CITY_MIN_Y + 1][CITY_CENTER_X - 2] = TileType.Banner;
    map[CITY_MIN_Y + 1][CITY_CENTER_X + 2] = TileType.Banner;
    map[CITY_MAX_Y - 1][CITY_CENTER_X - 2] = TileType.Banner;
    map[CITY_MAX_Y - 1][CITY_CENTER_X + 2] = TileType.Banner;

    for (let tileY = CITY_MIN_Y + 3; tileY <= CITY_MAX_Y - 3; tileY += 5) {
        map[tileY][CITY_CENTER_X - 2] = TileType.LampPost;
        map[tileY][CITY_CENTER_X + 2] = TileType.LampPost;
    }

    for (let tileX = CITY_MIN_X + 3; tileX <= CITY_MAX_X - 3; tileX += 5) {
        map[CITY_CENTER_Y - 2][tileX] = TileType.LampPost;
        map[CITY_CENTER_Y + 2][tileX] = TileType.LampPost;
    }

    for (let treeX = CITY_MIN_X + 2; treeX <= CITY_MAX_X - 2; treeX += 6) {
        map[CITY_MIN_Y + 2][treeX] = TileType.Tree;
        map[CITY_MAX_Y - 2][treeX] = TileType.Tree;
    }

    map[CITY_CENTER_Y - 5][CITY_CENTER_X] = TileType.Rock;
    map[CITY_CENTER_Y + 5][CITY_CENTER_X] = TileType.Rock;

    for (const spawnTile of STARTER_CITY_SPAWN_TILES) {
        map[spawnTile.tileY][spawnTile.tileX] = TileType.Road;
    }
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

            if (noiseValue > 0.95) {
                generated[tileY][tileX] = TileType.Water;
                continue;
            }

            if (noiseValue > 0.92) {
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

            if (noiseValue > 0.76) {
                generated[tileY][tileX] = TileType.Flower;
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
