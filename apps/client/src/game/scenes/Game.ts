import { GameObjects, Scene } from 'phaser';
import { Client as ColyseusClient, Room } from 'colyseus.js';
import {
    type AnnouncementPayload,
    type AuthCharactersResponse,
    type AuthCreateCharacterResponse,
    type AuthLoginResponse,
    type AuthRegisterResponse,
    type ChatSendInput,
    type CharacterSummary,
    CLIENT_TO_SERVER_MESSAGE,
    type DropItemInput,
    type Direction,
    type InventoryEntry,
    isAnnouncementPayload,
    isChatMessagePayload,
    isChatSendInput,
    isDropItemInput,
    isInventorySyncPayload,
    isPickupItemInput,
    type PickupItemInput,
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
    STARTER_CITY_DEFAULT_SPAWN,
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
    level: number;
    experience: number;
    goldCopper: number;
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
    groundItems: unknown;
};

type WorldGroundItemState = {
    id: string;
    slug: string;
    name: string;
    tileX: number;
    tileY: number;
    quantity: number;
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

type GroundItemVisual = {
    container: GameObjects.Container;
    quantityLabel: GameObjects.Text;
    itemId: string;
    slug: string;
    tileX: number;
    tileY: number;
    homeX: number;
    homeY: number;
};

type WorldChunkVisual = {
    key: string;
    objects: GameObjects.GameObject[];
};

type InventoryUiSlotRefs = {
    inventorySlots: HTMLDivElement;
    groundSlots: HTMLDivElement;
    quantityInput: HTMLInputElement;
    goldLabel: HTMLDivElement;
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
    private inventoryUiRoot: HTMLDivElement | null = null;
    private inventoryUiSlots: InventoryUiSlotRefs | null = null;
    private isInventoryWindowOpen = false;

    private readonly networkPlayers = new Map<string, NetworkPlayerVisual>();
    private readonly knownCreatureAliveById = new Map<string, boolean>();
    private readonly groundItemVisuals = new Map<string, GroundItemVisual>();
    private readonly groundItemsById = new Map<string, WorldGroundItemState>();
    private readonly fogTilesByKey = new Map<string, GameObjects.Rectangle>();
    private readonly renderedWorldChunks = new Map<string, WorldChunkVisual>();

    private inventoryItems: InventoryEntry[] = [];
    private inventoryGoldCopper = 0;
    private hasRegisteredInventoryDnD = false;
    private hasRegisteredGroundVisualDnD = false;
    private activeDraggedGroundItemId: string | null = null;
    private lastMouseClientX = 0;
    private lastMouseClientY = 0;

    private canMove = true;
    private canAttack = true;

    private readonly moveCooldownMs = 120;
    private readonly attackCooldownMs = 500;
    private readonly movementDurationMs = 100;
    private readonly fogRevealRadiusInTiles = 5;
    private readonly chunkSizeInTiles = 10;
    private readonly chunkRenderRadius = 2;

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

        this.add
            .rectangle(
                WORLD_WIDTH / 2,
                WORLD_HEIGHT / 2,
                WORLD_WIDTH,
                WORLD_HEIGHT
            )
            .setStrokeStyle(4, 0x111111);

        this.updateVisibleWorldChunks(
            STARTER_CITY_DEFAULT_SPAWN.tileX,
            STARTER_CITY_DEFAULT_SPAWN.tileY
        );
    }

    private updateVisibleWorldChunks(centerTileX: number, centerTileY: number): void {
        const centerChunkX = Math.floor(centerTileX / this.chunkSizeInTiles);
        const centerChunkY = Math.floor(centerTileY / this.chunkSizeInTiles);
        const visibleKeys = new Set<string>();

        for (
            let chunkY = centerChunkY - this.chunkRenderRadius;
            chunkY <= centerChunkY + this.chunkRenderRadius;
            chunkY += 1
        ) {
            for (
                let chunkX = centerChunkX - this.chunkRenderRadius;
                chunkX <= centerChunkX + this.chunkRenderRadius;
                chunkX += 1
            ) {
                if (!this.isChunkInsideWorld(chunkX, chunkY)) {
                    continue;
                }

                const key = this.chunkKey(chunkX, chunkY);
                visibleKeys.add(key);

                if (!this.renderedWorldChunks.has(key)) {
                    this.renderWorldChunk(chunkX, chunkY);
                }
            }
        }

        for (const [key, chunkVisual] of this.renderedWorldChunks.entries()) {
            if (visibleKeys.has(key)) {
                continue;
            }

            for (const object of chunkVisual.objects) {
                object.destroy();
            }

            this.renderedWorldChunks.delete(key);
        }
    }

    private renderWorldChunk(chunkX: number, chunkY: number): void {
        const key = this.chunkKey(chunkX, chunkY);
        const objects: GameObjects.GameObject[] = [];
        const startTileX = chunkX * this.chunkSizeInTiles;
        const startTileY = chunkY * this.chunkSizeInTiles;
        const endTileX = Math.min(startTileX + this.chunkSizeInTiles, MAP_WIDTH_IN_TILES);
        const endTileY = Math.min(startTileY + this.chunkSizeInTiles, MAP_HEIGHT_IN_TILES);

        for (let tileY = startTileY; tileY < endTileY; tileY += 1) {
            for (let tileX = startTileX; tileX < endTileX; tileX += 1) {
                const tileType = WORLD_MAP[tileY][tileX];
                const groundTile = this.createGroundTile(tileX, tileY);
                objects.push(groundTile);

                const tileObject = this.createTileObject(tileX, tileY, tileType);

                if (tileObject) {
                    objects.push(tileObject);
                }
            }
        }

        this.renderedWorldChunks.set(key, {
            key,
            objects
        });
    }

    private isChunkInsideWorld(chunkX: number, chunkY: number): boolean {
        const maxChunkX = Math.ceil(MAP_WIDTH_IN_TILES / this.chunkSizeInTiles) - 1;
        const maxChunkY = Math.ceil(MAP_HEIGHT_IN_TILES / this.chunkSizeInTiles) - 1;

        return chunkX >= 0 && chunkY >= 0 && chunkX <= maxChunkX && chunkY <= maxChunkY;
    }

    private chunkKey(chunkX: number, chunkY: number): string {
        return `${chunkX}:${chunkY}`;
    }

    private createFogOfWarLayer(): void {
        this.clearFogOfWarLayer();

        for (let tileY = 0; tileY < MAP_HEIGHT_IN_TILES; tileY += 1) {
            for (let tileX = 0; tileX < MAP_WIDTH_IN_TILES; tileX += 1) {
                const key = `${tileX}:${tileY}`;
                const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

                const fogTile = this.add
                    .rectangle(
                        position.x,
                        position.y,
                        TILE_SIZE,
                        TILE_SIZE,
                        0x020617,
                        0.92
                    )
                    .setDepth(25);

                this.fogTilesByKey.set(key, fogTile);
            }
        }
    }

    private clearFogOfWarLayer(): void {
        for (const fogTile of this.fogTilesByKey.values()) {
            fogTile.destroy();
        }

        this.fogTilesByKey.clear();
    }

    private revealFogAround(tileX: number, tileY: number): void {
        const radius = this.fogRevealRadiusInTiles;

        for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
            for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
                const targetX = tileX + offsetX;
                const targetY = tileY + offsetY;

                if (
                    targetX < 0 ||
                    targetY < 0 ||
                    targetX >= MAP_WIDTH_IN_TILES ||
                    targetY >= MAP_HEIGHT_IN_TILES
                ) {
                    continue;
                }

                const key = `${targetX}:${targetY}`;
                const fogTile = this.fogTilesByKey.get(key);

                if (!fogTile) {
                    continue;
                }

                if (fogTile.alpha <= 0.05) {
                    continue;
                }

                this.tweens.add({
                    targets: fogTile,
                    alpha: 0,
                    duration: 180,
                    ease: 'Linear'
                });
            }
        }
    }

    private createGroundTile(tileX: number, tileY: number): GameObjects.Rectangle {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);
        const tileType = WORLD_MAP[tileY][tileX];
        const alternate = (tileX + tileY) % 2 === 0;
        let fillColor = alternate ? 0x3f6946 : 0x426f49;

        if (tileType === TileType.Road) {
            fillColor = alternate ? 0x8c7a62 : 0x97846b;
        } else if (tileType === TileType.Water) {
            fillColor = alternate ? 0x1d4e89 : 0x1f5f9e;
        } else if (tileType === TileType.Bridge) {
            fillColor = alternate ? 0x7a5633 : 0x876140;
        } else if (tileType === TileType.Garden) {
            fillColor = alternate ? 0x2f7a44 : 0x3a8750;
        } else if (tileType === TileType.HouseFloor) {
            fillColor = alternate ? 0xa88b67 : 0xb59670;
        }

        return this.add
            .rectangle(
                position.x,
                position.y,
                TILE_SIZE,
                TILE_SIZE,
                fillColor
            )
            .setStrokeStyle(1, 0x29472f, 0.45);
    }

    private createTileObject(
        tileX: number,
        tileY: number,
        tileType: TileType
    ): GameObjects.GameObject | null {
        switch (tileType) {
            case TileType.Wall:
                return this.createWall(tileX, tileY);

            case TileType.Tree:
                return this.createTree(tileX, tileY);

            case TileType.Rock:
                return this.createRock(tileX, tileY);

            case TileType.Fence:
                return this.createFence(tileX, tileY);

            case TileType.LampPost:
                return this.createLampPost(tileX, tileY);

            case TileType.Fountain:
                return this.createFountain(tileX, tileY);

            case TileType.MarketStall:
                return this.createMarketStall(tileX, tileY);

            case TileType.HouseRoof:
                return this.createHouseRoof(tileX, tileY);

            case TileType.Statue:
                return this.createStatue(tileX, tileY);

            case TileType.Banner:
                return this.createBanner(tileX, tileY);

            case TileType.Crate:
                return this.createCrate(tileX, tileY);

            case TileType.Bush:
                return this.createBush(tileX, tileY);

            case TileType.Flower:
                return this.createFlower(tileX, tileY);

            case TileType.Grass:
                return null;

            case TileType.Road:
                return null;

            case TileType.Water:
                return null;

            case TileType.Bridge:
                return null;

            case TileType.Garden:
                return null;

            case TileType.HouseFloor:
                return null;

            default:
                console.warn(`Unknown tile type ${tileType} at ${tileX},${tileY}`);
                return null;
        }
    }

    private createWall(tileX: number, tileY: number): GameObjects.Rectangle {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        return this.add
            .rectangle(position.x, position.y, TILE_SIZE, TILE_SIZE, 0x806044)
            .setStrokeStyle(2, 0x3d291c)
            .setDepth(5);
    }

    private createTree(tileX: number, tileY: number): GameObjects.Container {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        const trunk = this.add.rectangle(0, 8, 8, 16, 0x68421f).setDepth(5);
        const crown = this.add
            .circle(0, -3, 13, 0x1f7a35)
            .setStrokeStyle(2, 0x124d22)
            .setDepth(6);

        return this.add.container(position.x, position.y, [trunk, crown]).setDepth(6);
    }

    private createRock(tileX: number, tileY: number): GameObjects.Ellipse {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        return this.add
            .ellipse(position.x, position.y, TILE_SIZE - 6, TILE_SIZE - 12, 0x7b7f84)
            .setStrokeStyle(2, 0x414449)
            .setDepth(5);
    }

    private createFence(tileX: number, tileY: number): GameObjects.Rectangle {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        return this.add
            .rectangle(position.x, position.y, TILE_SIZE - 8, 6, 0xc8a96d)
            .setStrokeStyle(1, 0x6f4f28)
            .setDepth(6);
    }

    private createLampPost(tileX: number, tileY: number): GameObjects.Container {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);
        const pole = this.add.rectangle(0, 4, 4, 18, 0x3a2a1b);
        const light = this.add.circle(0, -6, 4, 0xffe29a).setStrokeStyle(1, 0x8a6a2a);

        return this.add.container(position.x, position.y, [pole, light]).setDepth(7);
    }

    private createFountain(tileX: number, tileY: number): GameObjects.Container {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);
        const basin = this.add.circle(0, 0, 11, 0x94a3b8).setStrokeStyle(2, 0x475569);
        const water = this.add.circle(0, 0, 7, 0x3b82f6).setStrokeStyle(1, 0x1d4ed8);

        return this.add.container(position.x, position.y, [basin, water]).setDepth(7);
    }

    private createMarketStall(tileX: number, tileY: number): GameObjects.Container {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);
        const base = this.add.rectangle(0, 5, 16, 10, 0x7c5a2e).setStrokeStyle(1, 0x4d3416);
        const canopy = this.add.rectangle(0, -4, 18, 8, 0xd33a2c).setStrokeStyle(1, 0x7f1d1d);

        return this.add.container(position.x, position.y, [base, canopy]).setDepth(7);
    }

    private createHouseRoof(tileX: number, tileY: number): GameObjects.Rectangle {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        return this.add
            .rectangle(position.x, position.y, TILE_SIZE, TILE_SIZE, 0x9b3d2f)
            .setStrokeStyle(1, 0x4a1d17)
            .setDepth(6);
    }

    private createStatue(tileX: number, tileY: number): GameObjects.Container {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);
        const pedestal = this.add.rectangle(0, 6, 12, 8, 0x64748b);
        const statue = this.add.rectangle(0, -2, 8, 12, 0x94a3b8);

        return this.add.container(position.x, position.y, [pedestal, statue]).setDepth(7);
    }

    private createBanner(tileX: number, tileY: number): GameObjects.Container {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);
        const pole = this.add.rectangle(-4, 2, 2, 16, 0x3a2a1b);
        const cloth = this.add.rectangle(3, -2, 10, 8, 0xb91c1c).setStrokeStyle(1, 0x7f1d1d);

        return this.add.container(position.x, position.y, [pole, cloth]).setDepth(7);
    }

    private createCrate(tileX: number, tileY: number): GameObjects.Rectangle {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        return this.add
            .rectangle(position.x, position.y, 12, 12, 0x9a6b3a)
            .setStrokeStyle(1, 0x5a3a1a)
            .setDepth(7);
    }

    private createBush(tileX: number, tileY: number): GameObjects.Arc {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        return this.add
            .circle(position.x, position.y, 9, 0x2f855a)
            .setStrokeStyle(1, 0x1f5d3c)
            .setDepth(6);
    }

    private createFlower(tileX: number, tileY: number): GameObjects.Container {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);
        const stem = this.add.rectangle(0, 2, 2, 8, 0x166534);
        const bloom = this.add.circle(0, -3, 3, 0xf472b6).setStrokeStyle(1, 0xbe185d);

        return this.add.container(position.x, position.y, [stem, bloom]).setDepth(6);
    }

    private createSystems(): void {
        this.collisionSystem = new CollisionSystem(
            WORLD_MAP,
            MAP_WIDTH_IN_TILES,
            MAP_HEIGHT_IN_TILES
        );
    }

    private createPlayer(name: string): void {
        const initialTileX = STARTER_CITY_DEFAULT_SPAWN.tileX;
        const initialTileY = STARTER_CITY_DEFAULT_SPAWN.tileY;

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
                this.syncGroundItems(state.groundItems);
                this.refreshInventoryPanel();
            });

            room.onLeave((code) => {
                this.uiScene.logMessage(`Conexión cerrada (code ${code}).`);

                this.worldRoom = null;
                this.localSessionId = null;
                this.hasAppliedServerSpawn = false;
                this.clearNetworkPlayers();
                this.clearCreatures();
                this.clearGroundItems();
            });

            room.onError((code, message) => {
                this.uiScene.logMessage(`Error de red (${code}): ${message}`);
            });

            room.onMessage(SERVER_TO_CLIENT_MESSAGE.CHAT_MESSAGE, (message: unknown) => {
                this.handleChatMessage(message);
            });

            room.onMessage(SERVER_TO_CLIENT_MESSAGE.ANNOUNCEMENT, (message: unknown) => {
                this.handleAnnouncementMessage(message);
            });

            room.onMessage(SERVER_TO_CLIENT_MESSAGE.ITEM_INVENTORY_SYNC, (payload: unknown) => {
                this.handleInventorySyncMessage(payload);
            });

            this.requestInventorySync();
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
            this.clearGroundItems();
            this.inventoryItems = [];
                this.inventoryGoldCopper = 0;
            this.refreshInventoryPanel();
        }
    }

    private handleInventorySyncMessage(payload: unknown): void {
        if (!isInventorySyncPayload(payload)) {
            return;
        }

        this.inventoryItems = payload.items;
        this.inventoryGoldCopper = payload.goldCopper;
        this.refreshInventoryPanel();
    }

    private requestInventorySync(): void {
        if (!this.worldRoom) {
            return;
        }

        this.worldRoom.send(CLIENT_TO_SERVER_MESSAGE.ITEM_INVENTORY_REQUEST, {});
    }

    private sendDropItemIntent(
        slug: string,
        quantity: number,
        targetTileX?: number,
        targetTileY?: number
    ): void {
        if (!this.worldRoom) {
            this.uiScene.logChatMessage('[Sistema] No hay conexion con la room.');
            return;
        }

        const payload: DropItemInput = {
            slug,
            quantity,
            targetTileX,
            targetTileY
        };

        if (!isDropItemInput(payload)) {
            this.uiScene.logChatMessage('[Sistema] Payload invalido para drop.');
            return;
        }

        this.worldRoom.send(CLIENT_TO_SERVER_MESSAGE.ITEM_DROP, payload);
    }

    private sendPickupItemIntent(
        slug: string,
        quantity: number,
        targetTileX?: number,
        targetTileY?: number
    ): void {
        if (!this.worldRoom) {
            this.uiScene.logChatMessage('[Sistema] No hay conexion con la room.');
            return;
        }

        const payload: PickupItemInput = {
            slug,
            quantity,
            targetTileX,
            targetTileY
        };

        if (!isPickupItemInput(payload)) {
            this.uiScene.logChatMessage('[Sistema] Payload invalido para pickup.');
            return;
        }

        this.worldRoom.send(CLIENT_TO_SERVER_MESSAGE.ITEM_PICKUP, payload);
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

    private handleAnnouncementMessage(message: unknown): void {
        if (!isAnnouncementPayload(message)) {
            return;
        }

        const payload: AnnouncementPayload = message;
        this.uiScene.showAnnouncement(payload.from, payload.text);
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

        keyboard.on('keydown-B', () => {
            if (this.isChatInputFocused()) {
                return;
            }

            this.toggleInventoryWindow();
        });
    }

    private createInventoryQuickActionsOverlay(): void {
        const root = document.createElement('div');
        root.style.position = 'fixed';
        root.style.right = '12px';
        root.style.bottom = '12px';
        root.style.zIndex = '9997';
        root.style.display = 'grid';
        root.style.gap = '6px';
        root.style.padding = '8px';
        root.style.border = '1px solid #334155';
        root.style.borderRadius = '8px';
        root.style.background = 'rgba(10, 16, 30, 0.95)';
        root.style.width = '360px';
        root.style.display = 'none';

        const title = document.createElement('div');
        title.textContent = 'Inventory (B para abrir/cerrar)';
        title.style.fontFamily = 'Georgia, serif';
        title.style.fontSize = '14px';
        title.style.color = '#f8fafc';
        title.style.cursor = 'move';
        title.style.userSelect = 'none';

        const goldLabel = document.createElement('div');
        goldLabel.style.fontFamily = 'Arial, sans-serif';
        goldLabel.style.fontSize = '11px';
        goldLabel.style.color = '#fde68a';
        goldLabel.textContent = 'Gold: 0g 0s 0c';

        const quantityInput = document.createElement('input');
        quantityInput.type = 'number';
        quantityInput.min = '1';
        quantityInput.step = '1';
        quantityInput.value = '1';
        quantityInput.style.width = '90px';
        quantityInput.style.padding = '4px 6px';
        quantityInput.style.borderRadius = '6px';
        quantityInput.style.border = '1px solid #475569';
        quantityInput.style.background = '#0f172a';
        quantityInput.style.color = '#f8fafc';

        const quantityRow = document.createElement('div');
        quantityRow.style.display = 'flex';
        quantityRow.style.alignItems = 'center';
        quantityRow.style.gap = '8px';

        const quantityLabel = document.createElement('span');
        quantityLabel.textContent = 'Cantidad por click:';
        quantityLabel.style.fontFamily = 'Arial, sans-serif';
        quantityLabel.style.fontSize = '11px';
        quantityLabel.style.color = '#cbd5e1';

        quantityRow.appendChild(quantityLabel);
        quantityRow.appendChild(quantityInput);

        const inventoryTitle = document.createElement('div');
        inventoryTitle.textContent = 'Backpack (20 slots)';
        inventoryTitle.style.fontFamily = 'Georgia, serif';
        inventoryTitle.style.fontSize = '12px';
        inventoryTitle.style.color = '#e2e8f0';

        const inventorySlots = document.createElement('div');
        inventorySlots.style.display = 'grid';
        inventorySlots.style.gridTemplateColumns = 'repeat(5, 1fr)';
        inventorySlots.style.gap = '4px';

        const groundTitle = document.createElement('div');
        groundTitle.textContent = 'Ground (current tile, max 10)';
        groundTitle.style.fontFamily = 'Georgia, serif';
        groundTitle.style.fontSize = '12px';
        groundTitle.style.color = '#d1fae5';

        const groundSlots = document.createElement('div');
        groundSlots.style.display = 'grid';
        groundSlots.style.gridTemplateColumns = 'repeat(5, 1fr)';
        groundSlots.style.gap = '4px';

        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'Refresh inventory';
        refreshButton.style.padding = '4px 8px';
        refreshButton.style.borderRadius = '6px';
        refreshButton.style.border = '1px solid #1d4ed8';
        refreshButton.style.background = '#1e40af';
        refreshButton.style.color = '#eff6ff';
        refreshButton.style.cursor = 'pointer';

        refreshButton.addEventListener('click', () => {
            this.requestInventorySync();
            this.refreshInventoryPanel();
        });

        inventorySlots.addEventListener('dragover', (event) => {
            event.preventDefault();
        });

        inventorySlots.addEventListener('drop', (event) => {
            event.preventDefault();
            const raw = event.dataTransfer?.getData('application/x-tibia-item-drag');

            if (!raw) {
                return;
            }

            const payload = this.parseDraggedItemPayload(raw);

            if (!payload || payload.source !== 'ground') {
                return;
            }

            const quantity = this.parseInventoryActionQuantity();

            if (quantity === null) {
                return;
            }

            this.sendPickupItemIntent(payload.slug, quantity, payload.tileX, payload.tileY);
        });

        root.appendChild(title);
        root.appendChild(goldLabel);
        root.appendChild(quantityRow);
        root.appendChild(inventoryTitle);
        root.appendChild(inventorySlots);
        root.appendChild(groundTitle);
        root.appendChild(groundSlots);
        root.appendChild(refreshButton);
        document.body.appendChild(root);

        this.inventoryUiRoot = root;
        this.inventoryUiSlots = {
            inventorySlots,
            groundSlots,
            quantityInput,
            goldLabel
        };

        this.enableInventoryWindowDragging(root, title);

        if (!this.hasRegisteredInventoryDnD) {
            this.registerInventoryDragDropBridges();
            this.hasRegisteredInventoryDnD = true;
        }

        this.refreshInventoryPanel();
    }

    private enableInventoryWindowDragging(root: HTMLDivElement, handle: HTMLDivElement): void {
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        handle.addEventListener('mousedown', (event) => {
            if (event.button !== 0) {
                return;
            }

            event.preventDefault();
            const rect = root.getBoundingClientRect();
            dragging = true;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;

            root.style.transform = 'none';
            root.style.right = 'auto';
            root.style.bottom = 'auto';
            root.style.left = `${rect.left}px`;
            root.style.top = `${rect.top}px`;
        });

        window.addEventListener('mousemove', (event) => {
            if (!dragging) {
                return;
            }

            root.style.left = `${event.clientX - offsetX}px`;
            root.style.top = `${event.clientY - offsetY}px`;
        });

        window.addEventListener('mouseup', () => {
            dragging = false;
        });
    }

    private toggleInventoryWindow(): void {
        if (!this.inventoryUiRoot) {
            return;
        }

        this.isInventoryWindowOpen = !this.isInventoryWindowOpen;
        this.inventoryUiRoot.style.display = this.isInventoryWindowOpen ? 'grid' : 'none';

        if (this.isInventoryWindowOpen) {
            this.requestInventorySync();
            this.refreshInventoryPanel();
        }
    }

    private registerInventoryDragDropBridges(): void {
        if (!this.game.canvas) {
            return;
        }

        this.game.canvas.addEventListener('dragover', (event) => {
            event.preventDefault();
        });

        this.game.canvas.addEventListener('drop', (event) => {
            event.preventDefault();
            const raw = event.dataTransfer?.getData('application/x-tibia-item-drag');

            if (!raw) {
                return;
            }

            const payload = this.parseDraggedItemPayload(raw);

            if (!payload || payload.source !== 'inventory') {
                return;
            }

            const quantity = this.parseInventoryActionQuantity();

            if (quantity === null) {
                return;
            }

            const tile = this.clientPointToTile(event.clientX, event.clientY);

            if (!tile) {
                return;
            }

            this.sendDropItemIntent(payload.slug, quantity, tile.tileX, tile.tileY);
        });
    }

    private parseDraggedItemPayload(raw: string): {
        source: 'inventory' | 'ground';
        slug: string;
        tileX?: number;
        tileY?: number;
    } | null {
        try {
            const parsed: unknown = JSON.parse(raw);

            if (!this.isRecord(parsed)) {
                return null;
            }

            const source = parsed.source;
            const slug = parsed.slug;

            if (
                (source !== 'inventory' && source !== 'ground') ||
                typeof slug !== 'string'
            ) {
                return null;
            }

            const tileX = typeof parsed.tileX === 'number' ? parsed.tileX : undefined;
            const tileY = typeof parsed.tileY === 'number' ? parsed.tileY : undefined;

            return {
                source,
                slug,
                tileX,
                tileY
            };
        } catch {
            return null;
        }
    }

    private clientPointToTile(clientX: number, clientY: number): { tileX: number; tileY: number } | null {
        const canvasRect = this.game.canvas.getBoundingClientRect();

        if (
            clientX < canvasRect.left ||
            clientX > canvasRect.right ||
            clientY < canvasRect.top ||
            clientY > canvasRect.bottom
        ) {
            return null;
        }

        const normalizedX = clientX - canvasRect.left;
        const normalizedY = clientY - canvasRect.top;
        const gameWidth = this.scale.gameSize.width;
        const gameHeight = this.scale.gameSize.height;

        if (canvasRect.width <= 0 || canvasRect.height <= 0) {
            return null;
        }

        const pointerX = normalizedX * (gameWidth / canvasRect.width);
        const pointerY = normalizedY * (gameHeight / canvasRect.height);

        const worldPoint = this.cameras.main.getWorldPoint(pointerX, pointerY);
        const tileX = Math.floor(worldPoint.x / TILE_SIZE);
        const tileY = Math.floor(worldPoint.y / TILE_SIZE);

        if (
            tileX < 0 ||
            tileY < 0 ||
            tileX >= MAP_WIDTH_IN_TILES ||
            tileY >= MAP_HEIGHT_IN_TILES
        ) {
            return null;
        }

        return { tileX, tileY };
    }

    private registerGroundVisualDragHandlers(): void {
        window.addEventListener('mousemove', (event) => {
            this.lastMouseClientX = event.clientX;
            this.lastMouseClientY = event.clientY;
        });

        window.addEventListener('mouseup', (event) => {
            if (!this.activeDraggedGroundItemId) {
                return;
            }

            this.finalizeGroundItemDrag(this.activeDraggedGroundItemId, event.clientX, event.clientY);
        });

        this.input.on('dragstart', (_pointer: unknown, gameObject: GameObjects.GameObject) => {
            if (!(gameObject instanceof GameObjects.Container)) {
                return;
            }

            const itemId = gameObject.getData('groundItemId');

            if (typeof itemId !== 'string') {
                return;
            }

            const visual = this.groundItemVisuals.get(itemId);

            if (!visual) {
                return;
            }

            this.activeDraggedGroundItemId = itemId;
            if (this.inventoryUiRoot) {
                this.inventoryUiRoot.style.pointerEvents = 'none';
            }
            visual.homeX = visual.container.x;
            visual.homeY = visual.container.y;
            visual.container.setAlpha(0.75);
        });

        this.input.on(
            'drag',
            (_pointer: unknown, gameObject: GameObjects.GameObject, dragX: number, dragY: number) => {
                if (!(gameObject instanceof GameObjects.Container)) {
                    return;
                }

                const itemId = gameObject.getData('groundItemId');

                if (typeof itemId !== 'string') {
                    return;
                }

                gameObject.setPosition(dragX, dragY);
            }
        );

        this.input.on(
            'dragend',
            (pointer: Phaser.Input.Pointer, gameObject: GameObjects.GameObject) => {
                if (!(gameObject instanceof GameObjects.Container)) {
                    return;
                }

                const itemId = gameObject.getData('groundItemId');

                if (typeof itemId !== 'string') {
                    return;
                }
                const canvasRect = this.game.canvas.getBoundingClientRect();
                const pointerClientX = canvasRect.left + pointer.x;
                const pointerClientY = canvasRect.top + pointer.y;

                const clientX =
                    this.lastMouseClientX !== 0 ? this.lastMouseClientX : pointerClientX;
                const clientY =
                    this.lastMouseClientY !== 0 ? this.lastMouseClientY : pointerClientY;

                this.finalizeGroundItemDrag(itemId, clientX, clientY);
            }
        );
    }

    private finalizeGroundItemDrag(itemId: string, clientX: number, clientY: number): void {
        const visual = this.groundItemVisuals.get(itemId);

        if (this.inventoryUiRoot) {
            this.inventoryUiRoot.style.pointerEvents = 'auto';
        }

        if (!visual) {
            this.activeDraggedGroundItemId = null;
            return;
        }

        visual.container.setPosition(visual.homeX, visual.homeY);
        visual.container.setAlpha(1);
        this.activeDraggedGroundItemId = null;

        const quantity = this.parseInventoryActionQuantity();

        if (quantity === null) {
            return;
        }

        if (!this.isPointInsideInventoryWindow(clientX, clientY)) {
            return;
        }

        this.sendPickupItemIntent(
            visual.slug,
            quantity,
            visual.tileX,
            visual.tileY
        );
    }

    private isPointInsideInventoryWindow(clientX: number, clientY: number): boolean {
        if (!this.inventoryUiRoot || this.inventoryUiRoot.style.display === 'none') {
            return false;
        }

        const hitElement = document.elementFromPoint(clientX, clientY);

        if (hitElement && this.inventoryUiRoot.contains(hitElement)) {
            return true;
        }

        const rect = this.inventoryUiRoot.getBoundingClientRect();

        return (
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom
        );
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

        const { id, name, tileX, tileY, level, experience, goldCopper } = rawPlayer;

        if (
            typeof id !== 'string' ||
            typeof name !== 'string' ||
            typeof tileX !== 'number' ||
            typeof tileY !== 'number' ||
            typeof level !== 'number' ||
            typeof experience !== 'number' ||
            typeof goldCopper !== 'number'
        ) {
            return null;
        }

        return {
            id,
            name,
            tileX,
            tileY,
            level,
            experience,
            goldCopper
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
        this.updateVisibleWorldChunks(playerState.tileX, playerState.tileY);
        this.revealFogAround(playerState.tileX, playerState.tileY);

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
        this.createFogOfWarLayer();
        this.revealFogAround(this.player.tileX, this.player.tileY);
        this.createKeyboardControls();
        this.createCombatControls();
        this.configureCamera();
        this.launchUiScene();
        this.createChatInputOverlay();
        this.createInventoryQuickActionsOverlay();

        if (!this.hasRegisteredGroundVisualDnD) {
            this.registerGroundVisualDragHandlers();
            this.hasRegisteredGroundVisualDnD = true;
        }

        this.events.once('shutdown', () => {
            this.chatInputElement?.parentElement?.remove();
            this.chatInputElement = null;
            this.inventoryUiRoot?.remove();
            this.inventoryUiRoot = null;
            this.inventoryUiSlots = null;
            this.isInventoryWindowOpen = false;
            this.clearFogOfWarLayer();
            this.clearRenderedWorldChunks();
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
            const character = this.parseCharacterSummary(entry);

            if (character) {
                parsedCharacters.push(character);
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

        const parsedCreatedCharacter = this.parseCharacterSummary(createdCharacter);

        if (!parsedCreatedCharacter) {
            throw new Error('Invalid created character payload.');
        }

        return {
            accountId,
            token,
            username: usernameFromServer,
            createdCharacter: parsedCreatedCharacter
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

        const parsedCharacter = this.parseCharacterSummary(character);

        if (!parsedCharacter) {
            throw new Error('Invalid created character shape.');
        }

        const result: AuthCreateCharacterResponse = {
            character: parsedCharacter
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
            const character = this.parseCharacterSummary(entry);

            if (character) {
                responseBody.characters.push(character);
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

    private syncGroundItems(rawGroundItems: unknown): void {
        if (!this.isRecord(rawGroundItems)) {
            this.clearGroundItems();
            return;
        }

        const seenIds = new Set<string>();
        const mapLike = rawGroundItems as {
            entries?: () => IterableIterator<[string, unknown]>;
        };

        if (typeof mapLike.entries === 'function') {
            for (const [id, rawItem] of mapLike.entries()) {
                const parsed = this.parseGroundItemState(rawItem);

                if (!parsed) {
                    continue;
                }

                seenIds.add(id);
                this.groundItemsById.set(parsed.id, parsed);
                this.upsertGroundItemVisual(parsed);
            }
        } else {
            for (const [id, rawItem] of Object.entries(rawGroundItems)) {
                const parsed = this.parseGroundItemState(rawItem);

                if (!parsed) {
                    continue;
                }

                seenIds.add(id);
                this.groundItemsById.set(parsed.id, parsed);
                this.upsertGroundItemVisual(parsed);
            }
        }

        for (const [id, visual] of this.groundItemVisuals) {
            if (seenIds.has(id)) {
                continue;
            }

            visual.container.destroy();
            this.groundItemVisuals.delete(id);
            this.groundItemsById.delete(id);
        }

        this.refreshInventoryPanel();
    }

    private parseGroundItemState(value: unknown): WorldGroundItemState | null {
        if (!this.isRecord(value)) {
            return null;
        }

        const { id, slug, name, tileX, tileY, quantity } = value;

        if (
            typeof id !== 'string' ||
            typeof slug !== 'string' ||
            typeof name !== 'string' ||
            typeof tileX !== 'number' ||
            typeof tileY !== 'number' ||
            typeof quantity !== 'number'
        ) {
            return null;
        }

        return {
            id,
            slug,
            name,
            tileX,
            tileY,
            quantity
        };
    }

    private upsertGroundItemVisual(item: WorldGroundItemState): void {
        const position = tileToWorldPosition(item.tileX, item.tileY, TILE_SIZE);
        let visual = this.groundItemVisuals.get(item.id);

        if (!visual) {
            const icon = this.add
                .circle(0, 0, 5, 0xffd166)
                .setStrokeStyle(1, 0x5b4300);

            const qty = this.add
                .text(8, -10, '', {
                    fontFamily: 'Arial',
                    fontSize: '10px',
                    color: '#fff7cc',
                    stroke: '#000000',
                    strokeThickness: 2
                })
                .setOrigin(0, 0.5);

            const container = this.add.container(position.x, position.y, [icon, qty]);
            container.setDepth(8);
            container.setSize(34, 22);
            container.setInteractive({ useHandCursor: true });
            container.setData('groundItemId', item.id);
            this.input.setDraggable(container, true);

            visual = {
                container,
                quantityLabel: qty,
                itemId: item.id,
                slug: item.slug,
                tileX: item.tileX,
                tileY: item.tileY,
                homeX: position.x,
                homeY: position.y
            };

            this.groundItemVisuals.set(item.id, visual);
        }

        visual.container.setPosition(position.x, position.y);
        visual.quantityLabel.setText(`${item.slug} x${item.quantity}`);
        visual.slug = item.slug;
        visual.tileX = item.tileX;
        visual.tileY = item.tileY;
        visual.homeX = position.x;
        visual.homeY = position.y;
    }

    private clearGroundItems(): void {
        for (const visual of this.groundItemVisuals.values()) {
            visual.container.destroy();
        }

        this.groundItemVisuals.clear();
        this.groundItemsById.clear();
        this.refreshInventoryPanel();
    }

    private clearRenderedWorldChunks(): void {
        for (const chunk of this.renderedWorldChunks.values()) {
            for (const object of chunk.objects) {
                object.destroy();
            }
        }

        this.renderedWorldChunks.clear();
    }

    private refreshInventoryPanel(): void {
        if (!this.inventoryUiSlots) {
            return;
        }

        const { inventorySlots, groundSlots, goldLabel } = this.inventoryUiSlots;

        inventorySlots.replaceChildren();
        groundSlots.replaceChildren();

        const { gold, silver, copper } = this.formatGold(this.inventoryGoldCopper);
        goldLabel.textContent = `Gold: ${gold}g ${silver}s ${copper}c`;

        const inventoryBySlot = this.inventoryItems.slice(0, 20);

        for (let slotIndex = 0; slotIndex < 20; slotIndex += 1) {
            const item = inventoryBySlot[slotIndex] ?? null;
            const slot = this.createSlotElement(item, false);
            inventorySlots.appendChild(slot);
        }

        const localTileX = this.player?.tileX;
        const localTileY = this.player?.tileY;

        if (typeof localTileX !== 'number' || typeof localTileY !== 'number') {
            return;
        }

        const groundAtTile = [...this.groundItemsById.values()]
            .filter((item) => item.tileX === localTileX && item.tileY === localTileY)
            .sort((a, b) => a.slug.localeCompare(b.slug))
            .slice(0, 10);

        for (let slotIndex = 0; slotIndex < 10; slotIndex += 1) {
            const item = groundAtTile[slotIndex] ?? null;
            const slot = this.createSlotElement(
                item
                    ? {
                        slug: item.slug,
                        name: item.name,
                        quantity: item.quantity,
                        tileX: item.tileX,
                        tileY: item.tileY
                    }
                    : null,
                true
            );

            groundSlots.appendChild(slot);
        }
    }

    private parseInventoryActionQuantity(): number | null {
        if (!this.inventoryUiSlots) {
            return null;
        }

        const quantity = Number.parseInt(this.inventoryUiSlots.quantityInput.value, 10);

        if (!Number.isInteger(quantity) || quantity <= 0) {
            this.uiScene.logChatMessage('[Sistema] Cantidad invalida.');
            return null;
        }

        return quantity;
    }

    private createSlotElement(
        item: {
            slug: string;
            name: string;
            quantity: number;
            tileX?: number;
            tileY?: number;
        } | null,
        isGround: boolean
    ): HTMLButtonElement {
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.style.width = '64px';
        slot.style.height = '52px';
        slot.style.borderRadius = '8px';
        slot.style.border = '1px solid #475569';
        slot.style.background = '#0f172a';
        slot.style.color = '#e2e8f0';
        slot.style.padding = '4px';
        slot.style.textAlign = 'left';
        slot.style.cursor = item ? 'pointer' : 'default';

        if (!item) {
            slot.textContent = '';
            slot.disabled = true;
            slot.style.opacity = '0.45';
            return slot;
        }

        slot.draggable = true;

        const title = document.createElement('div');
        title.textContent = item.slug;
        title.style.fontFamily = 'Arial, sans-serif';
        title.style.fontSize = '9px';
        title.style.color = '#f8fafc';

        const qty = document.createElement('div');
        qty.textContent = `x${item.quantity}`;
        qty.style.fontFamily = 'Arial, sans-serif';
        qty.style.fontSize = '10px';
        qty.style.fontWeight = '700';
        qty.style.color = isGround ? '#bbf7d0' : '#fde68a';

        const action = document.createElement('div');
        action.textContent = isGround ? 'Pickup' : 'Drop';
        action.style.fontFamily = 'Arial, sans-serif';
        action.style.fontSize = '8px';
        action.style.color = isGround ? '#86efac' : '#fca5a5';

        slot.appendChild(title);
        slot.appendChild(qty);
        slot.appendChild(action);

        slot.addEventListener('click', () => {
            const parsedQuantity = this.parseInventoryActionQuantity();

            if (parsedQuantity === null) {
                return;
            }

            if (isGround) {
                this.sendPickupItemIntent(item.slug, parsedQuantity, item.tileX, item.tileY);
                return;
            }

            this.sendDropItemIntent(item.slug, parsedQuantity);
        });

        slot.addEventListener('dragstart', (event) => {
            const payload = {
                source: isGround ? 'ground' : 'inventory',
                slug: item.slug,
                tileX: isGround ? item.tileX : undefined,
                tileY: isGround ? item.tileY : undefined
            };

            event.dataTransfer?.setData('application/x-tibia-item-drag', JSON.stringify(payload));
            event.dataTransfer?.setData('text/plain', item.slug);
            event.dataTransfer?.setDragImage(slot, 20, 20);
        });

        return slot;
    }

    private formatGold(totalCopper: number): {
        gold: number;
        silver: number;
        copper: number;
    } {
        const normalized = Math.max(0, Math.floor(totalCopper));
        const gold = Math.floor(normalized / 10_000);
        const silver = Math.floor((normalized % 10_000) / 100);
        const copper = normalized % 100;

        return {
            gold,
            silver,
            copper
        };
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null;
    }

    private parseCharacterSummary(value: unknown): CharacterSummary | null {
        if (!this.isRecord(value)) {
            return null;
        }

        const id = value.id;
        const name = value.name;

        if (typeof id !== 'string' || typeof name !== 'string') {
            return null;
        }

        const tileX = typeof value.tileX === 'number' ? value.tileX : 5;
        const tileY = typeof value.tileY === 'number' ? value.tileY : 5;
        const level = typeof value.level === 'number' ? value.level : 1;
        const experience = typeof value.experience === 'number' ? value.experience : 0;
        const goldCopper = typeof value.goldCopper === 'number' ? value.goldCopper : 0;

        return {
            id,
            name,
            tileX,
            tileY,
            level,
            experience,
            goldCopper
        };
    }
}
