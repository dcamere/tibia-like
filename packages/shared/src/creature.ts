import type { CreatureId } from './entity';

export type CreatureType = 'rat';

export type CreatureStateView = {
    id: CreatureId;
    type: CreatureType;
    name: string;
    tileX: number;
    tileY: number;
    spawnTileX: number;
    spawnTileY: number;
    health: number;
    maxHealth: number;
    isAlive: boolean;
};
