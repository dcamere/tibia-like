import { MapSchema, Schema, type } from '@colyseus/schema';

import { CreatureState } from './CreatureState';
import { GroundItemState } from './GroundItemState';
import { PlayerState } from './PlayerState';

export class WorldState extends Schema {
    @type({ map: PlayerState })
    declare players: MapSchema<PlayerState>;

    @type({ map: CreatureState })
    declare creatures: MapSchema<CreatureState>;

    @type({ map: GroundItemState })
    declare groundItems: MapSchema<GroundItemState>;

    constructor() {
        super();
        this.players = new MapSchema<PlayerState>();
        this.creatures = new MapSchema<CreatureState>();
        this.groundItems = new MapSchema<GroundItemState>();
    }
}
