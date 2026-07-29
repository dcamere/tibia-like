import { MapSchema, Schema, type } from '@colyseus/schema';

import { CreatureState } from './CreatureState';
import { PlayerState } from './PlayerState';

export class WorldState extends Schema {
    @type({ map: PlayerState })
    declare players: MapSchema<PlayerState>;

    @type({ map: CreatureState })
    declare creatures: MapSchema<CreatureState>;

    constructor() {
        super();
        this.players = new MapSchema<PlayerState>();
        this.creatures = new MapSchema<CreatureState>();
    }
}
