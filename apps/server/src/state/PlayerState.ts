import { Schema, type } from '@colyseus/schema';

export class PlayerState extends Schema {
    @type('string')
    declare id: string;

    @type('string')
    declare name: string;

    @type('number')
    declare tileX: number;

    @type('number')
    declare tileY: number;

    @type('number')
    declare level: number;

    @type('number')
    declare experience: number;
}
