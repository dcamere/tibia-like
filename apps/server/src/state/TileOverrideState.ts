import { Schema, type } from '@colyseus/schema';

export class TileOverrideState extends Schema {
    @type('number')
    declare tileX: number;

    @type('number')
    declare tileY: number;

    // -1 = no tile type override, otherwise TileType numeric value
    @type('number')
    declare tileType: number;

    // -1 = default map walkability, 0 = blocked, 1 = walkable
    @type('number')
    declare walkableMode: number;
}
