import { GameObjects, Scene } from 'phaser';
import { Client as ColyseusClient, Room } from 'colyseus.js';
import {
    type AuthCharactersResponse,
    type AuthCreateCharacterResponse,
    type AuthLoginResponse,
    type AuthRegisterResponse,
    type ChatSendInput,
    type CharacterSummary,
    CLIENT_TO_SERVER_MESSAGE,
    type Direction,
    isChatMessagePayload,
    isChatSendInput,
    SERVER_TO_CLIENT_MESSAGE,
    WORLD_ROOM_NAME,
    type AttackInput,
    type MoveInput
} from '@tibia-like/shared';

import { Creature } from '../entities/Creature';
import { Player } from '../entities/Player';
import { KeyboardController } from '../input/KeyboardController';
import {
    ensureMedievalSpriteTextures,
    getMedievalPlayerTexture,
    preloadMedievalSpriteSheets
} from '../rendering/MedievalSprites';
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

type AuthMode = 'login' | 'register';

type AuthSessionResult = {
    playerName: string;
    characterId: string;
    token: string;
};

type NetworkPlayerVisual = {
    container: GameObjects.Container;
    body: GameObjects.Image;
    nameLabel: GameObjects.Text;
    tileX: number;
    tileY: number;
    facingDirection: Direction;
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
    private localCharacterId: string | null = null;
    private authToken: string | null = null;
    private hasAppliedServerSpawn = false;
    private isGameReady = false;
    private chatInputElement: HTMLInputElement | null = null;

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

    preload(): void {
        preloadMedievalSpriteSheets(this);
    }

    update(): void {
        if (!this.isGameReady || !this.canMove) {
            return;
        }

        if (this.isChatInputFocused()) {
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
            if (this.isChatInputFocused()) {
                return;
            }

            this.tryAttack();
        });

        keyboard.on('keydown-ESC', () => {
            if (this.isChatInputFocused()) {
                return;
            }

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

            room.onMessage(SERVER_TO_CLIENT_MESSAGE.CHAT_MESSAGE, (message: unknown) => {
                this.handleChatMessage(message);
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

    private handleChatMessage(message: unknown): void {
        if (!isChatMessagePayload(message)) {
            return;
        }

        if (message.channel === 'private' && message.target) {
            this.uiScene.logChatMessage(`[PM] ${message.from} -> ${message.target}: ${message.text}`);
            return;
        }

        if (message.channel === 'world') {
            this.uiScene.logChatMessage(`[Mundo] ${message.from}: ${message.text}`);
            return;
        }

        if (message.channel === 'system') {
            this.uiScene.logChatMessage(`[Sistema] ${message.text}`);
            return;
        }

        this.uiScene.logChatMessage(`[Local] ${message.from}: ${message.text}`);
    }

    private createChatInputOverlay(): void {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'fixed';
        wrapper.style.left = '50%';
        wrapper.style.bottom = '12px';
        wrapper.style.transform = 'translateX(-50%)';
        wrapper.style.zIndex = '9998';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Chat: local por defecto. Comandos: /help /w /pm /announce';
        input.maxLength = 180;
        input.style.width = 'min(780px, 92vw)';
        input.style.padding = '10px 12px';
        input.style.borderRadius = '8px';
        input.style.border = '1px solid #334155';
        input.style.background = 'rgba(8, 18, 35, 0.92)';
        input.style.color = '#f8fafc';
        input.style.fontFamily = 'Georgia, serif';
        input.style.fontSize = '14px';
        input.style.display = 'none';

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                input.value = '';
                input.blur();
                input.style.display = 'none';
                return;
            }

            if (event.key !== 'Enter') {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const text = input.value.trim();

            if (text.length === 0) {
                input.blur();
                input.style.display = 'none';
                return;
            }

            this.sendChatMessage(text);
            input.value = '';
            input.blur();
            input.style.display = 'none';
        });

        wrapper.appendChild(input);
        document.body.appendChild(wrapper);

        this.chatInputElement = input;

        const keyboard = this.input.keyboard;

        if (!keyboard) {
            return;
        }

        keyboard.on('keydown-ENTER', () => {
            if (!this.chatInputElement) {
                return;
            }

            if (this.isChatInputFocused()) {
                return;
            }

            if (this.chatInputElement.style.display === 'none') {
                this.chatInputElement.style.display = 'block';
                this.chatInputElement.focus();
                return;
            }

            this.chatInputElement.blur();
            this.chatInputElement.style.display = 'none';
        });
    }

    private sendChatMessage(text: string): void {
        if (this.worldRoom === null) {
            this.uiScene.logChatMessage('[Sistema] No hay conexion con la room.');
            return;
        }

        const payload: ChatSendInput = { text };

        if (!isChatSendInput(payload)) {
            return;
        }

        this.worldRoom.send(CLIENT_TO_SERVER_MESSAGE.CHAT_SEND, payload);
    }

    private isChatInputFocused(): boolean {
        if (!this.chatInputElement) {
            return false;
        }

        return document.activeElement === this.chatInputElement;
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
        if (this.authToken === null || this.localCharacterId === null) {
            throw new Error('Missing auth token.');
        }

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
                authToken: this.authToken,
                characterId: this.localCharacterId
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
        const hadKnownTile =
            Number.isFinite(visual.tileX) &&
            Number.isFinite(visual.tileY);

        const moved =
            visual.tileX !== playerState.tileX ||
            visual.tileY !== playerState.tileY;

        if (!hadKnownTile) {
            visual.tileX = playerState.tileX;
            visual.tileY = playerState.tileY;
            visual.container.setPosition(position.x, position.y);
            visual.nameLabel.setText(playerState.name);
            const idleTexture = getMedievalPlayerTexture(
                this,
                visual.facingDirection,
                false
            );

            visual.body.setTexture(idleTexture.textureKey, idleTexture.frame);
            return;
        }

        if (moved) {
            visual.facingDirection = this.resolveFacingDirection(
                visual.tileX,
                visual.tileY,
                playerState.tileX,
                playerState.tileY,
                visual.facingDirection
            );

            const walkTexture = getMedievalPlayerTexture(
                this,
                visual.facingDirection,
                true
            );

            visual.body.setTexture(walkTexture.textureKey, walkTexture.frame);

            this.tweens.killTweensOf(visual.container);

            this.tweens.add({
                targets: visual.container,
                x: position.x,
                y: position.y,
                duration: this.movementDurationMs,
                ease: 'Linear',
                onComplete: () => {
                    const idleTexture = getMedievalPlayerTexture(
                        this,
                        visual.facingDirection,
                        false
                    );

                    visual.body.setTexture(idleTexture.textureKey, idleTexture.frame);
                }
            });
        } else {
            const idleTexture = getMedievalPlayerTexture(
                this,
                visual.facingDirection,
                false
            );

            visual.body.setTexture(idleTexture.textureKey, idleTexture.frame);
        }

        visual.tileX = playerState.tileX;
        visual.tileY = playerState.tileY;
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
        const authSession = await this.askAuthSession();

        this.localPlayerName = authSession.playerName;
        this.localCharacterId = authSession.characterId;
        this.authToken = authSession.token;

        this.createSystems();
        this.createWorld();
        this.createPlayer(this.localPlayerName);
        this.createKeyboardControls();
        this.createCombatControls();
        this.configureCamera();
        this.launchUiScene();
        this.createChatInputOverlay();

        this.events.once('shutdown', () => {
            this.chatInputElement?.parentElement?.remove();
            this.chatInputElement = null;
            void this.leaveWorldRoom();
        });

        this.isGameReady = true;

        void this.connectToWorldRoom();
    }

    private async askAuthSession(): Promise<AuthSessionResult> {
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
            title.textContent = 'Acceso al Reino';
            title.style.margin = '0 0 8px';
            title.style.color = '#f8fafc';
            title.style.fontFamily = 'Arial, sans-serif';
            title.style.fontSize = '22px';

            const subtitle = document.createElement('p');
            subtitle.textContent = 'Registra tu cuenta con personaje o inicia sesión para elegir uno.';
            subtitle.style.margin = '0 0 16px';
            subtitle.style.color = '#cbd5e1';
            subtitle.style.fontFamily = 'Arial, sans-serif';
            subtitle.style.fontSize = '14px';

            let mode: AuthMode = 'login';
            let loginResponse: AuthLoginResponse | null = null;

            const createInput = (
                placeholder: string,
                value = '',
                type = 'text'
            ): HTMLInputElement => {
                const input = document.createElement('input');
                input.type = type;
                input.placeholder = placeholder;
                input.value = value;
                input.style.width = '100%';
                input.style.padding = '10px 12px';
                input.style.borderRadius = '8px';
                input.style.border = '1px solid #475569';
                input.style.background = '#0f172a';
                input.style.color = '#f8fafc';
                input.style.fontSize = '14px';
                input.style.fontFamily = 'Arial, sans-serif';
                input.style.marginBottom = '10px';
                return input;
            };

            const modeToggle = document.createElement('button');
            modeToggle.type = 'button';
            modeToggle.textContent = 'Cambiar a registro';
            modeToggle.style.marginBottom = '10px';
            modeToggle.style.width = '100%';
            modeToggle.style.padding = '8px 12px';
            modeToggle.style.border = '1px solid #475569';
            modeToggle.style.borderRadius = '8px';
            modeToggle.style.background = '#1e293b';
            modeToggle.style.color = '#e2e8f0';
            modeToggle.style.cursor = 'pointer';

            const usernameInput = createInput('Usuario (a-z, 0-9, _)', '');
            const passwordInput = createInput('Contraseña', '', 'password');
            const characterNameInput = createInput('Nombre de personaje', '');

            const characterSelect = document.createElement('select');
            characterSelect.style.width = '100%';
            characterSelect.style.padding = '10px 12px';
            characterSelect.style.borderRadius = '8px';
            characterSelect.style.border = '1px solid #475569';
            characterSelect.style.background = '#0f172a';
            characterSelect.style.color = '#f8fafc';
            characterSelect.style.fontSize = '14px';
            characterSelect.style.fontFamily = 'Arial, sans-serif';
            characterSelect.style.marginBottom = '10px';
            characterSelect.style.display = 'none';

            const createExtraCharacterInput = createInput(
                'Nuevo personaje para esta cuenta',
                ''
            );
            createExtraCharacterInput.style.display = 'none';

            const createExtraCharacterButton = document.createElement('button');
            createExtraCharacterButton.type = 'button';
            createExtraCharacterButton.textContent = 'Crear personaje';
            createExtraCharacterButton.style.width = '100%';
            createExtraCharacterButton.style.padding = '8px 12px';
            createExtraCharacterButton.style.border = '1px solid #475569';
            createExtraCharacterButton.style.borderRadius = '8px';
            createExtraCharacterButton.style.background = '#1e293b';
            createExtraCharacterButton.style.color = '#e2e8f0';
            createExtraCharacterButton.style.cursor = 'pointer';
            createExtraCharacterButton.style.marginBottom = '10px';
            createExtraCharacterButton.style.display = 'none';

            const status = document.createElement('p');
            status.style.margin = '0 0 10px';
            status.style.color = '#fda4af';
            status.style.fontFamily = 'Arial, sans-serif';
            status.style.fontSize = '13px';
            status.style.minHeight = '18px';

            const button = document.createElement('button');
            button.textContent = 'Iniciar sesión';
            button.style.marginTop = '14px';
            button.style.width = '100%';
            button.style.padding = '10px 12px';
            button.style.border = 'none';
            button.style.borderRadius = '8px';
            button.style.background = '#0ea5e9';
            button.style.color = '#082f49';
            button.style.fontWeight = '700';
            button.style.cursor = 'pointer';

            const refreshModeUi = (): void => {
                if (mode === 'login') {
                    button.textContent = loginResponse ? 'Entrar al mundo' : 'Iniciar sesión';
                    modeToggle.textContent = 'Cambiar a registro';
                    characterNameInput.style.display = 'none';
                    characterSelect.style.display = loginResponse ? 'block' : 'none';
                    createExtraCharacterInput.style.display =
                        loginResponse ? 'block' : 'none';
                    createExtraCharacterButton.style.display =
                        loginResponse ? 'block' : 'none';
                } else {
                    button.textContent = 'Crear cuenta';
                    modeToggle.textContent = 'Cambiar a login';
                    characterNameInput.style.display = 'block';
                    characterSelect.style.display = 'none';
                    createExtraCharacterInput.style.display = 'none';
                    createExtraCharacterButton.style.display = 'none';
                }
            };

            const clearLoginSelection = (): void => {
                loginResponse = null;
                characterSelect.innerHTML = '';
                refreshModeUi();
            };

            const renderCharacters = (characters: readonly CharacterSummary[]): void => {
                characterSelect.innerHTML = '';

                for (const character of characters) {
                    const option = document.createElement('option');
                    option.value = character.id;
                    option.textContent = character.name;
                    characterSelect.appendChild(option);
                }

                if (characterSelect.options.length > 0) {
                    characterSelect.selectedIndex = 0;
                }
            };

            const createCharacterFromLoginState = async (): Promise<void> => {
                if (loginResponse === null) {
                    return;
                }

                const characterName = createExtraCharacterInput.value
                    .trim()
                    .slice(0, 20);

                if (!characterName) {
                    status.style.color = '#fda4af';
                    status.textContent = 'Ingresa un nombre para el nuevo personaje.';
                    return;
                }

                createExtraCharacterButton.disabled = true;
                button.disabled = true;
                modeToggle.disabled = true;
                usernameInput.disabled = true;
                passwordInput.disabled = true;
                characterSelect.disabled = true;
                createExtraCharacterInput.disabled = true;
                status.style.color = '#cbd5e1';
                status.textContent = 'Creando personaje...';

                try {
                    const createdCharacter = await this.requestCreateCharacter(
                        loginResponse.token,
                        characterName
                    );

                    const refreshed = await this.requestCharacters(loginResponse.token);

                    loginResponse = {
                        ...loginResponse,
                        characters: refreshed
                    };

                    renderCharacters(loginResponse.characters);
                    characterSelect.value = createdCharacter.id;
                    createExtraCharacterInput.value = '';
                    status.style.color = '#86efac';
                    status.textContent = `Personaje ${createdCharacter.name} creado.`;
                } catch (error: unknown) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : 'No se pudo crear el personaje.';

                    status.style.color = '#fda4af';
                    status.textContent = message;
                } finally {
                    createExtraCharacterButton.disabled = false;
                    button.disabled = false;
                    modeToggle.disabled = false;
                    usernameInput.disabled = false;
                    passwordInput.disabled = false;
                    characterSelect.disabled = false;
                    createExtraCharacterInput.disabled = false;
                }
            };

            const submit = async (): Promise<void> => {
                const username = usernameInput.value.trim();
                const password = passwordInput.value;

                if (!username || !password) {
                    status.textContent = 'Usuario y contraseña son obligatorios.';
                    return;
                }

                if (mode === 'register') {
                    const characterName = characterNameInput.value.trim().slice(0, 20);

                    if (!characterName) {
                        status.textContent = 'El nombre de personaje es obligatorio para registrar.';
                        return;
                    }
                }

                button.disabled = true;
                modeToggle.disabled = true;
                usernameInput.disabled = true;
                passwordInput.disabled = true;
                characterNameInput.disabled = true;
                characterSelect.disabled = true;
                status.style.color = '#cbd5e1';
                status.textContent = 'Validando...';

                try {
                    if (mode === 'register') {
                        const characterName = characterNameInput.value.trim().slice(0, 20);

                        await this.requestRegister(username, password, characterName);

                        mode = 'login';
                        clearLoginSelection();
                        status.style.color = '#86efac';
                        status.textContent = 'Cuenta creada. Ahora inicia sesión para elegir personaje.';
                    } else if (loginResponse === null) {
                        const response = await this.requestLogin(username, password);

                        if (response.characters.length === 0) {
                            throw new Error('Esta cuenta no tiene personajes.');
                        }

                        loginResponse = response;
                        renderCharacters(response.characters);
                        status.style.color = '#93c5fd';
                        status.textContent = 'Elige un personaje del listado y pulsa Entrar al mundo.';
                        refreshModeUi();
                    } else {
                        const selectedId = characterSelect.value;
                        const selectedCharacter = loginResponse.characters.find(
                            (character) => character.id === selectedId
                        );

                        if (!selectedCharacter) {
                            throw new Error('Selecciona un personaje válido.');
                        }

                        root.remove();
                        resolve({
                            playerName: selectedCharacter.name,
                            characterId: selectedCharacter.id,
                            token: loginResponse.token
                        });
                    }
                } catch (error: unknown) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : 'Error de autenticación.';

                    status.style.color = '#fda4af';
                    status.textContent = message;
                } finally {
                    button.disabled = false;
                    modeToggle.disabled = false;
                    usernameInput.disabled = false;
                    passwordInput.disabled = false;
                    characterNameInput.disabled = false;
                    characterSelect.disabled = false;
                }
            };

            modeToggle.addEventListener('click', () => {
                mode = mode === 'login' ? 'register' : 'login';
                status.textContent = '';
                clearLoginSelection();
                refreshModeUi();
            });

            createExtraCharacterButton.addEventListener('click', () => {
                void createCharacterFromLoginState();
            });

            usernameInput.addEventListener('input', () => {
                if (mode === 'login') {
                    clearLoginSelection();
                }
            });

            passwordInput.addEventListener('input', () => {
                if (mode === 'login') {
                    clearLoginSelection();
                }
            });

            createExtraCharacterInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') {
                    return;
                }

                event.preventDefault();
                void createCharacterFromLoginState();
            });

            button.addEventListener('click', () => {
                void submit();
            });

            usernameInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') {
                    return;
                }

                event.preventDefault();
                void submit();
            });

            passwordInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') {
                    return;
                }

                event.preventDefault();
                void submit();
            });

            characterNameInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') {
                    return;
                }

                event.preventDefault();
                void submit();
            });

            card.appendChild(title);
            card.appendChild(subtitle);
            card.appendChild(modeToggle);
            card.appendChild(usernameInput);
            card.appendChild(passwordInput);
            card.appendChild(characterNameInput);
            card.appendChild(characterSelect);
            card.appendChild(createExtraCharacterInput);
            card.appendChild(createExtraCharacterButton);
            card.appendChild(status);
            card.appendChild(button);

            root.appendChild(card);
            document.body.appendChild(root);

            refreshModeUi();
            usernameInput.focus();
        });
    }

    private resolveAuthEndpoint(): string {
        const configuredUrl = import.meta.env.VITE_AUTH_URL;

        if (typeof configuredUrl === 'string' && configuredUrl.trim().length > 0) {
            return configuredUrl;
        }

        const protocol = window.location.protocol === 'https:' ? 'https' : 'http';

        return `${protocol}://${window.location.hostname}:3567`;
    }

    private async requestLogin(
        username: string,
        password: string
    ): Promise<AuthLoginResponse> {
        const endpoint = this.resolveAuthEndpoint();
        const normalizedEndpoint = endpoint.endsWith('/')
            ? endpoint.slice(0, -1)
            : endpoint;

        const response = await fetch(`${normalizedEndpoint}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
            const message =
                this.isRecord(payload) && typeof payload.error === 'string'
                    ? payload.error
                    : `Auth failed (${response.status}).`;

            throw new Error(message);
        }

        if (!this.isRecord(payload)) {
            throw new Error('Invalid login response.');
        }

        const { accountId, token, username: usernameFromServer, characters } = payload;

        if (
            typeof accountId !== 'string' ||
            typeof token !== 'string' ||
            typeof usernameFromServer !== 'string' ||
            !Array.isArray(characters)
        ) {
            throw new Error('Invalid login response payload.');
        }

        const parsedCharacters: CharacterSummary[] = [];

        for (const entry of characters) {
            if (!this.isRecord(entry)) {
                continue;
            }

            const id = entry.id;
            const name = entry.name;

            if (typeof id === 'string' && typeof name === 'string') {
                parsedCharacters.push({ id, name });
            }
        }

        return {
            accountId,
            token,
            username: usernameFromServer,
            characters: parsedCharacters
        };
    }

    private async requestRegister(
        username: string,
        password: string,
        characterName: string
    ): Promise<AuthRegisterResponse> {
        const endpoint = this.resolveAuthEndpoint();
        const normalizedEndpoint = endpoint.endsWith('/')
            ? endpoint.slice(0, -1)
            : endpoint;

        const response = await fetch(`${normalizedEndpoint}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({ username, password, characterName })
        });

        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
            const message =
                this.isRecord(payload) && typeof payload.error === 'string'
                    ? payload.error
                    : `Auth failed (${response.status}).`;

            throw new Error(message);
        }

        if (!this.isRecord(payload)) {
            throw new Error('Invalid register response.');
        }

        const { accountId, token, createdCharacter } = payload;

        if (
            typeof accountId !== 'string' ||
            typeof token !== 'string' ||
            !this.isRecord(createdCharacter)
        ) {
            throw new Error('Invalid register response payload.');
        }

        const usernameFromServer = payload.username;

        if (typeof usernameFromServer !== 'string') {
            throw new Error('Invalid register response username.');
        }

        const createdCharacterId = createdCharacter.id;
        const createdCharacterName = createdCharacter.name;

        if (
            typeof createdCharacterId !== 'string' ||
            typeof createdCharacterName !== 'string'
        ) {
            throw new Error('Invalid created character payload.');
        }

        return {
            accountId,
            token,
            username: usernameFromServer,
            createdCharacter: {
                id: createdCharacterId,
                name: createdCharacterName
            }
        };
    }

    private async requestCreateCharacter(
        authToken: string,
        characterName: string
    ): Promise<CharacterSummary> {
        const endpoint = this.resolveAuthEndpoint();
        const normalizedEndpoint = endpoint.endsWith('/')
            ? endpoint.slice(0, -1)
            : endpoint;

        const response = await fetch(`${normalizedEndpoint}/characters/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({ authToken, characterName })
        });

        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
            const message =
                this.isRecord(payload) && typeof payload.error === 'string'
                    ? payload.error
                    : `Create character failed (${response.status}).`;

            throw new Error(message);
        }

        if (!this.isRecord(payload)) {
            throw new Error('Invalid create character response.');
        }

        const { character } = payload;

        if (!this.isRecord(character)) {
            throw new Error('Invalid character payload.');
        }

        const characterId = character.id;
        const characterNameFromPayload = character.name;

        if (
            typeof characterId !== 'string' ||
            typeof characterNameFromPayload !== 'string'
        ) {
            throw new Error('Invalid created character shape.');
        }

        const result: AuthCreateCharacterResponse = {
            character: {
                id: characterId,
                name: characterNameFromPayload
            }
        };

        return result.character;
    }

    private async requestCharacters(
        authToken: string
    ): Promise<CharacterSummary[]> {
        const endpoint = this.resolveAuthEndpoint();
        const normalizedEndpoint = endpoint.endsWith('/')
            ? endpoint.slice(0, -1)
            : endpoint;

        const encodedToken = encodeURIComponent(authToken);
        const response = await fetch(
            `${normalizedEndpoint}/characters?token=${encodedToken}`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json'
                }
            }
        );

        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
            const message =
                this.isRecord(payload) && typeof payload.error === 'string'
                    ? payload.error
                    : `List characters failed (${response.status}).`;

            throw new Error(message);
        }

        if (!this.isRecord(payload) || !Array.isArray(payload.characters)) {
            throw new Error('Invalid character list response.');
        }

        const responseBody: AuthCharactersResponse = {
            characters: []
        };

        for (const entry of payload.characters) {
            if (!this.isRecord(entry)) {
                continue;
            }

            const id = entry.id;
            const name = entry.name;

            if (typeof id === 'string' && typeof name === 'string') {
                responseBody.characters.push({ id, name });
            }
        }

        return responseBody.characters;
    }

    private createNetworkPlayerVisual(isLocalPlayer: boolean): NetworkPlayerVisual {
        ensureMedievalSpriteTextures(this);

        const body = this.add
            .image(0, 1, getMedievalPlayerTexture(this, 'down', false).textureKey)
            .setDisplaySize(TILE_SIZE - 4, TILE_SIZE - 4);

        const initialTexture = getMedievalPlayerTexture(this, 'down', false);
        body.setTexture(initialTexture.textureKey, initialTexture.frame);

        if (!isLocalPlayer) {
            body.setTint(0xfff1d4);
        }

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
            tileY: Number.NaN,
            facingDirection: 'down'
        };
    }

    private resolveFacingDirection(
        fromTileX: number,
        fromTileY: number,
        toTileX: number,
        toTileY: number,
        fallback: Direction
    ): Direction {
        const deltaX = toTileX - fromTileX;
        const deltaY = toTileY - fromTileY;

        if (deltaX < 0) {
            return 'left';
        }

        if (deltaX > 0) {
            return 'right';
        }

        if (deltaY < 0) {
            return 'up';
        }

        if (deltaY > 0) {
            return 'down';
        }

        return fallback;
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
