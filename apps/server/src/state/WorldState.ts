import { MapSchema, Schema, type } from '@colyseus/schema';

import { PlayerState } from './PlayerState';

export class WorldState extends Schema {
    @type({ map: PlayerState })
    declare players: MapSchema<PlayerState>;

    constructor() {
        super();
        this.players = new MapSchema<PlayerState>();
    }
}
