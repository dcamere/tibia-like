import { Client, Room } from '@colyseus/core';

import {
    type ChatMessagePayload,
    CLIENT_TO_SERVER_MESSAGE,
    DIRECTION_DELTAS,
    DIRECTIONS,
    isAttackInput,
    isChatSendInput,
    isMoveInput,
    isWorldJoinOptions,
    isWalkableTile,
    MAP_HEIGHT_IN_TILES,
    MAP_WIDTH_IN_TILES,
    SERVER_TO_CLIENT_MESSAGE,
    WORLD_ROOM_NAME,
    type CreatureId,
    type CreatureType,
    type TilePosition
} from '@tibia-like/shared';

import { CreatureState } from '../state/CreatureState';
import {
    getAccountCharacter,
    getSessionByToken,
    type AuthSession
} from '../auth/AuthService';
import { PlayerState } from '../state/PlayerState';
import { WorldState } from '../state/WorldState';

type RoomAuthData = AuthSession & {
    characterId: string;
    characterName: string;
};

const CHAT_MAX_LENGTH = 180;
const CHAT_COOLDOWN_MS = 250;
const CHAT_LOCAL_RANGE_IN_TILES = 7;

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

type CreatureSpawnDefinition = {
    id: CreatureId;
    type: CreatureType;
    name: string;
    maxHealth: number;
    spawnTile: TilePosition;
};

const CREATURE_SPAWNS: readonly CreatureSpawnDefinition[] = [
    {
        id: 'creature-rat-1',
        type: 'rat',
        name: 'Rat',
        maxHealth: 30,
        spawnTile: { tileX: 11, tileY: 11 }
    },
    {
        id: 'creature-rat-2',
        type: 'rat',
        name: 'Rat',
        maxHealth: 30,
        spawnTile: { tileX: 16, tileY: 3 }
    },
    {
        id: 'creature-rat-3',
        type: 'rat',
        name: 'Rat',
        maxHealth: 30,
        spawnTile: { tileX: 4, tileY: 12 }
    }
];

export { WORLD_ROOM_NAME };

export class WorldRoom extends Room {
    declare state: WorldState;

    onAuth(_client: Client, options: unknown): RoomAuthData {
        if (!isWorldJoinOptions(options)) {
            throw new Error('Missing authentication payload.');
        }

        const session = getSessionByToken(options.authToken);

        if (session === null) {
            throw new Error('Authentication required.');
        }

        const character = getAccountCharacter(
            session.accountId,
            options.characterId
        );

        if (character === null) {
            throw new Error('Invalid character selection.');
        }

        return {
            accountId: session.accountId,
            username: session.username,
            role: session.role,
            characterId: character.id,
            characterName: character.name
        };
    }

    private nextSpawnIndex = 0;
    private readonly lastMoveAtByPlayer = new Map<string, number>();
    private readonly lastAttackAtByPlayer = new Map<string, number>();
    private readonly lastChatAtByPlayer = new Map<string, number>();

    onCreate(): void {
        this.setState(new WorldState());
        this.initializeRoomCreatures();

        this.onMessage(CLIENT_TO_SERVER_MESSAGE.PLAYER_MOVE, (client, payload: unknown) => {
            this.handlePlayerMove(client, payload);
        });

        this.onMessage(CLIENT_TO_SERVER_MESSAGE.PLAYER_ATTACK, (client, payload: unknown) => {
            this.handlePlayerAttack(client, payload);
        });

        this.onMessage(CLIENT_TO_SERVER_MESSAGE.CHAT_SEND, (client, payload: unknown) => {
            try {
                this.handleChatSend(client, payload);
            } catch (error: unknown) {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'Unknown chat processing error.';

                console.error('[WorldRoom] chat handler failed', message);
                this.sendSystemMessage(client.sessionId, 'Error procesando el chat.');
            }
        });

        this.setSimulationInterval(() => {
            this.tickCreatures();
        }, CREATURE_MOVE_INTERVAL_MS);

        console.info(`[WorldRoom] created room ${this.roomId}`);
    }

    onJoin(client: Client, _options: unknown): void {
        const auth = client.auth as RoomAuthData | undefined;

        if (!auth) {
            throw new Error('Missing authenticated session.');
        }

        const spawnTile = this.getNextSpawnTile();

        const player = new PlayerState();
        player.id = client.sessionId;
        player.name = auth.characterName;
        player.tileX = spawnTile.tileX;
        player.tileY = spawnTile.tileY;

        this.state.players.set(client.sessionId, player);

        console.info(`[WorldRoom] ${client.sessionId} joined as ${player.name}`);
    }

    onLeave(client: Client): void {
        this.state.players.delete(client.sessionId);
        this.lastMoveAtByPlayer.delete(client.sessionId);
        this.lastAttackAtByPlayer.delete(client.sessionId);
        this.lastChatAtByPlayer.delete(client.sessionId);

        console.info(`[WorldRoom] ${client.sessionId} left`);
    }

    private handlePlayerMove(client: Client, payload: unknown): void {
        const player = this.state.players.get(client.sessionId);

        if (!player || !isMoveInput(payload)) {
            return;
        }

        const delta = DIRECTION_DELTAS[payload.direction];

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

        const target = this.state.creatures.get(payload.creatureId);

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

        target.health = Math.max(0, target.health - ATTACK_DAMAGE);

        if (target.health === 0) {
            this.killCreature(target);
        }
    }

    private handleChatSend(client: Client, payload: unknown): void {
        const sender = this.state.players.get(client.sessionId);

        if (!sender || !isChatSendInput(payload)) {
            return;
        }

        const now = Date.now();
        const lastChatAt = this.lastChatAtByPlayer.get(client.sessionId) ?? 0;

        if (now - lastChatAt < CHAT_COOLDOWN_MS) {
            return;
        }

        this.lastChatAtByPlayer.set(client.sessionId, now);

        const text = payload.text.trim().slice(0, CHAT_MAX_LENGTH);

        if (text.length === 0) {
            return;
        }

        if (text.startsWith('/')) {
            this.handleChatCommand(client, sender, text);
            return;
        }

        this.sendLocalChat(sender.id, sender.name, text);
    }

    private handleChatCommand(
        client: Client,
        sender: PlayerState,
        text: string
    ): void {
        const [command, ...parts] = text.split(' ');
        const commandName = command.toLowerCase();

        if (commandName === '/help') {
            this.sendSystemMessage(
                client.sessionId,
                'Comandos: /help, /w <mensaje>, /pm <nombre> <mensaje>, /announce <mensaje> (solo GM).'
            );
            return;
        }

        if (commandName === '/w') {
            const message = parts.join(' ').trim();

            if (!message) {
                this.sendSystemMessage(client.sessionId, 'Uso: /w <mensaje>');
                return;
            }

            this.broadcastChat({
                channel: 'world',
                from: sender.name,
                text: message
            });

            return;
        }

        if (commandName === '/pm') {
            const targetName = parts.shift()?.trim() ?? '';
            const message = parts.join(' ').trim();

            if (!targetName || !message) {
                this.sendSystemMessage(client.sessionId, 'Uso: /pm <nombre> <mensaje>');
                return;
            }

            const target = this.findPlayerByName(targetName);

            if (!target) {
                this.sendSystemMessage(client.sessionId, `No se encontro el jugador ${targetName}.`);
                return;
            }

            const chatPayload: ChatMessagePayload = {
                channel: 'private',
                from: sender.name,
                target: target.name,
                text: message
            };

            this.sendChatToSession(sender.id, chatPayload);

            if (target.id !== sender.id) {
                this.sendChatToSession(target.id, chatPayload);
            }

            return;
        }

        if (commandName === '/announce') {
            const auth = client.auth as RoomAuthData | undefined;

            if (!auth || auth.role !== 'gm') {
                this.sendSystemMessage(client.sessionId, 'Comando reservado para GM.');
                return;
            }

            const message = parts.join(' ').trim();

            if (!message) {
                this.sendSystemMessage(client.sessionId, 'Uso: /announce <mensaje>');
                return;
            }

            this.broadcastChat({
                channel: 'system',
                from: 'GM',
                text: message
            });

            return;
        }

        this.sendSystemMessage(client.sessionId, `Comando desconocido: ${commandName}`);
    }

    private sendLocalChat(
        senderSessionId: string,
        senderName: string,
        text: string
    ): void {
        const sender = this.state.players.get(senderSessionId);

        if (!sender) {
            return;
        }

        for (const [targetSessionId, target] of this.state.players.entries()) {
            const distanceX = Math.abs(sender.tileX - target.tileX);
            const distanceY = Math.abs(sender.tileY - target.tileY);
            const isInRange =
                Math.max(distanceX, distanceY) <= CHAT_LOCAL_RANGE_IN_TILES;

            if (!isInRange) {
                continue;
            }

            this.sendChatToSession(targetSessionId, {
                channel: 'local',
                from: senderName,
                text
            });
        }
    }

    private broadcastChat(payload: ChatMessagePayload): void {
        this.broadcast(SERVER_TO_CLIENT_MESSAGE.CHAT_MESSAGE, payload);
    }

    private sendChatToSession(
        sessionId: string,
        payload: ChatMessagePayload
    ): void {
        const client = this.getClientBySessionId(sessionId);

        if (!client) {
            return;
        }

        try {
            client.send(SERVER_TO_CLIENT_MESSAGE.CHAT_MESSAGE, payload);
        } catch (error: unknown) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Unknown send error.';

            console.error('[WorldRoom] failed to send chat message', message);
        }
    }

    private sendSystemMessage(sessionId: string, text: string): void {
        this.sendChatToSession(sessionId, {
            channel: 'system',
            from: 'System',
            text
        });
    }

    private findPlayerByName(name: string): PlayerState | null {
        const targetName = name.toLowerCase();

        for (const player of this.state.players.values()) {
            if (player.name.toLowerCase() === targetName) {
                return player;
            }
        }

        return null;
    }

    private getClientBySessionId(sessionId: string): Client | null {
        const clientsWithGetById = this.clients as {
            getById?: (id: string) => Client | undefined;
        };

        if (typeof clientsWithGetById.getById === 'function') {
            return clientsWithGetById.getById(sessionId) ?? null;
        }

        for (const client of this.clients) {
            if (client.sessionId === sessionId) {
                return client;
            }
        }

        return null;
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

        return !isSameTile && Math.max(distanceX, distanceY) <= ATTACK_RANGE_IN_TILES;
    }

    private getNextSpawnTile(): TilePosition {
        const spawnCount = SPAWN_TILES.length;

        for (let offset = 0; offset < spawnCount; offset += 1) {
            const candidate =
                SPAWN_TILES[(this.nextSpawnIndex + offset) % spawnCount] ??
                DEFAULT_SPAWN_TILE;

            if (!isWalkableTile(candidate.tileX, candidate.tileY)) {
                continue;
            }

            if (this.isPlayerOnTile(candidate.tileX, candidate.tileY)) {
                continue;
            }

            if (this.isCreatureOnTile(candidate.tileX, candidate.tileY, null)) {
                continue;
            }

            this.nextSpawnIndex = (this.nextSpawnIndex + offset + 1) % spawnCount;
            return candidate;
        }

        this.nextSpawnIndex = (this.nextSpawnIndex + 1) % spawnCount;
        return DEFAULT_SPAWN_TILE;
    }

    private initializeRoomCreatures(): void {
        for (const spawn of CREATURE_SPAWNS) {
            const creature = new CreatureState();
            const spawnTile = this.resolveInitialCreatureSpawn(spawn.spawnTile);

            creature.id = spawn.id;
            creature.type = spawn.type;
            creature.name = spawn.name;
            creature.tileX = spawnTile.tileX;
            creature.tileY = spawnTile.tileY;
            creature.spawnTileX = spawnTile.tileX;
            creature.spawnTileY = spawnTile.tileY;
            creature.health = spawn.maxHealth;
            creature.maxHealth = spawn.maxHealth;
            creature.isAlive = true;

            this.state.creatures.set(creature.id, creature);
        }
    }

    private resolveInitialCreatureSpawn(preferredSpawnTile: TilePosition): TilePosition {
        if (
            isWalkableTile(preferredSpawnTile.tileX, preferredSpawnTile.tileY) &&
            !this.isPlayerOnTile(preferredSpawnTile.tileX, preferredSpawnTile.tileY) &&
            !this.isCreatureOnTile(preferredSpawnTile.tileX, preferredSpawnTile.tileY, null)
        ) {
            return preferredSpawnTile;
        }

        for (let tileY = 0; tileY < MAP_HEIGHT_IN_TILES; tileY += 1) {
            for (let tileX = 0; tileX < MAP_WIDTH_IN_TILES; tileX += 1) {
                if (!isWalkableTile(tileX, tileY)) {
                    continue;
                }

                if (this.isPlayerOnTile(tileX, tileY)) {
                    continue;
                }

                if (this.isCreatureOnTile(tileX, tileY, null)) {
                    continue;
                }

                return { tileX, tileY };
            }
        }

        return preferredSpawnTile;
    }

    private tickCreatures(): void {
        for (const creature of this.state.creatures.values()) {
            if (!creature.isAlive) {
                continue;
            }

            const directions = [...DIRECTIONS];

            for (let index = directions.length - 1; index > 0; index -= 1) {
                const swapIndex = Math.floor(Math.random() * (index + 1));
                const current = directions[index];
                directions[index] = directions[swapIndex];
                directions[swapIndex] = current;
            }

            for (const direction of directions) {
                const delta = DIRECTION_DELTAS[direction];
                const nextTileX = creature.tileX + delta.deltaX;
                const nextTileY = creature.tileY + delta.deltaY;

                if (!this.canCreatureMoveTo(creature.id, nextTileX, nextTileY)) {
                    continue;
                }

                creature.tileX = nextTileX;
                creature.tileY = nextTileY;
                break;
            }
        }
    }

    private canCreatureMoveTo(
        creatureId: CreatureId,
        tileX: number,
        tileY: number
    ): boolean {
        if (!isWalkableTile(tileX, tileY)) {
            return false;
        }

        if (this.isPlayerOnTile(tileX, tileY)) {
            return false;
        }

        if (this.isCreatureOnTile(tileX, tileY, creatureId)) {
            return false;
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

        for (const creature of this.state.creatures.values()) {
            if (!creature.isAlive) {
                continue;
            }

            if (creature.tileX === tileX && creature.tileY === tileY) {
                return false;
            }
        }

        return true;
    }

    private killCreature(creature: CreatureState): void {
        if (!creature.isAlive) {
            return;
        }

        creature.isAlive = false;
        creature.health = 0;

        this.clock.setTimeout(() => {
            this.respawnCreature(creature.id);
        }, CREATURE_RESPAWN_DELAY_MS);
    }

    private respawnCreature(creatureId: CreatureId): void {
        const creature = this.state.creatures.get(creatureId);

        if (!creature) {
            return;
        }

        creature.tileX = creature.spawnTileX;
        creature.tileY = creature.spawnTileY;
        creature.health = creature.maxHealth;
        creature.isAlive = true;
    }

    private isPlayerOnTile(tileX: number, tileY: number): boolean {
        for (const player of this.state.players.values()) {
            if (player.tileX === tileX && player.tileY === tileY) {
                return true;
            }
        }

        return false;
    }

    private isCreatureOnTile(
        tileX: number,
        tileY: number,
        ignoredCreatureId: CreatureId | null
    ): boolean {
        for (const creature of this.state.creatures.values()) {
            if (!creature.isAlive) {
                continue;
            }

            if (ignoredCreatureId !== null && creature.id === ignoredCreatureId) {
                continue;
            }

            if (creature.tileX === tileX && creature.tileY === tileY) {
                return true;
            }
        }

        return false;
    }
}
