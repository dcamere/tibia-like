import { TilePosition } from '../world/coordinates';

import { CollisionSystem } from './CollisionSystem';

/**
 * Decides whether an entity may move into a given tile, combining map
 * collisions with entity occupancy. This is the piece that will move to
 * the server almost unchanged once movement becomes authoritative: the
 * server will call the same `canMoveTo` with its own list of occupied
 * tiles instead of trusting the client's position.
 */
export class MovementSystem {
    constructor(private readonly collisionSystem: CollisionSystem) {}

    public canMoveTo(
        tileX: number,
        tileY: number,
        occupiedTiles: readonly TilePosition[]
    ): boolean {
        if (!this.collisionSystem.isWalkable(tileX, tileY)) {
            return false;
        }

        return !occupiedTiles.some(
            (tile) => tile.tileX === tileX && tile.tileY === tileY
        );
    }
}
