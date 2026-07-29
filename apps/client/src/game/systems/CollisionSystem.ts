import { isBlockingTile, TileType } from '../world/tileTypes';

/**
 * Validates tile positions against a fixed world map: world bounds and
 * blocking tiles (walls, trees, rocks, etc.). Knows nothing about
 * entities. This is the same logic the server will run authoritatively
 * once movement is migrated there, so it takes the map data explicitly
 * instead of importing a single global map.
 */
export class CollisionSystem {
    constructor(
        private readonly map: TileType[][],
        private readonly widthInTiles: number,
        private readonly heightInTiles: number
    ) {}

    public isOutsideWorld(tileX: number, tileY: number): boolean {
        return (
            tileX < 0 ||
            tileX >= this.widthInTiles ||
            tileY < 0 ||
            tileY >= this.heightInTiles
        );
    }

    public isTileBlocked(tileX: number, tileY: number): boolean {
        const tileType = this.map[tileY]?.[tileX];

        if (tileType === undefined) {
            return true;
        }

        return isBlockingTile(tileType);
    }

    public isWalkable(tileX: number, tileY: number): boolean {
        return (
            !this.isOutsideWorld(tileX, tileY) &&
            !this.isTileBlocked(tileX, tileY)
        );
    }
}
