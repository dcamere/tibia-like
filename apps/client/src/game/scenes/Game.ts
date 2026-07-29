import { GameObjects, Scene } from 'phaser';
import { Client as ColyseusClient, Room } from 'colyseus.js';
import {
    CLIENT_TO_SERVER_MESSAGE,
    WORLD_ROOM_NAME,
    type AttackInput,
    type MoveInput
} from '@tibia-like/shared';

import { Creature } from '../entities/Creature';
import { Player } from '../entities/Player';
import { KeyboardController } from '../input/KeyboardController';
import { tileToWorldPosition } from '../world/coordinates';

import {
    MAP_HEIGHT_IN_TILES,
    MAP_WIDTH_IN_TILES,
    TILE_SIZE,
    TileType,
    WORLD_HEIGHT,
    WORLD_MAP,
    WORLD_WIDTH
} from '../world/WorldMap';

import { CollisionSystem } from '../systems/CollisionSystem';

import { UIScene } from './UIScene';

type WorldPlayerState = {
    id: string;
    name: string;
    tileX: number;
    tileY: number;
};

type WorldCreatureState = {
    id: string;
    type: string;
    name: string;
    tileX: number;
    tileY: number;
    spawnTileX: number;
    spawnTileY: number;
    health: number;
    maxHealth: number;
    isAlive: boolean;
};

type WorldRoomState = {
    players: unknown;
    creatures: unknown;
};

type RawMatchmakeResponse = {
    name: string;
    roomId: string;
    processId: string;
    sessionId: string;
    clients: number;
    maxClients: number;
    protocol?: string;
    publicAddress?: string;
};

type SeatReservationPayload = {
    room: {
        name: string;
        roomId: string;
        clients: number;
        maxClients: number;
        processId: string;
        publicAddress?: string;
    };
    sessionId: string;
    protocol?: string;
};

type NetworkPlayerVisual = {
    container: GameObjects.Container;
    body: GameObjects.Rectangle;
    nameLabel: GameObjects.Text;
    tileX: number;
    tileY: number;
};

export class Game extends Scene {
    private player!: Player;
    private readonly creatures = new Map<string, Creature>();

    private keyboardController!: KeyboardController;
    private collisionSystem!: CollisionSystem;

    private uiScene!: UIScene;

    private selectedCreature: Creature | null = null;

    private worldRoom: Room<WorldRoomState> | null = null;
    private localSessionId: string | null = null;
    private isConnectingToRoom = false;
    private localPlayerName = '';
    private hasAppliedServerSpawn = false;
    private isGameReady = false;

    private readonly networkPlayers = new Map<string, NetworkPlayerVisual>();
    private readonly knownCreatureAliveById = new Map<string, boolean>();

    private canMove = true;
    private canAttack = true;

    private readonly moveCooldownMs = 120;
    private readonly attackCooldownMs = 500;
    private readonly movementDurationMs = 100;

    constructor() {
        super('Game');
    }

    create(): void {
        void this.initializeGameSession();
    }

    update(): void {
        if (!this.isGameReady || !this.canMove) {
            return;
        }

        const direction = this.keyboardController.getRequestedDirection();

        if (direction === null) {
            return;
        }

        this.sendPlayerMove(direction);
        this.startMoveCooldown();
    }

    private createWorld(): void {
        this.cameras.main.setBackgroundColor('#16211b');

        for (let tileY = 0; tileY < MAP_HEIGHT_IN_TILES; tileY += 1) {
            for (let tileX = 0; tileX < MAP_WIDTH_IN_TILES; tileX += 1) {
                const tileType = WORLD_MAP[tileY][tileX];

                this.createGroundTile(tileX, tileY);
                this.createTileObject(tileX, tileY, tileType);
            }
        }

        this.add
            .rectangle(
                WORLD_WIDTH / 2,
                WORLD_HEIGHT / 2,
                WORLD_WIDTH,
                WORLD_HEIGHT
            )
            .setStrokeStyle(4, 0x111111);
    }

    private createGroundTile(tileX: number, tileY: number): void {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);
        const alternate = (tileX + tileY) % 2 === 0;

        this.add
            .rectangle(
                position.x,
                position.y,
                TILE_SIZE,
                TILE_SIZE,
                alternate ? 0x3f6946 : 0x426f49
            )
            .setStrokeStyle(1, 0x29472f, 0.45);
    }

    private createTileObject(tileX: number, tileY: number, tileType: TileType): void {
        switch (tileType) {
            case TileType.Wall:
                this.createWall(tileX, tileY);
                break;

            case TileType.Tree:
                this.createTree(tileX, tileY);
                break;

            case TileType.Rock:
                this.createRock(tileX, tileY);
                break;

            case TileType.Grass:
                break;

            default:
                console.warn(`Unknown tile type ${tileType} at ${tileX},${tileY}`);
        }
    }

    private createWall(tileX: number, tileY: number): void {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        this.add
            .rectangle(position.x, position.y, TILE_SIZE, TILE_SIZE, 0x806044)
            .setStrokeStyle(2, 0x3d291c)
            .setDepth(5);
    }

    private createTree(tileX: number, tileY: number): void {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        this.add.rectangle(position.x, position.y + 8, 8, 16, 0x68421f).setDepth(5);

        this.add
            .circle(position.x, position.y - 3, 13, 0x1f7a35)
            .setStrokeStyle(2, 0x124d22)
            .setDepth(6);
    }

    private createRock(tileX: number, tileY: number): void {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        this.add
            .ellipse(position.x, position.y, TILE_SIZE - 6, TILE_SIZE - 12, 0x7b7f84)
            .setStrokeStyle(2, 0x414449)
            .setDepth(5);
    }

    private createSystems(): void {
        this.collisionSystem = new CollisionSystem(
            WORLD_MAP,
            MAP_WIDTH_IN_TILES,
            MAP_HEIGHT_IN_TILES
        );
    }

    private createPlayer(name: string): void {
        const initialTileX = 5;
        const initialTileY = 5;

        if (!this.collisionSystem.isWalkable(initialTileX, initialTileY)) {
            throw new Error('The initial player position is invalid.');
        }

        this.player = new Player(this, {
            name,
            tileX: initialTileX,
            tileY: initialTileY,
            tileSize: TILE_SIZE,
            maxHealth: 100
        });
    }

    private createKeyboardControls(): void {
        this.keyboardController = new KeyboardController(this);
    }

    private createCombatControls(): void {
        const keyboard = this.input.keyboard;

        if (!keyboard) {
            throw new Error('Keyboard input is not available.');
        }

        keyboard.on('keydown-SPACE', () => {
            this.tryAttack();
        });

        keyboard.on('keydown-ESC', () => {
            this.deselectCreature();
        });

        this.input.on('pointerdown', (_pointer: unknown, currentlyOver: unknown[]) => {
            if (currentlyOver.length === 0) {
                this.deselectCreature();
            }
        });
    }

    private configureCamera(): void {
        this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        this.cameras.main.startFollow(this.player.gameObject, true, 0.15, 0.15);

        this.cameras.main.setZoom(1.5);
    }

    private launchUiScene(): void {
        this.scene.launch('UIScene');
        this.uiScene = this.scene.get('UIScene') as UIScene;
    }

    private startMoveCooldown(): void {
        this.canMove = false;

        this.time.delayedCall(this.moveCooldownMs, () => {
            this.canMove = true;
        });
    }

    private tryAttack(): void {
        if (!this.canAttack || !this.selectedCreature) {
            return;
        }

        if (!this.selectedCreature.isAlive) {
            return;
        }

        this.sendAttackIntent(this.selectedCreature.id);
        this.startAttackCooldown();
    }

    private startAttackCooldown(): void {
        this.canAttack = false;

        this.time.delayedCall(this.attackCooldownMs, () => {
            this.canAttack = true;
        });
    }

    private sendPlayerMove(direction: MoveInput['direction']): void {
        if (this.worldRoom === null || this.localSessionId === null) {
            return;
        }

        const payload: MoveInput = { direction };
        this.worldRoom.send(CLIENT_TO_SERVER_MESSAGE.PLAYER_MOVE, payload);
    }

    private sendAttackIntent(creatureId: string): void {
        if (this.worldRoom === null) {
            return;
        }

        const payload: AttackInput = {
            creatureId
        };

        this.worldRoom.send(CLIENT_TO_SERVER_MESSAGE.PLAYER_ATTACK, payload);
    }

    private selectCreature(creature: Creature): void {
        if (!creature.isAlive) {
            return;
        }

        if (this.selectedCreature === creature) {
            this.deselectCreature();
            return;
        }

        if (this.selectedCreature) {
            this.selectedCreature.setSelected(false);
        }

        this.selectedCreature = creature;
        creature.setSelected(true);
    }

    private deselectCreature(): void {
        if (!this.selectedCreature) {
            return;
        }

        this.selectedCreature.setSelected(false);
        this.selectedCreature = null;
    }

    private handleCreatureDeath(creature: Creature): void {
        if (this.selectedCreature === creature) {
            this.selectedCreature = null;
        }

        this.uiScene.logMessage(`${creature.name} ha muerto.`);
    }

    private handleCreatureRespawn(creature: Creature): void {
        this.uiScene.logMessage(`${creature.name} ha reaparecido.`);
    }

    private findCreatureById(id: string): Creature | null {
        return this.creatures.get(id) ?? null;
    }

    private syncCreatures(rawCreatures: unknown): void {
        const seenIds = new Set<string>();

        for (const creatureState of this.extractCreatures(rawCreatures)) {
            seenIds.add(creatureState.id);
            this.upsertCreatureFromServer(creatureState);
        }

        for (const [id, creature] of this.creatures.entries()) {
            if (seenIds.has(id)) {
                continue;
            }

            if (this.selectedCreature === creature) {
                this.selectedCreature = null;
            }

            creature.destroy();
            this.creatures.delete(id);
            this.knownCreatureAliveById.delete(id);
        }
    }

    private upsertCreatureFromServer(creatureState: WorldCreatureState): void {
        const existing = this.findCreatureById(creatureState.id);

        if (existing === null) {
            const creature = new Creature(this, {
                id: creatureState.id,
                name: creatureState.name,
                tileX: creatureState.tileX,
                tileY: creatureState.tileY,
                tileSize: TILE_SIZE,
                maxHealth: creatureState.maxHealth
            });

            creature.onClick(() => {
                this.selectCreature(creature);
            });

            creature.syncFromServer(
                {
                    tileX: creatureState.tileX,
                    tileY: creatureState.tileY,
                    currentHealth: creatureState.health,
                    isAlive: creatureState.isAlive
                },
                0
            );

            this.creatures.set(creature.id, creature);
            this.knownCreatureAliveById.set(creature.id, creatureState.isAlive);
            return;
        }

        const previousHealth = existing.currentHealth;
        const previousAlive = this.knownCreatureAliveById.get(existing.id);

        const hasMoved =
            existing.tileX !== creatureState.tileX ||
            existing.tileY !== creatureState.tileY;

        existing.syncFromServer(
            {
                tileX: creatureState.tileX,
                tileY: creatureState.tileY,
                currentHealth: creatureState.health,
                isAlive: creatureState.isAlive
            },
            creatureState.isAlive && hasMoved ? this.movementDurationMs : 0
        );

        if (creatureState.isAlive && previousHealth > creatureState.health) {
            this.showDamageText(existing, previousHealth - creatureState.health);
        }

        if (previousAlive === true && creatureState.isAlive === false) {
            this.handleCreatureDeath(existing);
        }

        if (previousAlive === false && creatureState.isAlive === true) {
            this.handleCreatureRespawn(existing);
        }

        this.knownCreatureAliveById.set(existing.id, creatureState.isAlive);
    }

    private extractCreatures(rawCreatures: unknown): WorldCreatureState[] {
        if (!this.isRecord(rawCreatures)) {
            return [];
        }

        const mapLike = rawCreatures as {
            entries?: () => IterableIterator<[string, unknown]>;
        };

        const creatures: WorldCreatureState[] = [];

        if (typeof mapLike.entries === 'function') {
            for (const [_id, rawCreature] of mapLike.entries()) {
                const creature = this.parseWorldCreatureState(rawCreature);

                if (creature !== null) {
                    creatures.push(creature);
                }
            }

            return creatures;
        }

        for (const [, rawCreature] of Object.entries(rawCreatures)) {
            const creature = this.parseWorldCreatureState(rawCreature);

            if (creature !== null) {
                creatures.push(creature);
            }
        }

        return creatures;
    }

    private parseWorldCreatureState(rawCreature: unknown): WorldCreatureState | null {
        if (!this.isRecord(rawCreature)) {
            return null;
        }

        const {
            id,
            type,
            name,
            tileX,
            tileY,
            spawnTileX,
            spawnTileY,
            health,
            maxHealth,
            isAlive
        } = rawCreature;

        if (
            typeof id !== 'string' ||
            typeof type !== 'string' ||
            typeof name !== 'string' ||
            typeof tileX !== 'number' ||
            typeof tileY !== 'number' ||
            typeof spawnTileX !== 'number' ||
            typeof spawnTileY !== 'number' ||
            typeof health !== 'number' ||
            typeof maxHealth !== 'number' ||
            typeof isAlive !== 'boolean'
        ) {
            return null;
        }

        if (
            !Number.isFinite(tileX) ||
            !Number.isFinite(tileY) ||
            !Number.isFinite(spawnTileX) ||
            !Number.isFinite(spawnTileY) ||
            !Number.isFinite(health) ||
            !Number.isFinite(maxHealth)
        ) {
            return null;
        }

        return {
            id,
            type,
            name,
            tileX,
            tileY,
            spawnTileX,
            spawnTileY,
            health,
            maxHealth,
            isAlive
        };
    }

    private showDamageText(creature: Creature, damage: number): void {
        const position = creature.getWorldPosition();

        const damageText = this.add
            .text(position.x, position.y - 30, `-${damage}`, {
                fontFamily: 'Arial',
                fontSize: '14px',
                color: '#ff6b6b',
                stroke: '#000000',
                strokeThickness: 3
            })
            .setOrigin(0.5)
            .setDepth(20);

        this.tweens.add({
            targets: damageText,
            y: position.y - 50,
            alpha: 0,
            duration: 600,
            ease: 'Cubic.Out',
            onComplete: () => {
                damageText.destroy();
            }
        });
    }

    private async connectToWorldRoom(): Promise<void> {
        if (this.isConnectingToRoom || this.worldRoom !== null) {
            return;
        }

        this.isConnectingToRoom = true;

        try {
            const endpoint = this.resolveServerEndpoint();
            const client = new ColyseusClient(endpoint);

            const room = await this.joinWorldRoom(client, endpoint);

            this.worldRoom = room;
            this.localSessionId = room.sessionId;

            this.uiScene.logMessage('Conectado al servidor multiplayer.');

            room.onStateChange((state) => {
                this.syncNetworkPlayers(state);
                this.syncCreatures(state.creatures);
            });

            room.onLeave((code) => {
                this.uiScene.logMessage(`Conexión cerrada (code ${code}).`);

                this.worldRoom = null;
                this.localSessionId = null;
                this.hasAppliedServerSpawn = false;
                this.clearNetworkPlayers();
                this.clearCreatures();
            });

            room.onError((code, message) => {
                this.uiScene.logMessage(`Error de red (${code}): ${message}`);
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';

            this.uiScene.logMessage(`No se pudo conectar al servidor: ${message}`);

            console.error('Failed to connect to world room.', error);
        } finally {
            this.isConnectingToRoom = false;
        }
    }

    private async leaveWorldRoom(): Promise<void> {
        if (this.worldRoom === null) {
            this.clearNetworkPlayers();
            this.clearCreatures();
            return;
        }

        try {
            await this.worldRoom.leave();
        } catch (error: unknown) {
            console.error('Failed to leave world room cleanly.', error);
        } finally {
            this.worldRoom = null;
            this.localSessionId = null;
            this.hasAppliedServerSpawn = false;
            this.clearNetworkPlayers();
            this.clearCreatures();
        }
    }

    private resolveServerEndpoint(): string {
        const configuredUrl = import.meta.env.VITE_SERVER_URL;

        if (typeof configuredUrl === 'string' && configuredUrl.trim().length > 0) {
            return configuredUrl;
        }

        const protocol = window.location.protocol === 'https:' ? 'https' : 'http';

        return `${protocol}://${window.location.hostname}:2567`;
    }

    private async joinWorldRoom(
        client: ColyseusClient,
        endpoint: string
    ): Promise<Room<WorldRoomState>> {
        const normalizedEndpoint = endpoint.endsWith('/')
            ? endpoint.slice(0, -1)
            : endpoint;

        const response = await fetch(
            `${normalizedEndpoint}/matchmake/joinOrCreate/${WORLD_ROOM_NAME}`,
            {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: this.localPlayerName
            })
        }
        );

        if (!response.ok) {
            throw new Error(`Matchmaking failed with status ${response.status}.`);
        }

        const payload: unknown = await response.json();
        const raw = this.parseMatchmakeResponse(payload);

        if (raw === null) {
            throw new Error('Invalid matchmake response payload.');
        }

        const seatReservation: SeatReservationPayload = {
            room: {
                name: raw.name,
                roomId: raw.roomId,
                clients: raw.clients,
                maxClients: raw.maxClients,
                processId: raw.processId,
                publicAddress: raw.publicAddress
            },
            sessionId: raw.sessionId,
            protocol: raw.protocol
        };

        return client.consumeSeatReservation<WorldRoomState>(seatReservation);
    }

    private parseMatchmakeResponse(payload: unknown): RawMatchmakeResponse | null {
        if (!this.isRecord(payload)) {
            return null;
        }

        const { sessionId, protocol } = payload;

        const roomSource = this.isRecord(payload.room) ? payload.room : payload;

        const { name, roomId, processId, publicAddress, clients, maxClients } = roomSource;

        if (
            typeof name !== 'string' ||
            typeof roomId !== 'string' ||
            typeof processId !== 'string' ||
            typeof sessionId !== 'string'
        ) {
            return null;
        }

        if (protocol !== undefined && typeof protocol !== 'string') {
            return null;
        }

        if (publicAddress !== undefined && typeof publicAddress !== 'string') {
            return null;
        }

        const normalizedClients =
            typeof clients === 'number' && Number.isFinite(clients) ? clients : 0;

        const normalizedMaxClients =
            typeof maxClients === 'number' && Number.isFinite(maxClients) ? maxClients : 0;

        return {
            name,
            roomId,
            processId,
            sessionId,
            clients: normalizedClients,
            maxClients: normalizedMaxClients,
            protocol,
            publicAddress
        };
    }

    private syncNetworkPlayers(state: WorldRoomState): void {
        const seenSessionIds = new Set<string>();

        for (const [sessionId, playerState] of this.extractPlayers(state.players)) {
            seenSessionIds.add(sessionId);
            this.upsertNetworkPlayer(sessionId, playerState);
        }

        for (const [sessionId, visual] of this.networkPlayers) {
            if (seenSessionIds.has(sessionId)) {
                continue;
            }

            visual.container.destroy();
            this.networkPlayers.delete(sessionId);
        }
    }

    private extractPlayers(rawPlayers: unknown): Array<[string, WorldPlayerState]> {
        if (!this.isRecord(rawPlayers)) {
            return [];
        }

        const playersFromEntries: Array<[string, WorldPlayerState]> = [];
        const mapLike = rawPlayers as {
            entries?: () => IterableIterator<[string, unknown]>;
        };

        if (typeof mapLike.entries === 'function') {
            for (const [sessionId, rawPlayer] of mapLike.entries()) {
                const player = this.parseWorldPlayerState(rawPlayer);

                if (player !== null) {
                    playersFromEntries.push([sessionId, player]);
                }
            }

            return playersFromEntries;
        }

        const playersFromObject: Array<[string, WorldPlayerState]> = [];

        for (const [sessionId, rawPlayer] of Object.entries(rawPlayers)) {
            const player = this.parseWorldPlayerState(rawPlayer);

            if (player !== null) {
                playersFromObject.push([sessionId, player]);
            }
        }

        return playersFromObject;
    }

    private parseWorldPlayerState(rawPlayer: unknown): WorldPlayerState | null {
        if (!this.isRecord(rawPlayer)) {
            return null;
        }

        const { id, name, tileX, tileY } = rawPlayer;

        if (
            typeof id !== 'string' ||
            typeof name !== 'string' ||
            typeof tileX !== 'number' ||
            typeof tileY !== 'number'
        ) {
            return null;
        }

        return {
            id,
            name,
            tileX,
            tileY
        };
    }

    private upsertNetworkPlayer(sessionId: string, playerState: WorldPlayerState): void {
        const isLocalPlayer = sessionId === this.localSessionId;

        if (isLocalPlayer) {
            this.syncLocalPlayerFromServer(playerState);

            const localVisual = this.networkPlayers.get(sessionId);

            if (localVisual) {
                localVisual.container.destroy();
                this.networkPlayers.delete(sessionId);
            }

            return;
        }

        let visual = this.networkPlayers.get(sessionId);

        if (!visual) {
            visual = this.createNetworkPlayerVisual(isLocalPlayer);
            this.networkPlayers.set(sessionId, visual);
        }

        const position = tileToWorldPosition(playerState.tileX, playerState.tileY, TILE_SIZE);

        if (visual.tileX !== playerState.tileX || visual.tileY !== playerState.tileY) {
            this.tweens.killTweensOf(visual.container);

            this.tweens.add({
                targets: visual.container,
                x: position.x,
                y: position.y,
                duration: this.movementDurationMs,
                ease: 'Linear'
            });
        }

        visual.tileX = playerState.tileX;
        visual.tileY = playerState.tileY;
        visual.body.setFillStyle(isLocalPlayer ? 0x22d3ee : 0xf97316);
        visual.nameLabel.setText(playerState.name);
    }

    private syncLocalPlayerFromServer(playerState: WorldPlayerState): void {
        if (!this.hasAppliedServerSpawn) {
            this.player.moveTo(playerState.tileX, playerState.tileY, 0);
            this.hasAppliedServerSpawn = true;
            return;
        }

        const moved =
            this.player.tileX !== playerState.tileX ||
            this.player.tileY !== playerState.tileY;

        if (!moved) {
            return;
        }

        this.player.moveTo(playerState.tileX, playerState.tileY, this.movementDurationMs);
    }

    private async initializeGameSession(): Promise<void> {
        this.localPlayerName = await this.askPlayerName();

        this.createSystems();
        this.createWorld();
        this.createPlayer(this.localPlayerName);
        this.createKeyboardControls();
        this.createCombatControls();
        this.configureCamera();
        this.launchUiScene();

        this.events.once('shutdown', () => {
            void this.leaveWorldRoom();
        });

        this.isGameReady = true;

        void this.connectToWorldRoom();
    }

    private askPlayerName(): Promise<string> {
        const fallbackName = `Player-${Math.random().toString(36).slice(2, 6)}`;

        return new Promise((resolve) => {
            const root = document.createElement('div');
            root.style.position = 'fixed';
            root.style.inset = '0';
            root.style.background = 'rgba(0, 0, 0, 0.65)';
            root.style.display = 'flex';
            root.style.alignItems = 'center';
            root.style.justifyContent = 'center';
            root.style.zIndex = '9999';

            const card = document.createElement('div');
            card.style.width = 'min(420px, 92vw)';
            card.style.padding = '24px';
            card.style.borderRadius = '12px';
            card.style.background = '#111827';
            card.style.border = '1px solid #334155';
            card.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.45)';

            const title = document.createElement('h2');
            title.textContent = 'Elige tu nombre';
            title.style.margin = '0 0 8px';
            title.style.color = '#f8fafc';
            title.style.fontFamily = 'Arial, sans-serif';
            title.style.fontSize = '22px';

            const subtitle = document.createElement('p');
            subtitle.textContent = 'Ingresa tu nombre antes de unirte al mundo.';
            subtitle.style.margin = '0 0 16px';
            subtitle.style.color = '#cbd5e1';
            subtitle.style.fontFamily = 'Arial, sans-serif';
            subtitle.style.fontSize = '14px';

            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 20;
            input.value = fallbackName;
            input.style.width = '100%';
            input.style.padding = '10px 12px';
            input.style.borderRadius = '8px';
            input.style.border = '1px solid #475569';
            input.style.background = '#0f172a';
            input.style.color = '#f8fafc';
            input.style.fontSize = '14px';
            input.style.fontFamily = 'Arial, sans-serif';

            const button = document.createElement('button');
            button.textContent = 'Entrar';
            button.style.marginTop = '14px';
            button.style.width = '100%';
            button.style.padding = '10px 12px';
            button.style.border = 'none';
            button.style.borderRadius = '8px';
            button.style.background = '#0ea5e9';
            button.style.color = '#082f49';
            button.style.fontWeight = '700';
            button.style.cursor = 'pointer';

            const submit = (): void => {
                const chosenName = input.value.trim().slice(0, 20);
                const finalName = chosenName.length > 0 ? chosenName : fallbackName;

                root.remove();
                resolve(finalName);
            };

            button.addEventListener('click', submit);

            input.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') {
                    return;
                }

                event.preventDefault();
                submit();
            });

            card.appendChild(title);
            card.appendChild(subtitle);
            card.appendChild(input);
            card.appendChild(button);

            root.appendChild(card);
            document.body.appendChild(root);

            input.focus();
            input.select();
        });
    }

    private createNetworkPlayerVisual(isLocalPlayer: boolean): NetworkPlayerVisual {
        const body = this.add
            .rectangle(0, 0, TILE_SIZE - 10, TILE_SIZE - 10, isLocalPlayer ? 0x22d3ee : 0xf97316)
            .setStrokeStyle(2, 0x111111);

        const nameLabel = this.add
            .text(0, -24, '', {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3
            })
            .setOrigin(0.5);

        const container = this.add.container(0, 0, [body, nameLabel]);

        container.setDepth(12);

        return {
            container,
            body,
            nameLabel,
            tileX: Number.NaN,
            tileY: Number.NaN
        };
    }

    private clearNetworkPlayers(): void {
        for (const visual of this.networkPlayers.values()) {
            visual.container.destroy();
        }

        this.networkPlayers.clear();
    }

    private clearCreatures(): void {
        if (this.selectedCreature) {
            this.selectedCreature.setSelected(false);
            this.selectedCreature = null;
        }

        for (const creature of this.creatures.values()) {
            creature.destroy();
        }

        this.creatures.clear();
        this.knownCreatureAliveById.clear();
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null;
    }
}
