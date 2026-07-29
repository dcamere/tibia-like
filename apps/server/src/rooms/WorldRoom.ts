import { Client, Room } from '@colyseus/core';

import {
    DIRECTION_DELTAS,
    isAttackInput,
    isMoveInput,
    isWalkableTile,
    type TilePosition
} from '@tibia-like/shared';

import { PlayerState } from '../state/PlayerState';
import { WorldState } from '../state/WorldState';

const WORLD_ROOM_NAME = 'world';

const SPAWN_TILES: readonly TilePosition[] = [
    { tileX: 5, tileY: 5 },
    { tileX: 7, tileY: 5 },
    { tileX: 5, tileY: 7 },
    { tileX: 7, tileY: 7 },
    { tileX: 9, tileY: 5 },
    { tileX: 9, tileY: 7 }
];

const DEFAULT_SPAWN_TILE: TilePosition = {
    tileX: 5,
    tileY: 5
};

const CREATURE_MOVE_INTERVAL_MS = 700;
const CREATURE_RESPAWN_DELAY_MS = 5000;
const PLAYER_MOVE_COOLDOWN_MS = 120;
const ATTACK_RANGE_IN_TILES = 1;
const ATTACK_DAMAGE = 10;
const ATTACK_COOLDOWN_MS = 500;

const CREATURE_SPAWNS = [
    {
        id: 'creature-rat-1',
        name: 'Rat',
        tileX: 11,
        tileY: 11,
        maxHealth: 30
    },
    {
        id: 'creature-rat-2',
        name: 'Rat',
        tileX: 16,
        tileY: 3,
        maxHealth: 30
    }
] as const;

const CREATURE_MOVE_DIRECTIONS: readonly TilePosition[] = [
    { tileX: -1, tileY: 0 },
    { tileX: 1, tileY: 0 },
    { tileX: 0, tileY: -1 },
    { tileX: 0, tileY: 1 }
];

type CreatureDamagedMessage = {
    creatureId: string;
    damage: number;
};

type CreatureKilledMessage = {
    creatureId: string;
};

type CreatureMovedMessage = {
    creatureId: string;
    tileX: number;
    tileY: number;
};

type CreatureStateSnapshot = {
    creatureId: string;
    tileX: number;
    tileY: number;
    currentHealth: number;
    isAlive: boolean;
};

type CreatureSnapshotMessage = {
    creatures: CreatureStateSnapshot[];
};

type CreatureRespawnedMessage = {
    creatureId: string;
    tileX: number;
    tileY: number;
    currentHealth: number;
};

type ServerCreatureState = {
    id: string;
    name: string;
    spawnTileX: number;
    spawnTileY: number;
    tileX: number;
    tileY: number;
    maxHealth: number;
    currentHealth: number;
    isAlive: boolean;
};

export { WORLD_ROOM_NAME };

export class WorldRoom extends Room<WorldState> {
    private nextSpawnIndex = 0;
    private readonly creatures = new Map<string, ServerCreatureState>();
    private readonly lastMoveAtByPlayer = new Map<string, number>();
    private readonly lastAttackAtByPlayer = new Map<string, number>();

    onCreate(): void {
        this.setState(new WorldState());
        this.initializeCreatures();

        this.onMessage('player:move', (client, payload: unknown) => {
            this.handlePlayerMove(client, payload);
        });

        this.onMessage(
            'player:attack',
            (client, payload: unknown) => {
                this.handlePlayerAttack(client, payload);
            }
        );

        this.setSimulationInterval(() => {
            this.tickCreatures();
        }, CREATURE_MOVE_INTERVAL_MS);

        console.info(`[WorldRoom] created room ${this.roomId}`);
    }

    onJoin(client: Client, options: unknown): void {
        const spawnTile = this.getNextSpawnTile();

        const player = new PlayerState();
        player.id = client.sessionId;
        player.name = this.resolvePlayerName(client.sessionId, options);
        player.tileX = spawnTile.tileX;
        player.tileY = spawnTile.tileY;

        this.state.players.set(client.sessionId, player);

        client.send('creature:snapshot', this.createCreatureSnapshot());

        console.info(
            `[WorldRoom] ${client.sessionId} joined as ${player.name}`
        );
    }

    onLeave(client: Client): void {
        this.state.players.delete(client.sessionId);
        this.lastMoveAtByPlayer.delete(client.sessionId);
        this.lastAttackAtByPlayer.delete(client.sessionId);

        console.info(`[WorldRoom] ${client.sessionId} left`);
    }

    private handlePlayerMove(client: Client, payload: unknown): void {
        const player = this.state.players.get(client.sessionId);

        if (!player || !isMoveInput(payload)) {
            return;
        }

        const delta = DIRECTION_DELTAS[payload.direction];

        if (!delta) {
            return;
        }

        const now = Date.now();
        const lastMoveAt = this.lastMoveAtByPlayer.get(client.sessionId) ?? 0;

        if (now - lastMoveAt < PLAYER_MOVE_COOLDOWN_MS) {
            return;
        }

        const nextTileX = player.tileX + delta.deltaX;
        const nextTileY = player.tileY + delta.deltaY;

        if (!this.canPlayerMoveTo(client.sessionId, nextTileX, nextTileY)) {
            this.lastMoveAtByPlayer.set(client.sessionId, now);
            return;
        }

        player.tileX = nextTileX;
        player.tileY = nextTileY;
        this.lastMoveAtByPlayer.set(client.sessionId, now);
    }

    private handlePlayerAttack(client: Client, payload: unknown): void {
        if (!isAttackInput(payload)) {
            return;
        }

        const attacker = this.state.players.get(client.sessionId);

        if (!attacker) {
            return;
        }

        const target = this.creatures.get(payload.targetId);

        if (!target || !target.isAlive) {
            return;
        }

        if (
            !this.isInAttackRange(
                attacker.tileX,
                attacker.tileY,
                target.tileX,
                target.tileY
            )
        ) {
            return;
        }

        const now = Date.now();
        const lastAttackAt = this.lastAttackAtByPlayer.get(client.sessionId) ?? 0;

        if (now - lastAttackAt < ATTACK_COOLDOWN_MS) {
            return;
        }

        this.lastAttackAtByPlayer.set(client.sessionId, now);

        target.currentHealth = Math.max(0, target.currentHealth - ATTACK_DAMAGE);

        const damagePayload: CreatureDamagedMessage = {
            creatureId: target.id,
            damage: ATTACK_DAMAGE
        };

        this.broadcast('creature:damaged', damagePayload);

        if (target.currentHealth === 0) {
            this.killCreature(target);
        }
    }

    private isInAttackRange(
        attackerTileX: number,
        attackerTileY: number,
        targetTileX: number,
        targetTileY: number
    ): boolean {
        const distanceX = Math.abs(attackerTileX - targetTileX);
        const distanceY = Math.abs(attackerTileY - targetTileY);

        const isSameTile = distanceX === 0 && distanceY === 0;

        return (
            !isSameTile &&
            Math.max(distanceX, distanceY) <= ATTACK_RANGE_IN_TILES
        );
    }

    private getNextSpawnTile(): TilePosition {
        const tile =
            SPAWN_TILES[this.nextSpawnIndex % SPAWN_TILES.length] ??
            DEFAULT_SPAWN_TILE;

        this.nextSpawnIndex += 1;

        return tile;
    }

    private resolvePlayerName(
        sessionId: string,
        options: unknown
    ): string {
        const fallbackName = `Player-${sessionId.slice(0, 4)}`;

        if (typeof options !== 'object' || options === null) {
            return fallbackName;
        }

        const candidate =
            (options as { name?: unknown }).name;

        if (typeof candidate !== 'string') {
            return fallbackName;
        }

        const normalizedName = candidate.trim().slice(0, 20);

        if (normalizedName.length === 0) {
            return fallbackName;
        }

        return normalizedName;
    }

    private initializeCreatures(): void {
        for (const spawn of CREATURE_SPAWNS) {
            this.creatures.set(spawn.id, {
                id: spawn.id,
                name: spawn.name,
                spawnTileX: spawn.tileX,
                spawnTileY: spawn.tileY,
                tileX: spawn.tileX,
                tileY: spawn.tileY,
                maxHealth: spawn.maxHealth,
                currentHealth: spawn.maxHealth,
                isAlive: true
            });
        }
    }

    private tickCreatures(): void {
        for (const creature of this.creatures.values()) {
            if (!creature.isAlive) {
                continue;
            }

            const directions = [...CREATURE_MOVE_DIRECTIONS];

            for (let index = directions.length - 1; index > 0; index -= 1) {
                const swapIndex = Math.floor(Math.random() * (index + 1));
                const current = directions[index];
                directions[index] = directions[swapIndex];
                directions[swapIndex] = current;
            }

            for (const direction of directions) {
                const nextTileX = creature.tileX + direction.tileX;
                const nextTileY = creature.tileY + direction.tileY;

                if (!this.canCreatureMoveTo(creature.id, nextTileX, nextTileY)) {
                    continue;
                }

                creature.tileX = nextTileX;
                creature.tileY = nextTileY;

                const payload: CreatureMovedMessage = {
                    creatureId: creature.id,
                    tileX: creature.tileX,
                    tileY: creature.tileY
                };

                this.broadcast('creature:moved', payload);
                break;
            }
        }
    }

    private canCreatureMoveTo(
        creatureId: string,
        tileX: number,
        tileY: number
    ): boolean {
        if (!isWalkableTile(tileX, tileY)) {
            return false;
        }

        for (const player of this.state.players.values()) {
            if (player.tileX === tileX && player.tileY === tileY) {
                return false;
            }
        }

        for (const creature of this.creatures.values()) {
            if (!creature.isAlive || creature.id === creatureId) {
                continue;
            }

            if (creature.tileX === tileX && creature.tileY === tileY) {
                return false;
            }
        }

        return true;
    }

    private canPlayerMoveTo(
        playerSessionId: string,
        tileX: number,
        tileY: number
    ): boolean {
        if (!isWalkableTile(tileX, tileY)) {
            return false;
        }

        for (const [sessionId, player] of this.state.players.entries()) {
            if (sessionId === playerSessionId) {
                continue;
            }

            if (player.tileX === tileX && player.tileY === tileY) {
                return false;
            }
        }

        for (const creature of this.creatures.values()) {
            if (!creature.isAlive) {
                continue;
            }

            if (creature.tileX === tileX && creature.tileY === tileY) {
                return false;
            }
        }

        return true;
    }

    private killCreature(creature: ServerCreatureState): void {
        if (!creature.isAlive) {
            return;
        }

        creature.isAlive = false;
        creature.currentHealth = 0;

        const killedPayload: CreatureKilledMessage = {
            creatureId: creature.id
        };

        this.broadcast('creature:killed', killedPayload);

        this.clock.setTimeout(() => {
            this.respawnCreature(creature.id);
        }, CREATURE_RESPAWN_DELAY_MS);
    }

    private respawnCreature(creatureId: string): void {
        const creature = this.creatures.get(creatureId);

        if (!creature) {
            return;
        }

        creature.tileX = creature.spawnTileX;
        creature.tileY = creature.spawnTileY;
        creature.currentHealth = creature.maxHealth;
        creature.isAlive = true;

        const payload: CreatureRespawnedMessage = {
            creatureId: creature.id,
            tileX: creature.tileX,
            tileY: creature.tileY,
            currentHealth: creature.currentHealth
        };

        this.broadcast('creature:respawned', payload);
    }

    private createCreatureSnapshot(): CreatureSnapshotMessage {
        const creatures: CreatureStateSnapshot[] = [];

        for (const creature of this.creatures.values()) {
            creatures.push({
                creatureId: creature.id,
                tileX: creature.tileX,
                tileY: creature.tileY,
                currentHealth: creature.currentHealth,
                isAlive: creature.isAlive
            });
        }

        return { creatures };
    }
}
