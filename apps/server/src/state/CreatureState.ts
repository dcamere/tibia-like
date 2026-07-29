import { Schema, type } from '@colyseus/schema';

export class CreatureState extends Schema {
    @type('string')
    declare id: string;

    @type('string')
    declare type: string;

    @type('string')
    declare name: string;

    @type('number')
    declare tileX: number;

    @type('number')
    declare tileY: number;

    @type('number')
    declare spawnTileX: number;

    @type('number')
    declare spawnTileY: number;

    @type('number')
    declare health: number;

    @type('number')
    declare maxHealth: number;

    @type('boolean')
    declare isAlive: boolean;
}
