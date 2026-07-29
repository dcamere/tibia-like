import { TilePosition } from '../world/coordinates';

export type CombatConfig = {
    attackRangeInTiles: number;
    damage: number;
    cooldownMs: number;
};

export type AttackResult = {
    hit: boolean;
    damage: number;
};

/**
 * Resolves whether an attack is valid (range check) and how much damage
 * it deals. Pure rules, no rendering and no entity classes involved, so
 * the exact same logic can run on the server once combat becomes
 * authoritative (Fase H) instead of being trusted from the client.
 */
export class CombatSystem {
    constructor(private readonly config: CombatConfig) {}

    public get cooldownMs(): number {
        return this.config.cooldownMs;
    }

    public isInRange(
        attacker: TilePosition,
        target: TilePosition
    ): boolean {
        const distanceX = Math.abs(attacker.tileX - target.tileX);
        const distanceY = Math.abs(attacker.tileY - target.tileY);

        const isSameTile = distanceX === 0 && distanceY === 0;
        const isWithinRange =
            Math.max(distanceX, distanceY) <= this.config.attackRangeInTiles;

        return isWithinRange && !isSameTile;
    }

    public resolveAttack(
        attacker: TilePosition,
        target: TilePosition
    ): AttackResult {
        if (!this.isInRange(attacker, target)) {
            return { hit: false, damage: 0 };
        }

        return { hit: true, damage: this.config.damage };
    }
}
