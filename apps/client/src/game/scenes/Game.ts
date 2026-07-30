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
    type FriendEntry,
    type FriendListSyncPayload,
    type FriendRequestCreateInput,
    type FriendRequestRespondInput,
    type PendingFriendInvite,
    type InventoryEntry,
    isAnnouncementPayload,
    isChatMessagePayload,
    isChatSendInput,
    isDropItemInput,
    isFriendListSyncPayload,
    isFriendRequestCreateInput,
    isFriendRequestRespondInput,
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
    isBlockingTile,
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
    tileOverrides: unknown;
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

type UtilityWindowName =
    | 'map'
    | 'inventory'
    | 'friends'
    | 'users'
    | 'settings'
    | 'armor';
type UtilityPanelSection = 'map' | 'friends' | 'users' | 'settings';
type MapPanelMode = 'compact' | 'fullscreen';
type ConnectionHealth = 'ok' | 'warn' | 'error' | 'unknown';

type AuthSessionResult = {
    playerName: string;
    characterId: string;
    token: string;
};

const LAST_CHARACTER_STORAGE_KEY = 'tibia-like:last-character-id';
const WINDOW_POSITION_STORAGE_PREFIX = 'tibia-like:ui-window:';

const UI_COLORS = {
    panel: 'rgba(22, 16, 10, 0.94)',
    border: '#7c5c2b',
    borderSoft: '#4b3719',
    text: '#f5e7c6',
    textSoft: '#dcc9a3',
    accent: '#d4a857',
    accentStrong: '#f3c96f',
    danger: '#f2a6a6',
    success: '#9ddb8d',
    info: '#9fd0ff',
    shadow: '0 18px 40px rgba(0, 0, 0, 0.48)'
} as const;

const HOTKEY_BASIC_ATTACK_ICON = '⚔';
const HOTKEY_EMPTY_ICON = '◇';

const UTILITY_ICON_BY_NAME: Record<UtilityWindowName, string> = {
    map: '🗺',
    inventory: '🎒',
    armor: '🛡',
    friends: '🤝',
    users: '👥',
    settings: '⚙'
};

const UI_FONT_TITLE = 'Georgia, serif';
const UI_FONT_BODY = 'Trebuchet MS, Arial, sans-serif';

const applyInputStyle = (element: HTMLInputElement | HTMLSelectElement): void => {
    element.style.display = 'block';
    element.style.width = '100%';
    element.style.maxWidth = '360px';
    element.style.margin = '0 auto 10px';
    element.style.boxSizing = 'border-box';
    element.style.padding = '10px 12px';
    element.style.borderRadius = '10px';
    element.style.border = `1px solid ${UI_COLORS.borderSoft}`;
    element.style.background = 'rgba(9, 10, 12, 0.95)';
    element.style.color = UI_COLORS.text;
    element.style.fontSize = '14px';
    element.style.fontFamily = UI_FONT_BODY;
    element.style.outline = 'none';
};

const applyButtonStyle = (
    element: HTMLButtonElement,
    variant: 'primary' | 'secondary' | 'danger' = 'secondary'
): void => {
    element.style.padding = '10px 12px';
    element.style.width = '100%';
    element.style.maxWidth = '360px';
    element.style.margin = '0 auto';
    element.style.display = 'block';
    element.style.boxSizing = 'border-box';
    element.style.borderRadius = '10px';
    element.style.border = `1px solid ${UI_COLORS.border}`;
    element.style.cursor = 'pointer';
    element.style.fontFamily = UI_FONT_BODY;
    element.style.fontWeight = '700';
    element.style.transition = 'transform 120ms ease, filter 120ms ease, background 120ms ease';

    if (variant === 'primary') {
        element.style.background = 'linear-gradient(180deg, #f2c56a 0%, #b97f2e 100%)';
        element.style.color = '#2b1605';
        element.style.boxShadow = '0 10px 20px rgba(185, 127, 46, 0.25)';
        return;
    }

    if (variant === 'danger') {
        element.style.background = 'linear-gradient(180deg, #713f2d 0%, #4f2218 100%)';
        element.style.color = '#ffe9dc';
        return;
    }

    element.style.background = 'linear-gradient(180deg, #392b1a 0%, #241910 100%)';
    element.style.color = UI_COLORS.text;
};

type WindowPositionKey = 'inventory' | 'map' | 'friends' | 'users' | 'settings' | 'armor';

type StoredWindowPosition = {
    left: number;
    top: number;
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
    chunkX: number;
    chunkY: number;
    objects: GameObjects.GameObject[];
};

type WorldTileOverride = {
    tileX: number;
    tileY: number;
    tileType: number;
    walkableMode: number;
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
    private bottomActionBarRoot: HTMLDivElement | null = null;
    private utilityPanelRoot: HTMLDivElement | null = null;
    private utilityPanelTitle: HTMLDivElement | null = null;
    private utilityPanelContent: HTMLDivElement | null = null;
    private readonly bottomUtilityButtons = new Map<UtilityWindowName, HTMLButtonElement>();
    private inventoryUiRoot: HTMLDivElement | null = null;
    private inventoryUiSlots: InventoryUiSlotRefs | null = null;
    private armorModalRoot: HTMLDivElement | null = null;
    private isInventoryWindowOpen = false;
    private isArmorWindowOpen = false;
    private currentUtilitySection: UtilityPanelSection | null = null;
    private mapPanelMode: MapPanelMode = 'compact';
    private mapPreviewZoom = 4;
    private isMapPreviewLoading = false;
    private mapPreviewLoadingTimeoutId: number | null = null;
    private settingsLatencyMs: number | null = null;
    private settingsLatencyIntervalId: number | null = null;
    private connectionHealth: ConnectionHealth = 'unknown';
    private mapWindowRoot: HTMLDivElement | null = null;
    private friendsWindowRoot: HTMLDivElement | null = null;
    private usersWindowRoot: HTMLDivElement | null = null;

    private readonly networkPlayers = new Map<string, NetworkPlayerVisual>();
    private readonly knownCreatureAliveById = new Map<string, boolean>();
    private readonly groundItemVisuals = new Map<string, GroundItemVisual>();
    private readonly groundItemsById = new Map<string, WorldGroundItemState>();
    private readonly worldTileOverrides = new Map<string, WorldTileOverride>();
    private readonly dirtyChunkKeys = new Set<string>();
    private readonly fogTilesByKey = new Map<string, GameObjects.Rectangle>();
    private readonly revealedFogTileKeys = new Set<string>();
    private readonly renderedWorldChunks = new Map<string, WorldChunkVisual>();

    private inventoryItems: InventoryEntry[] = [];
    private inventoryGoldCopper = 0;
    private friendsList: FriendEntry[] = [];
    private pendingFriendInvites: PendingFriendInvite[] = [];
    private hasRegisteredInventoryDnD = false;
    private hasRegisteredGroundVisualDnD = false;
    private activeDraggedGroundItemId: string | null = null;
    private lastMouseClientX = 0;
    private lastMouseClientY = 0;
    private queuedMoveDirections: MoveInput['direction'][] = [];
    private queuedMoveTarget: { tileX: number; tileY: number } | null = null;
    private moveTargetIndicator: GameObjects.Container | null = null;
    private moveTargetIndicatorPulseTween: Phaser.Tweens.Tween | null = null;

    private canMove = true;
    private canAttack = true;

    private readonly moveCooldownMs = 155;
    private readonly attackCooldownMs = 500;
    private readonly movementDurationMs = 145;
    private readonly mapPreviewMinZoom = 0.5;
    private readonly mapPreviewMaxZoom = 4;
    private readonly mapPreviewZoomStep = 0.25;
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

        if (direction !== null) {
            this.cancelQueuedPathMovement();
            this.sendPlayerMove(direction);
            this.startMoveCooldown();
            return;
        }

        const queuedDirection = this.queuedMoveDirections.shift();

        if (!queuedDirection) {
            return;
        }

        this.sendPlayerMove(queuedDirection);
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
                    continue;
                }

                if (this.dirtyChunkKeys.has(key)) {
                    this.rerenderWorldChunk(chunkX, chunkY);
                }
            }
        }

        for (const [key, chunkVisual] of this.renderedWorldChunks.entries()) {
            if (visibleKeys.has(key)) {
                continue;
            }

            this.clearFogTilesForChunk(chunkVisual.chunkX, chunkVisual.chunkY);

            for (const object of chunkVisual.objects) {
                object.destroy();
            }

            this.renderedWorldChunks.delete(key);
        }
    }

    private rerenderWorldChunk(chunkX: number, chunkY: number): void {
        const key = this.chunkKey(chunkX, chunkY);
        const existing = this.renderedWorldChunks.get(key);

        if (existing) {
            for (const object of existing.objects) {
                object.destroy();
            }

            this.renderedWorldChunks.delete(key);
        }

        this.clearFogTilesForChunk(chunkX, chunkY);
        this.renderWorldChunk(chunkX, chunkY);
        this.dirtyChunkKeys.delete(key);
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
                const tileType = this.getTileTypeAt(tileX, tileY);

                if (tileType === null) {
                    continue;
                }

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
            chunkX,
            chunkY,
            objects
        });

        this.ensureFogTilesForChunk(chunkX, chunkY);
        this.dirtyChunkKeys.delete(key);
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

        for (const chunk of this.renderedWorldChunks.values()) {
            this.ensureFogTilesForChunk(chunk.chunkX, chunk.chunkY);
        }
    }

    private ensureFogTilesForChunk(chunkX: number, chunkY: number): void {
        const startTileX = chunkX * this.chunkSizeInTiles;
        const startTileY = chunkY * this.chunkSizeInTiles;
        const endTileX = Math.min(startTileX + this.chunkSizeInTiles, MAP_WIDTH_IN_TILES);
        const endTileY = Math.min(startTileY + this.chunkSizeInTiles, MAP_HEIGHT_IN_TILES);

        for (let tileY = startTileY; tileY < endTileY; tileY += 1) {
            for (let tileX = startTileX; tileX < endTileX; tileX += 1) {
                const key = `${tileX}:${tileY}`;

                if (this.fogTilesByKey.has(key)) {
                    continue;
                }

                const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);
                const fogTile = this.add
                    .rectangle(
                        position.x,
                        position.y,
                        TILE_SIZE,
                        TILE_SIZE,
                        0x020617,
                        this.revealedFogTileKeys.has(key) ? 0 : 0.92
                    )
                    .setDepth(25);

                this.fogTilesByKey.set(key, fogTile);
            }
        }
    }

    private clearFogTilesForChunk(chunkX: number, chunkY: number): void {
        const startTileX = chunkX * this.chunkSizeInTiles;
        const startTileY = chunkY * this.chunkSizeInTiles;
        const endTileX = Math.min(startTileX + this.chunkSizeInTiles, MAP_WIDTH_IN_TILES);
        const endTileY = Math.min(startTileY + this.chunkSizeInTiles, MAP_HEIGHT_IN_TILES);

        for (let tileY = startTileY; tileY < endTileY; tileY += 1) {
            for (let tileX = startTileX; tileX < endTileX; tileX += 1) {
                const key = `${tileX}:${tileY}`;
                const fogTile = this.fogTilesByKey.get(key);

                if (!fogTile) {
                    continue;
                }

                fogTile.destroy();
                this.fogTilesByKey.delete(key);
            }
        }
    }

    private clearFogOfWarLayer(): void {
        for (const fogTile of this.fogTilesByKey.values()) {
            fogTile.destroy();
        }

        this.fogTilesByKey.clear();
        this.revealedFogTileKeys.clear();
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
                this.revealedFogTileKeys.add(key);

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
        const tileType = this.getTileTypeAt(tileX, tileY) ?? TileType.Grass;
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

        if (!this.isTileWalkableForPathfinding(initialTileX, initialTileY)) {
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

        const triggerBasicAttack = (): void => {
            if (this.isChatInputFocused()) {
                return;
            }

            this.tryAttack();
        };

        keyboard.on('keydown-ONE', triggerBasicAttack);
        keyboard.on('keydown-NUMPAD_ONE', triggerBasicAttack);

        keyboard.on('keydown-ESC', () => {
            if (this.isChatInputFocused()) {
                return;
            }

            this.deselectCreature();
        });

        this.input.on('pointerdown', (_pointer: unknown, currentlyOver: unknown[]) => {
            if (this.isChatInputFocused()) {
                return;
            }

            const pointer = _pointer as Phaser.Input.Pointer;

            if (currentlyOver.length === 0) {
                this.deselectCreature();
                this.queuePathToClickedTile(pointer);
                return;
            }

            this.cancelQueuedPathMovement();
        });
    }

    private cancelQueuedPathMovement(): void {
        this.queuedMoveDirections = [];
        this.queuedMoveTarget = null;
        this.hideMoveTargetIndicator();
    }

    private queuePathToClickedTile(pointer: Phaser.Input.Pointer): void {
        const tileX = Math.floor(pointer.worldX / TILE_SIZE);
        const tileY = Math.floor(pointer.worldY / TILE_SIZE);

        if (!this.isTileInsideWorld(tileX, tileY)) {
            return;
        }

        if (!this.isTileWalkableForPathfinding(tileX, tileY)) {
            this.cancelQueuedPathMovement();
            return;
        }

        const startTileX = this.player.tileX;
        const startTileY = this.player.tileY;

        if (startTileX === tileX && startTileY === tileY) {
            this.cancelQueuedPathMovement();
            return;
        }

        const pathDirections = this.findPathDirectionsToTile(
            startTileX,
            startTileY,
            tileX,
            tileY
        );

        if (!pathDirections || pathDirections.length === 0) {
            this.cancelQueuedPathMovement();
            return;
        }

        this.queuedMoveDirections = pathDirections;
        this.queuedMoveTarget = {
            tileX,
            tileY
        };
        this.showMoveTargetIndicator(tileX, tileY);
    }

    private showMoveTargetIndicator(tileX: number, tileY: number): void {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        if (!this.moveTargetIndicator) {
            const ring = this.add
                .circle(0, 0, TILE_SIZE * 0.34, 0x000000, 0)
                .setStrokeStyle(2, 0x7dd3fc, 1);

            const center = this.add
                .circle(0, 0, 3, 0xf8fafc, 1)
                .setStrokeStyle(1, 0x0c4a6e, 1);

            this.moveTargetIndicator = this.add.container(position.x, position.y, [ring, center]);
            this.moveTargetIndicator.setDepth(16);

            this.moveTargetIndicatorPulseTween = this.tweens.add({
                targets: this.moveTargetIndicator,
                alpha: { from: 1, to: 0.55 },
                duration: 420,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.InOut'
            });
        }

        this.moveTargetIndicator.setPosition(position.x, position.y);
        this.moveTargetIndicator.setVisible(true);
        this.moveTargetIndicator.setAlpha(1);
    }

    private hideMoveTargetIndicator(): void {
        if (!this.moveTargetIndicator) {
            return;
        }

        this.moveTargetIndicator.setVisible(false);
    }

    private findPathDirectionsToTile(
        startTileX: number,
        startTileY: number,
        targetTileX: number,
        targetTileY: number
    ): MoveInput['direction'][] | null {
        const toKey = (tileX: number, tileY: number): string => `${tileX}:${tileY}`;
        const startKey = toKey(startTileX, startTileY);
        const targetKey = toKey(targetTileX, targetTileY);
        const queue: Array<{ tileX: number; tileY: number }> = [
            { tileX: startTileX, tileY: startTileY }
        ];
        const visited = new Set<string>([startKey]);
        const previousByKey = new Map<
            string,
            {
                previousKey: string;
                direction: MoveInput['direction'];
            }
        >();
        const deltas: Array<{
            direction: MoveInput['direction'];
            deltaX: number;
            deltaY: number;
        }> = [
            { direction: 'up', deltaX: 0, deltaY: -1 },
            { direction: 'down', deltaX: 0, deltaY: 1 },
            { direction: 'left', deltaX: -1, deltaY: 0 },
            { direction: 'right', deltaX: 1, deltaY: 0 }
        ];

        while (queue.length > 0) {
            const current = queue.shift();

            if (!current) {
                break;
            }

            const currentKey = toKey(current.tileX, current.tileY);

            if (currentKey === targetKey) {
                break;
            }

            for (const delta of deltas) {
                const nextTileX = current.tileX + delta.deltaX;
                const nextTileY = current.tileY + delta.deltaY;
                const nextKey = toKey(nextTileX, nextTileY);

                if (visited.has(nextKey)) {
                    continue;
                }

                if (!this.isTileInsideWorld(nextTileX, nextTileY)) {
                    continue;
                }

                if (!this.isTileWalkableForPathfinding(nextTileX, nextTileY)) {
                    continue;
                }

                visited.add(nextKey);
                previousByKey.set(nextKey, {
                    previousKey: currentKey,
                    direction: delta.direction
                });
                queue.push({ tileX: nextTileX, tileY: nextTileY });
            }
        }

        if (!previousByKey.has(targetKey)) {
            return null;
        }

        const reversedDirections: MoveInput['direction'][] = [];
        let currentKey: string = targetKey;

        while (currentKey !== startKey) {
            const previous = previousByKey.get(currentKey);

            if (!previous) {
                return null;
            }

            reversedDirections.push(previous.direction);
            currentKey = previous.previousKey;
        }

        return reversedDirections.reverse();
    }

    private isTileInsideWorld(tileX: number, tileY: number): boolean {
        return (
            tileX >= 0 &&
            tileY >= 0 &&
            tileX < MAP_WIDTH_IN_TILES &&
            tileY < MAP_HEIGHT_IN_TILES
        );
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
            this.connectionHealth = 'ok';

            room.onStateChange((state) => {
                this.syncTileOverrides(state.tileOverrides);
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
                this.connectionHealth = 'error';

                if (this.currentUtilitySection === 'settings') {
                    this.refreshUtilityPanel();
                }
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

            room.onMessage(SERVER_TO_CLIENT_MESSAGE.FRIENDS_SYNC, (payload: unknown) => {
                this.handleFriendsSyncMessage(payload);
            });

            this.requestInventorySync();
            this.requestFriendsSync();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';

            this.uiScene.logMessage(`No se pudo conectar al servidor: ${message}`);
            this.connectionHealth = 'error';

            if (this.currentUtilitySection === 'settings') {
                this.refreshUtilityPanel();
            }

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
            this.worldTileOverrides.clear();
            this.dirtyChunkKeys.clear();
            this.inventoryItems = [];
            this.inventoryGoldCopper = 0;
            this.friendsList = [];
            this.pendingFriendInvites = [];
            this.refreshInventoryPanel();
            this.refreshUtilityPanel();
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

    private handleFriendsSyncMessage(payload: unknown): void {
        if (!isFriendListSyncPayload(payload)) {
            return;
        }

        const data: FriendListSyncPayload = payload;
        this.friendsList = data.friends;
        this.pendingFriendInvites = data.pendingInvites;
        this.refreshUtilityPanel();
    }

    private requestInventorySync(): void {
        if (!this.worldRoom) {
            return;
        }

        this.worldRoom.send(CLIENT_TO_SERVER_MESSAGE.ITEM_INVENTORY_REQUEST, {});
    }

    private requestFriendsSync(): void {
        if (!this.worldRoom) {
            return;
        }

        this.worldRoom.send(CLIENT_TO_SERVER_MESSAGE.FRIENDS_LIST_REQUEST, {});
    }

    private sendFriendRequest(targetName: string): void {
        if (!this.worldRoom) {
            this.uiScene.logChatMessage('[Sistema] No hay conexion con la room.');
            return;
        }

        const payload: FriendRequestCreateInput = {
            targetName
        };

        if (!isFriendRequestCreateInput(payload)) {
            this.uiScene.logChatMessage('[Sistema] Solicitud de amistad invalida.');
            return;
        }

        this.worldRoom.send(CLIENT_TO_SERVER_MESSAGE.FRIEND_REQUEST_SEND, payload);
    }

    private sendFriendResponse(requestId: string, accept: boolean): void {
        if (!this.worldRoom) {
            this.uiScene.logChatMessage('[Sistema] No hay conexion con la room.');
            return;
        }

        const payload: FriendRequestRespondInput = {
            requestId,
            accept
        };

        if (!isFriendRequestRespondInput(payload)) {
            this.uiScene.logChatMessage('[Sistema] Respuesta de amistad invalida.');
            return;
        }

        this.worldRoom.send(CLIENT_TO_SERVER_MESSAGE.FRIEND_REQUEST_RESPOND, payload);
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
        wrapper.style.bottom = '92px';
        wrapper.style.transform = 'translateX(-50%)';
        wrapper.style.zIndex = '9998';
        wrapper.style.width = 'min(780px, 92vw)';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Escribe al reino... /help /w /pm /inv /announce';
        input.maxLength = 180;
        input.style.padding = '12px 14px';
        input.style.borderRadius = '12px';
        input.style.border = `1px solid ${UI_COLORS.border}`;
        input.style.background = UI_COLORS.panel;
        input.style.color = UI_COLORS.text;
        input.style.fontFamily = UI_FONT_TITLE;
        input.style.fontSize = '15px';
        input.style.boxShadow = UI_COLORS.shadow;
        input.style.outline = 'none';
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

    private createInventoryQuickActionsOverlay(): void {
        const root = document.createElement('div');
        root.style.position = 'fixed';
        root.style.right = '12px';
        root.style.bottom = '12px';
        root.style.zIndex = '9997';
        root.style.display = 'grid';
        root.style.gap = '6px';
        root.style.padding = '12px';
        root.style.border = `1px solid ${UI_COLORS.border}`;
        root.style.borderRadius = '14px';
        root.style.background = UI_COLORS.panel;
        root.style.width = '360px';
        root.style.display = 'none';
        root.style.bottom = '92px';
        root.style.boxShadow = UI_COLORS.shadow;
        root.style.backdropFilter = 'blur(6px)';

        const title = document.createElement('div');
        title.textContent = 'Bolsa y suelo';
        title.style.fontFamily = UI_FONT_TITLE;
        title.style.fontSize = '16px';
        title.style.color = UI_COLORS.text;
        title.style.cursor = 'move';
        title.style.userSelect = 'none';

        const goldLabel = document.createElement('div');
        goldLabel.style.fontFamily = UI_FONT_BODY;
        goldLabel.style.fontSize = '12px';
        goldLabel.style.color = UI_COLORS.accentStrong;
        goldLabel.textContent = 'Gold: 0g 0s 0c';

        const quantityInput = document.createElement('input');
        quantityInput.type = 'number';
        quantityInput.min = '1';
        quantityInput.step = '1';
        quantityInput.value = '1';
        quantityInput.style.width = '90px';
        quantityInput.style.padding = '4px 6px';
        quantityInput.style.borderRadius = '8px';
        quantityInput.style.border = `1px solid ${UI_COLORS.borderSoft}`;
        quantityInput.style.background = 'rgba(9, 10, 12, 0.95)';
        quantityInput.style.color = UI_COLORS.text;
        quantityInput.style.fontFamily = UI_FONT_BODY;

        const quantityRow = document.createElement('div');
        quantityRow.style.display = 'flex';
        quantityRow.style.alignItems = 'center';
        quantityRow.style.gap = '8px';

        const quantityLabel = document.createElement('span');
        quantityLabel.textContent = 'Cantidad:';
        quantityLabel.style.fontFamily = UI_FONT_BODY;
        quantityLabel.style.fontSize = '11px';
        quantityLabel.style.color = UI_COLORS.textSoft;

        quantityRow.appendChild(quantityLabel);
        quantityRow.appendChild(quantityInput);

        const inventoryTitle = document.createElement('div');
        inventoryTitle.textContent = 'Mochila';
        inventoryTitle.style.fontFamily = UI_FONT_TITLE;
        inventoryTitle.style.fontSize = '12px';
        inventoryTitle.style.color = UI_COLORS.text;

        const inventorySlots = document.createElement('div');
        inventorySlots.style.display = 'grid';
        inventorySlots.style.gridTemplateColumns = 'repeat(5, 1fr)';
        inventorySlots.style.gap = '4px';

        const groundTitle = document.createElement('div');
        groundTitle.textContent = 'Suelo';
        groundTitle.style.fontFamily = UI_FONT_TITLE;
        groundTitle.style.fontSize = '12px';
        groundTitle.style.color = '#d8f3dc';

        const groundSlots = document.createElement('div');
        groundSlots.style.display = 'grid';
        groundSlots.style.gridTemplateColumns = 'repeat(5, 1fr)';
        groundSlots.style.gap = '4px';

        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'Actualizar';
        refreshButton.style.padding = '4px 8px';
        refreshButton.style.borderRadius = '8px';
        refreshButton.style.border = `1px solid ${UI_COLORS.border}`;
        refreshButton.style.background = 'linear-gradient(180deg, #4a3420 0%, #2a1b11 100%)';
        refreshButton.style.color = UI_COLORS.text;
        refreshButton.style.cursor = 'pointer';
        refreshButton.style.fontFamily = UI_FONT_BODY;

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
        this.restoreWindowPosition(root, 'inventory');

        if (!this.hasRegisteredInventoryDnD) {
            this.registerInventoryDragDropBridges();
            this.hasRegisteredInventoryDnD = true;
        }

        this.refreshInventoryPanel();
    }

    private createBottomActionBar(): void {
        if (this.bottomActionBarRoot || this.utilityPanelRoot) {
            return;
        }

        const root = document.createElement('div');
        root.style.position = 'fixed';
        root.style.left = '0';
        root.style.right = '0';
        root.style.bottom = '0';
        root.style.zIndex = '9996';
        root.style.display = 'flex';
        root.style.alignItems = 'center';
        root.style.justifyContent = 'space-between';
        root.style.gap = '14px';
        root.style.padding = '10px 14px 12px';
        root.style.borderTop = `1px solid ${UI_COLORS.border}`;
        root.style.background = 'radial-gradient(circle at top, rgba(76, 53, 27, 0.4), rgba(13, 9, 6, 0.98) 58%)';
        root.style.boxShadow = '0 -14px 40px rgba(0, 0, 0, 0.5)';
        root.style.backdropFilter = 'blur(6px)';

        const hotkeyStrip = document.createElement('div');
        hotkeyStrip.style.display = 'grid';
        hotkeyStrip.style.gridTemplateColumns = 'repeat(8, 1fr)';
        hotkeyStrip.style.gap = '12px';
        hotkeyStrip.style.flex = '1 1 auto';
        hotkeyStrip.style.minWidth = '0';

        for (let index = 1; index <= 8; index += 1) {
            hotkeyStrip.appendChild(this.createHotkeySlot(index));
        }

        const utilityStrip = document.createElement('div');
        utilityStrip.style.display = 'flex';
        utilityStrip.style.alignItems = 'center';
        utilityStrip.style.gap = '12px';
        utilityStrip.style.flex = '0 0 auto';

        const mapButton = this.createUtilityButton('map', 'M / Shift+M', 'Abrir mapa', 'Mapa');
        mapButton.addEventListener('click', () => this.toggleMapPanel('compact'));
        utilityStrip.appendChild(mapButton);

        const inventoryButton = this.createUtilityButton('inventory', 'B', 'Abrir inventario', 'Inventario');
        inventoryButton.addEventListener('click', () => this.toggleInventoryWindow());
        utilityStrip.appendChild(inventoryButton);

        const armorButton = this.createUtilityButton('armor', 'O', 'Abrir armadura', 'Armor');
        armorButton.addEventListener('click', () => this.toggleArmorWindow());
        utilityStrip.appendChild(armorButton);

        const friendsButton = this.createUtilityButton('friends', 'F', 'Abrir amigos', 'Amigos');
        friendsButton.addEventListener('click', () => this.toggleUtilitySection('friends'));
        utilityStrip.appendChild(friendsButton);

        const usersButton = this.createUtilityButton('users', 'U', 'Ver usuarios conectados', 'Conectados');
        usersButton.addEventListener('click', () => this.toggleUtilitySection('users'));
        utilityStrip.appendChild(usersButton);

        const settingsButton = this.createUtilityButton('settings', 'P', 'Abrir configuración', 'Settings');
        settingsButton.addEventListener('click', () => this.toggleUtilitySection('settings'));
        utilityStrip.appendChild(settingsButton);

        root.appendChild(hotkeyStrip);
        root.appendChild(utilityStrip);
        document.body.appendChild(root);

        this.bottomActionBarRoot = root;
        this.bottomUtilityButtons.set('map', mapButton);
        this.bottomUtilityButtons.set('inventory', inventoryButton);
        this.bottomUtilityButtons.set('friends', friendsButton);
        this.bottomUtilityButtons.set('users', usersButton);
        this.bottomUtilityButtons.set('settings', settingsButton);
        this.bottomUtilityButtons.set('armor', armorButton);

        const keyboard = this.input.keyboard;

        if (keyboard) {
            keyboard.on('keydown-M', (event: KeyboardEvent) => {
                if (!this.isChatInputFocused()) {
                    if (event.shiftKey) {
                        this.toggleMapPanel('compact');
                        return;
                    }

                    this.toggleMapPanel('fullscreen');
                }
            });

            keyboard.on('keydown-F', () => {
                if (!this.isChatInputFocused()) {
                    this.toggleUtilitySection('friends');
                }
            });

            keyboard.on('keydown-U', () => {
                if (!this.isChatInputFocused()) {
                    this.toggleUtilitySection('users');
                }
            });

            keyboard.on('keydown-P', () => {
                if (!this.isChatInputFocused()) {
                    this.toggleUtilitySection('settings');
                }
            });

            keyboard.on('keydown-O', () => {
                if (!this.isChatInputFocused()) {
                    this.toggleArmorWindow();
                }
            });

            keyboard.on('keydown-B', () => {
                if (!this.isChatInputFocused()) {
                    this.toggleInventoryWindow();
                }
            });
        }

        this.createUtilityPanel();
        this.refreshBottomBarState();
        this.refreshUtilityPanel();
    }

    private toggleMapPanel(mode: MapPanelMode): void {
        if (this.currentUtilitySection === 'map' && this.mapPanelMode === mode) {
            this.setCurrentUtilitySection(null);
            return;
        }

        this.mapPanelMode = mode;
        this.setCurrentUtilitySection('map');
    }

    private createHotkeySlot(index: number): HTMLButtonElement {
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.disabled = true;
        slot.title =
            index === 1
                ? 'Hotkey 1 - Ataque basico'
                : `Hotkey ${index} - reservado para spells o items`;
        slot.style.height = '56px';
        slot.style.minWidth = '56px';
        slot.style.padding = '0';
        slot.style.borderRadius = '12px';
        slot.style.border = `1px solid ${UI_COLORS.borderSoft}`;
        slot.style.background = 'linear-gradient(180deg, rgba(62, 41, 21, 0.98) 0%, rgba(24, 16, 10, 0.98) 100%)';
        slot.style.color = UI_COLORS.text;
        slot.style.boxShadow = '0 10px 18px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 235, 190, 0.08)';
        slot.style.display = 'grid';
        slot.style.placeItems = 'center';
        slot.style.position = 'relative';
        slot.style.cursor = 'default';

        const hotkeyBadge = document.createElement('span');
        hotkeyBadge.textContent = String(index);
        hotkeyBadge.style.position = 'absolute';
        hotkeyBadge.style.top = '4px';
        hotkeyBadge.style.left = '4px';
        hotkeyBadge.style.minWidth = '18px';
        hotkeyBadge.style.height = '18px';
        hotkeyBadge.style.padding = '0 4px';
        hotkeyBadge.style.borderRadius = '999px';
        hotkeyBadge.style.display = 'grid';
        hotkeyBadge.style.placeItems = 'center';
        hotkeyBadge.style.fontFamily = UI_FONT_BODY;
        hotkeyBadge.style.fontSize = '11px';
        hotkeyBadge.style.fontWeight = '800';
        hotkeyBadge.style.lineHeight = '1';
        hotkeyBadge.style.color = '#2b1605';
        hotkeyBadge.style.background = 'linear-gradient(180deg, #f3c96f 0%, #d4a857 100%)';
        hotkeyBadge.style.border = '1px solid rgba(77, 49, 20, 0.9)';
        hotkeyBadge.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.35)';
        slot.appendChild(hotkeyBadge);

        const icon = document.createElement('span');
        icon.textContent = index === 1 ? HOTKEY_BASIC_ATTACK_ICON : HOTKEY_EMPTY_ICON;
        icon.style.fontSize = index === 1 ? '26px' : '22px';
        icon.style.textAlign = 'center';
        icon.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.55))';
        slot.appendChild(icon);

        return slot;
    }

    private createUtilityButton(
        utilityName: UtilityWindowName,
        hotkey: string,
        tooltip: string,
        ariaLabel: string
    ): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = `${tooltip} (Hotkey: ${hotkey})`;
        button.setAttribute('aria-label', `${ariaLabel} - hotkey ${hotkey}`);
        button.dataset.utility = utilityName;
        button.style.minWidth = '56px';
        button.style.width = '56px';
        button.style.height = '56px';
        button.style.padding = '0';
        button.style.display = 'grid';
        button.style.placeItems = 'center';
        button.style.borderRadius = '12px';
        button.style.border = `1px solid ${UI_COLORS.border}`;
        button.style.background = 'linear-gradient(180deg, #3f2d1b 0%, #241910 100%)';
        button.style.color = UI_COLORS.text;
        button.style.cursor = 'pointer';
        button.style.fontFamily = UI_FONT_BODY;
        button.style.fontWeight = '700';
        button.style.boxShadow = '0 10px 18px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 235, 190, 0.1)';
        button.style.transition = 'transform 120ms ease, filter 120ms ease, background 120ms ease';

        const iconBadge = document.createElement('span');
        iconBadge.textContent = UTILITY_ICON_BY_NAME[utilityName];
        iconBadge.style.width = '36px';
        iconBadge.style.height = '36px';
        iconBadge.style.display = 'grid';
        iconBadge.style.placeItems = 'center';
        iconBadge.style.borderRadius = '10px';
        iconBadge.style.border = `1px solid ${UI_COLORS.borderSoft}`;
        iconBadge.style.background = 'linear-gradient(180deg, rgba(95, 67, 34, 0.9) 0%, rgba(45, 30, 16, 0.95) 100%)';
        iconBadge.style.fontSize = '20px';
        iconBadge.style.filter = 'drop-shadow(0 1px 1px rgba(0,0,0,0.45))';

        button.appendChild(iconBadge);

        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-1px)';
            button.style.filter = 'brightness(1.04)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateY(0)';
            button.style.filter = 'none';
        });

        return button;
    }

    private createUtilityPanel(): void {
        if (this.utilityPanelRoot) {
            return;
        }

        const root = document.createElement('div');
        root.style.position = 'fixed';
        root.style.left = '12px';
        root.style.bottom = '92px';
        root.style.width = '340px';
        root.style.zIndex = '9995';
        root.style.display = 'none';
        root.style.padding = '12px';
        root.style.gap = '10px';
        root.style.borderRadius = '14px';
        root.style.border = `1px solid ${UI_COLORS.border}`;
        root.style.background = UI_COLORS.panel;
        root.style.boxShadow = UI_COLORS.shadow;
        root.style.backdropFilter = 'blur(6px)';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '8px';

        const title = document.createElement('div');
        title.style.fontFamily = UI_FONT_TITLE;
        title.style.fontSize = '16px';
        title.style.color = UI_COLORS.text;
        title.style.textShadow = '0 1px 0 #000';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.title = 'Cerrar panel';
        closeButton.textContent = '×';
        closeButton.style.width = '30px';
        closeButton.style.height = '30px';
        closeButton.style.borderRadius = '8px';
        closeButton.style.border = `1px solid ${UI_COLORS.border}`;
        closeButton.style.background = 'linear-gradient(180deg, #4f2218 0%, #2f120d 100%)';
        closeButton.style.color = UI_COLORS.text;
        closeButton.style.cursor = 'pointer';
        closeButton.style.fontFamily = UI_FONT_TITLE;
        closeButton.style.fontSize = '20px';
        closeButton.style.lineHeight = '1';

        closeButton.addEventListener('click', () => {
            this.setCurrentUtilitySection(null);
        });

        header.appendChild(title);
        header.appendChild(closeButton);

        const content = document.createElement('div');
        content.style.display = 'grid';
        content.style.gap = '10px';
        content.style.minHeight = '0';
        content.style.overflow = 'hidden';
        content.style.color = UI_COLORS.text;
        content.style.fontFamily = UI_FONT_BODY;

        root.appendChild(header);
        root.appendChild(content);
        document.body.appendChild(root);

        this.utilityPanelRoot = root;
        this.utilityPanelTitle = title;
        this.utilityPanelContent = content;
        this.enableInventoryWindowDragging(root, header);
    }

    private setCurrentUtilitySection(section: UtilityPanelSection | null): void {
        const previousSection = this.currentUtilitySection;

        if (previousSection !== null && this.utilityPanelRoot) {
            this.saveWindowPosition(this.utilityPanelRoot, previousSection);
        }

        if (previousSection === 'settings' && section !== 'settings') {
            this.stopSettingsLatencyPolling();
        }

        this.currentUtilitySection = section;

        if (!this.utilityPanelRoot) {
            this.createUtilityPanel();
        }

        if (this.utilityPanelRoot) {
            if (section !== null) {
                this.restoreWindowPosition(this.utilityPanelRoot, section);
            }

            this.utilityPanelRoot.style.display = section === null ? 'none' : 'grid';
            this.applyUtilityPanelLayout();
        }

        this.refreshUtilityPanel();
        this.refreshBottomBarState();

        if (section === 'settings') {
            this.startSettingsLatencyPolling();
        }
    }

    private applyUtilityPanelLayout(): void {
        if (!this.utilityPanelRoot) {
            return;
        }

        if (this.currentUtilitySection === 'map' && this.mapPanelMode === 'fullscreen') {
            this.utilityPanelRoot.style.width = 'min(96vw, 1180px)';
            this.utilityPanelRoot.style.height = 'min(86vh, 760px)';
            this.utilityPanelRoot.style.left = '50%';
            this.utilityPanelRoot.style.top = '50%';
            this.utilityPanelRoot.style.right = 'auto';
            this.utilityPanelRoot.style.bottom = 'auto';
            this.utilityPanelRoot.style.transform = 'translate(-50%, -50%)';
            return;
        }

        this.utilityPanelRoot.style.width = '340px';
        this.utilityPanelRoot.style.height = 'auto';
        this.utilityPanelRoot.style.transform = 'none';

        if (this.currentUtilitySection === null) {
            this.utilityPanelRoot.style.left = '12px';
            this.utilityPanelRoot.style.bottom = '92px';
            this.utilityPanelRoot.style.right = 'auto';
            this.utilityPanelRoot.style.top = 'auto';
        }
    }

    private toggleUtilitySection(section: UtilityPanelSection): void {
        if (this.currentUtilitySection === section) {
            this.setCurrentUtilitySection(null);
            return;
        }

        this.setCurrentUtilitySection(section);

        if (section === 'friends') {
            this.requestFriendsSync();
        }
    }

    private refreshBottomBarState(): void {
        this.setButtonActive('map', this.currentUtilitySection === 'map');
        this.setButtonActive('inventory', this.isInventoryWindowOpen);
        this.setButtonActive('friends', this.currentUtilitySection === 'friends');
        this.setButtonActive('users', this.currentUtilitySection === 'users');
        this.setButtonActive('settings', this.currentUtilitySection === 'settings');
        this.setButtonActive('armor', this.isArmorWindowOpen);
    }

    private setButtonActive(name: UtilityWindowName, isActive: boolean): void {
        const button = this.bottomUtilityButtons.get(name);

        if (!button) {
            return;
        }

        if (isActive) {
            button.style.background = 'linear-gradient(180deg, #d4a857 0%, #8f6320 100%)';
            button.style.color = '#2b1605';
            button.style.borderColor = '#f3c96f';
            button.style.boxShadow = '0 10px 20px rgba(212, 168, 87, 0.35), inset 0 1px 0 rgba(255, 245, 210, 0.25)';
            return;
        }

        button.style.background = 'linear-gradient(180deg, #3f2d1b 0%, #241910 100%)';
        button.style.color = UI_COLORS.text;
        button.style.borderColor = UI_COLORS.border;
        button.style.boxShadow = '0 10px 18px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 235, 190, 0.1)';
    }

    private refreshUtilityPanel(): void {
        if (!this.utilityPanelRoot || !this.utilityPanelTitle || !this.utilityPanelContent) {
            return;
        }

        this.utilityPanelContent.replaceChildren();

        if (this.currentUtilitySection === null) {
            this.utilityPanelTitle.textContent = '';
            return;
        }

        if (this.currentUtilitySection === 'map') {
            this.utilityPanelTitle.textContent = 'Mapa';
            this.renderMapPanel();
            return;
        }

        if (this.currentUtilitySection === 'friends') {
            this.utilityPanelTitle.textContent = 'Amigos';
            this.renderFriendsPanel();
            return;
        }

        if (this.currentUtilitySection === 'users') {
            this.utilityPanelTitle.textContent = 'Usuarios conectados';
            this.renderConnectedUsersPanel();
            return;
        }

        if (this.currentUtilitySection === 'settings') {
            this.utilityPanelTitle.textContent = 'Settings';
            this.renderSettingsPanel();
        }
    }

    private renderMapPanel(): void {
        if (!this.utilityPanelContent || !this.utilityPanelRoot) {
            return;
        }

        const isFullscreen = this.mapPanelMode === 'fullscreen';
        const panelWidth = this.utilityPanelRoot.clientWidth;
        const panelHeight = this.utilityPanelRoot.clientHeight;
        const compactCanvasSize = 240;
        const fullscreenAvailable = Math.floor(
            Math.min(
                panelWidth - 44,
                panelHeight - 190
            )
        );
        const canvasSize = isFullscreen
            ? Math.max(180, fullscreenAvailable)
            : compactCanvasSize;

        const title = document.createElement('div');
        title.textContent = isFullscreen
            ? 'Vista completa del mundo (fullscreen)'
            : 'Vista completa del mundo';
        title.style.fontFamily = UI_FONT_BODY;
        title.style.color = UI_COLORS.textSoft;
        title.style.fontSize = '11px';

        const coords = document.createElement('div');
        const tileX = this.player?.tileX ?? 0;
        const tileY = this.player?.tileY ?? 0;
        coords.textContent = `Posición actual: ${tileX}, ${tileY}`;
        coords.style.fontFamily = UI_FONT_BODY;
        coords.style.color = UI_COLORS.accentStrong;
        coords.style.fontSize = '12px';

        const zoomControls = document.createElement('div');
        zoomControls.style.display = 'flex';
        zoomControls.style.alignItems = 'center';
        zoomControls.style.justifyContent = 'center';
        zoomControls.style.gap = '8px';

        const zoomOutButton = document.createElement('button');
        zoomOutButton.type = 'button';
        zoomOutButton.textContent = '-';
        zoomOutButton.title = 'Zoom out';
        zoomOutButton.style.width = '32px';
        zoomOutButton.style.height = '28px';
        zoomOutButton.style.borderRadius = '8px';
        zoomOutButton.style.border = `1px solid ${UI_COLORS.border}`;
        zoomOutButton.style.background = 'linear-gradient(180deg, #4a3420 0%, #2a1b11 100%)';
        zoomOutButton.style.color = UI_COLORS.text;
        zoomOutButton.style.cursor = 'pointer';
        zoomOutButton.style.fontFamily = UI_FONT_BODY;
        zoomOutButton.style.fontSize = '16px';
        zoomOutButton.addEventListener('click', () => {
            this.adjustMapPreviewZoom(-this.mapPreviewZoomStep);
        });

        const zoomLabel = document.createElement('span');
        zoomLabel.textContent = `Zoom x${this.mapPreviewZoom.toFixed(2)}`;
        zoomLabel.style.fontFamily = UI_FONT_BODY;
        zoomLabel.style.fontSize = '12px';
        zoomLabel.style.color = UI_COLORS.textSoft;

        const zoomInButton = document.createElement('button');
        zoomInButton.type = 'button';
        zoomInButton.textContent = '+';
        zoomInButton.title = 'Zoom in';
        zoomInButton.style.width = '32px';
        zoomInButton.style.height = '28px';
        zoomInButton.style.borderRadius = '8px';
        zoomInButton.style.border = `1px solid ${UI_COLORS.border}`;
        zoomInButton.style.background = 'linear-gradient(180deg, #4a3420 0%, #2a1b11 100%)';
        zoomInButton.style.color = UI_COLORS.text;
        zoomInButton.style.cursor = 'pointer';
        zoomInButton.style.fontFamily = UI_FONT_BODY;
        zoomInButton.style.fontSize = '16px';
        zoomInButton.addEventListener('click', () => {
            this.adjustMapPreviewZoom(this.mapPreviewZoomStep);
        });

        zoomControls.appendChild(zoomOutButton);
        zoomControls.appendChild(zoomLabel);
        zoomControls.appendChild(zoomInButton);

        const loader = document.createElement('div');
        loader.style.fontFamily = UI_FONT_BODY;
        loader.style.fontSize = '12px';
        loader.style.color = UI_COLORS.accentStrong;
        loader.style.textAlign = 'center';
        loader.style.minHeight = '16px';
        loader.textContent = this.isMapPreviewLoading
            ? 'Cargando mapa...'
            : '';

        const mapFrame = document.createElement('div');
        mapFrame.style.display = 'flex';
        mapFrame.style.alignItems = 'center';
        mapFrame.style.justifyContent = 'center';
        mapFrame.style.width = '100%';
        mapFrame.style.minHeight = isFullscreen ? '0' : 'auto';
        mapFrame.style.flex = isFullscreen ? '1 1 auto' : '0 0 auto';

        const canvas = document.createElement('canvas');
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        canvas.style.width = `${canvasSize}px`;
        canvas.style.maxWidth = '100%';
        canvas.style.height = 'auto';
        canvas.style.maxHeight = isFullscreen ? '100%' : 'none';
        canvas.style.display = 'block';
        canvas.style.borderRadius = '10px';
        canvas.style.border = `1px solid ${UI_COLORS.borderSoft}`;
        canvas.style.background = 'rgba(8, 8, 8, 0.55)';
        canvas.style.boxShadow = 'inset 0 0 0 1px rgba(255, 255, 255, 0.04)';

        mapFrame.appendChild(canvas);

        const context = canvas.getContext('2d');

        if (context) {
            this.drawWorldMapPreview(
                context,
                canvas.width,
                canvas.height,
                tileX,
                tileY,
                this.mapPreviewZoom
            );
        }

        const legend = document.createElement('div');
        legend.style.fontFamily = UI_FONT_BODY;
        legend.style.fontSize = '11px';
        legend.style.color = UI_COLORS.textSoft;
        legend.textContent = isFullscreen
            ? 'Marcador dorado = tu posición | M: fullscreen | Shift+M: compacto'
            : 'Marcador dorado = tu posición | M: fullscreen | Shift+M: compacto';

        this.utilityPanelContent.appendChild(title);
        this.utilityPanelContent.appendChild(coords);
        this.utilityPanelContent.appendChild(zoomControls);
        this.utilityPanelContent.appendChild(loader);
        this.utilityPanelContent.appendChild(mapFrame);
        this.utilityPanelContent.appendChild(legend);
    }

    private adjustMapPreviewZoom(delta: number): void {
        if (this.mapPreviewLoadingTimeoutId !== null) {
            window.clearTimeout(this.mapPreviewLoadingTimeoutId);
            this.mapPreviewLoadingTimeoutId = null;
        }

        if (delta < 0) {
            this.isMapPreviewLoading = true;

            if (this.currentUtilitySection === 'map') {
                this.refreshUtilityPanel();
            }

            this.mapPreviewLoadingTimeoutId = window.setTimeout(() => {
                this.mapPreviewLoadingTimeoutId = null;
                this.applyMapPreviewZoomDelta(delta);
            }, 120);

            return;
        }

        this.applyMapPreviewZoomDelta(delta);
    }

    private applyMapPreviewZoomDelta(delta: number): void {
        const nextZoom = this.mapPreviewZoom + delta;
        this.mapPreviewZoom = Math.max(
            this.mapPreviewMinZoom,
            Math.min(this.mapPreviewMaxZoom, nextZoom)
        );
        this.isMapPreviewLoading = false;

        if (this.currentUtilitySection === 'map') {
            this.refreshUtilityPanel();
        }
    }

    private renderFriendsPanel(): void {
        if (!this.utilityPanelContent) {
            return;
        }

        const requestRow = document.createElement('div');
        requestRow.style.display = 'grid';
        requestRow.style.gridTemplateColumns = '1fr auto';
        requestRow.style.gap = '8px';

        const addFriendInput = document.createElement('input');
        addFriendInput.type = 'text';
        addFriendInput.placeholder = 'Nombre del personaje';
        addFriendInput.style.padding = '8px 10px';
        addFriendInput.style.borderRadius = '10px';
        addFriendInput.style.border = `1px solid ${UI_COLORS.borderSoft}`;
        addFriendInput.style.background = 'rgba(9, 10, 12, 0.95)';
        addFriendInput.style.color = UI_COLORS.text;
        addFriendInput.style.fontFamily = UI_FONT_BODY;
        addFriendInput.style.fontSize = '12px';
        addFriendInput.style.outline = 'none';

        const addFriendButton = document.createElement('button');
        addFriendButton.type = 'button';
        addFriendButton.title = 'Enviar solicitud de amistad';
        addFriendButton.textContent = '+';
        addFriendButton.style.width = '38px';
        addFriendButton.style.height = '38px';
        addFriendButton.style.borderRadius = '10px';
        addFriendButton.style.border = `1px solid ${UI_COLORS.border}`;
        addFriendButton.style.background = 'linear-gradient(180deg, #d4a857 0%, #8f6320 100%)';
        addFriendButton.style.color = '#2b1605';
        addFriendButton.style.cursor = 'pointer';
        addFriendButton.style.fontFamily = UI_FONT_TITLE;
        addFriendButton.style.fontSize = '22px';
        addFriendButton.style.lineHeight = '1';

        const submitFriendRequest = (): void => {
            const targetName = addFriendInput.value.trim();

            if (targetName.length < 3) {
                this.uiScene.logChatMessage('[Sistema] Escribe un nombre valido.');
                return;
            }

            this.sendFriendRequest(targetName);
            addFriendInput.value = '';
        };

        addFriendButton.addEventListener('click', submitFriendRequest);
        addFriendInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitFriendRequest();
            }
        });

        requestRow.appendChild(addFriendInput);
        requestRow.appendChild(addFriendButton);

        const pendingTitle = document.createElement('div');
        pendingTitle.textContent = 'Invitaciones pendientes';
        pendingTitle.style.fontFamily = UI_FONT_TITLE;
        pendingTitle.style.fontSize = '13px';
        pendingTitle.style.color = UI_COLORS.text;

        const pendingList = document.createElement('div');
        pendingList.style.display = 'grid';
        pendingList.style.gap = '6px';

        if (this.pendingFriendInvites.length === 0) {
            const emptyPending = document.createElement('div');
            emptyPending.textContent = 'No tienes invitaciones pendientes.';
            emptyPending.style.fontFamily = UI_FONT_BODY;
            emptyPending.style.fontSize = '12px';
            emptyPending.style.color = UI_COLORS.textSoft;
            pendingList.appendChild(emptyPending);
        } else {
            for (const invite of this.pendingFriendInvites) {
                const row = document.createElement('div');
                row.style.display = 'grid';
                row.style.gridTemplateColumns = '1fr auto auto';
                row.style.gap = '6px';
                row.style.alignItems = 'center';
                row.style.padding = '8px';
                row.style.borderRadius = '10px';
                row.style.border = `1px solid ${UI_COLORS.borderSoft}`;
                row.style.background = 'rgba(8, 8, 8, 0.35)';

                const label = document.createElement('div');
                label.textContent = invite.fromName;
                label.style.fontFamily = UI_FONT_BODY;
                label.style.fontSize = '12px';
                label.style.color = UI_COLORS.text;

                const acceptButton = document.createElement('button');
                acceptButton.type = 'button';
                acceptButton.textContent = 'Aceptar';
                acceptButton.style.padding = '6px 8px';
                acceptButton.style.borderRadius = '8px';
                acceptButton.style.border = `1px solid ${UI_COLORS.border}`;
                acceptButton.style.background = 'linear-gradient(180deg, #4c7b2a 0%, #2d4f16 100%)';
                acceptButton.style.color = '#e8ffd8';
                acceptButton.style.cursor = 'pointer';
                acceptButton.style.fontFamily = UI_FONT_BODY;
                acceptButton.style.fontSize = '11px';
                acceptButton.addEventListener('click', () => {
                    this.sendFriendResponse(invite.requestId, true);
                });

                const rejectButton = document.createElement('button');
                rejectButton.type = 'button';
                rejectButton.textContent = 'Rechazar';
                rejectButton.style.padding = '6px 8px';
                rejectButton.style.borderRadius = '8px';
                rejectButton.style.border = `1px solid ${UI_COLORS.border}`;
                rejectButton.style.background = 'linear-gradient(180deg, #713f2d 0%, #4f2218 100%)';
                rejectButton.style.color = '#ffe9dc';
                rejectButton.style.cursor = 'pointer';
                rejectButton.style.fontFamily = UI_FONT_BODY;
                rejectButton.style.fontSize = '11px';
                rejectButton.addEventListener('click', () => {
                    this.sendFriendResponse(invite.requestId, false);
                });

                row.appendChild(label);
                row.appendChild(acceptButton);
                row.appendChild(rejectButton);
                pendingList.appendChild(row);
            }
        }

        const friendsTitle = document.createElement('div');
        friendsTitle.textContent = 'Amigos';
        friendsTitle.style.fontFamily = UI_FONT_TITLE;
        friendsTitle.style.fontSize = '13px';
        friendsTitle.style.color = UI_COLORS.text;

        const friendsList = document.createElement('div');
        friendsList.style.display = 'grid';
        friendsList.style.gap = '6px';

        if (this.friendsList.length === 0) {
            const emptyFriends = document.createElement('div');
            emptyFriends.textContent = 'Todavia no tienes amigos agregados.';
            emptyFriends.style.fontFamily = UI_FONT_BODY;
            emptyFriends.style.fontSize = '12px';
            emptyFriends.style.color = UI_COLORS.textSoft;
            friendsList.appendChild(emptyFriends);
        } else {
            for (const friend of this.friendsList) {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.padding = '8px 10px';
                row.style.borderRadius = '10px';
                row.style.border = `1px solid ${UI_COLORS.borderSoft}`;
                row.style.background = 'rgba(8, 8, 8, 0.35)';

                const name = document.createElement('span');
                name.textContent = friend.name;
                name.style.fontFamily = UI_FONT_BODY;
                name.style.fontSize = '12px';
                name.style.color = UI_COLORS.text;

                const status = document.createElement('span');
                status.textContent = friend.online ? 'Online' : 'Offline';
                status.style.fontFamily = UI_FONT_BODY;
                status.style.fontSize = '11px';
                status.style.color = friend.online
                    ? UI_COLORS.success
                    : UI_COLORS.textSoft;

                row.appendChild(name);
                row.appendChild(status);
                friendsList.appendChild(row);
            }
        }

        this.utilityPanelContent.appendChild(requestRow);
        this.utilityPanelContent.appendChild(pendingTitle);
        this.utilityPanelContent.appendChild(pendingList);
        this.utilityPanelContent.appendChild(friendsTitle);
        this.utilityPanelContent.appendChild(friendsList);
    }

    private renderConnectedUsersPanel(): void {
        if (!this.utilityPanelContent) {
            return;
        }

        const players = this.getConnectedPlayerNames();

        const summary = document.createElement('div');
        summary.style.fontFamily = UI_FONT_BODY;
        summary.style.fontSize = '12px';
        summary.style.color = UI_COLORS.textSoft;
        summary.textContent = `Conectados: ${players.length}`;

        const list = document.createElement('div');
        list.style.display = 'grid';
        list.style.gap = '6px';

        if (players.length === 0) {
            const empty = document.createElement('div');
            empty.style.fontFamily = UI_FONT_BODY;
            empty.style.fontSize = '12px';
            empty.style.color = UI_COLORS.textSoft;
            empty.textContent = 'Todavía no hay otros jugadores conectados.';
            list.appendChild(empty);
        } else {
            for (const playerName of players) {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.padding = '8px 10px';
                row.style.borderRadius = '10px';
                row.style.border = `1px solid ${UI_COLORS.borderSoft}`;
                row.style.background = 'rgba(8, 8, 8, 0.35)';

                const name = document.createElement('span');
                name.textContent = playerName;
                name.style.fontFamily = UI_FONT_BODY;
                name.style.color = UI_COLORS.text;

                const status = document.createElement('span');
                status.textContent = 'Online';
                status.style.fontFamily = UI_FONT_BODY;
                status.style.fontSize = '11px';
                status.style.color = UI_COLORS.success;

                row.appendChild(name);
                row.appendChild(status);
                list.appendChild(row);
            }
        }

        this.utilityPanelContent.appendChild(summary);
        this.utilityPanelContent.appendChild(list);
    }

    private renderSettingsPanel(): void {
        if (!this.utilityPanelContent) {
            return;
        }

        const statusRow = document.createElement('div');
        statusRow.style.display = 'flex';
        statusRow.style.alignItems = 'center';
        statusRow.style.gap = '8px';
        statusRow.style.padding = '8px 10px';
        statusRow.style.borderRadius = '10px';
        statusRow.style.border = `1px solid ${UI_COLORS.borderSoft}`;
        statusRow.style.background = 'rgba(8, 8, 8, 0.35)';

        const statusDot = document.createElement('span');
        statusDot.style.width = '10px';
        statusDot.style.height = '10px';
        statusDot.style.borderRadius = '50%';

        if (this.connectionHealth === 'ok') {
            statusDot.style.background = '#4cd964';
        } else if (this.connectionHealth === 'warn') {
            statusDot.style.background = '#ffd166';
        } else if (this.connectionHealth === 'error') {
            statusDot.style.background = '#ff4d4d';
        } else {
            statusDot.style.background = '#8a8a8a';
        }

        const statusText = document.createElement('span');
        statusText.style.fontFamily = UI_FONT_BODY;
        statusText.style.fontSize = '12px';
        statusText.style.color = UI_COLORS.text;
        statusText.textContent =
            this.connectionHealth === 'ok'
                ? 'Conexión estable'
                : this.connectionHealth === 'warn'
                    ? 'Conexión con latencia alta'
                    : this.connectionHealth === 'error'
                        ? 'Error de conexión'
                        : 'Estado de conexión desconocido';

        statusRow.appendChild(statusDot);
        statusRow.appendChild(statusText);

        const latency = document.createElement('div');
        latency.style.fontFamily = UI_FONT_BODY;
        latency.style.fontSize = '13px';
        latency.style.color = UI_COLORS.text;
        latency.style.padding = '8px 10px';
        latency.style.borderRadius = '10px';
        latency.style.border = `1px solid ${UI_COLORS.borderSoft}`;
        latency.style.background = 'rgba(8, 8, 8, 0.35)';
        latency.textContent =
            this.settingsLatencyMs === null
                ? 'Latencia servidor: calculando...'
                : `Latencia servidor: ${this.settingsLatencyMs} ms`;

        const actions = document.createElement('div');
        actions.style.display = 'grid';
        actions.style.gap = '8px';

        const fullScreenButton = document.createElement('button');
        fullScreenButton.type = 'button';
        fullScreenButton.textContent =
            document.fullscreenElement === null
                ? 'Modo pantalla completa'
                : 'Salir de pantalla completa';
        applyButtonStyle(fullScreenButton, 'secondary');
        fullScreenButton.style.maxWidth = 'none';
        fullScreenButton.style.width = '100%';
        fullScreenButton.addEventListener('click', () => {
            void this.toggleFullscreenMode();
        });

        const logoutButton = document.createElement('button');
        logoutButton.type = 'button';
        logoutButton.textContent = 'Cerrar sesión';
        applyButtonStyle(logoutButton, 'danger');
        logoutButton.style.maxWidth = 'none';
        logoutButton.style.width = '100%';
        logoutButton.addEventListener('click', () => {
            this.closeSession();
        });

        actions.appendChild(fullScreenButton);
        actions.appendChild(logoutButton);

        this.utilityPanelContent.appendChild(statusRow);
        this.utilityPanelContent.appendChild(latency);
        this.utilityPanelContent.appendChild(actions);
    }

    private toggleArmorWindow(): void {
        if (!this.armorModalRoot) {
            this.createArmorModal();
        }

        if (!this.armorModalRoot) {
            return;
        }

        this.isArmorWindowOpen = !this.isArmorWindowOpen;

        if (this.isArmorWindowOpen) {
            this.restoreWindowPosition(this.armorModalRoot, 'armor');
        } else {
            this.saveWindowPosition(this.armorModalRoot, 'armor');
        }

        this.armorModalRoot.style.display = this.isArmorWindowOpen ? 'grid' : 'none';
        this.refreshBottomBarState();
    }

    private createArmorModal(): void {
        const root = document.createElement('div');
        root.style.position = 'fixed';
        root.style.left = '20px';
        root.style.bottom = '92px';
        root.style.width = '320px';
        root.style.zIndex = '9995';
        root.style.display = 'none';
        root.style.padding = '12px';
        root.style.gap = '10px';
        root.style.borderRadius = '14px';
        root.style.border = `1px solid ${UI_COLORS.border}`;
        root.style.background = UI_COLORS.panel;
        root.style.boxShadow = UI_COLORS.shadow;
        root.style.backdropFilter = 'blur(6px)';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '8px';
        header.style.cursor = 'move';
        header.style.userSelect = 'none';

        const title = document.createElement('div');
        title.textContent = 'Armor';
        title.style.fontFamily = UI_FONT_TITLE;
        title.style.fontSize = '16px';
        title.style.color = UI_COLORS.text;

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = '×';
        closeButton.title = 'Cerrar armadura';
        closeButton.style.width = '30px';
        closeButton.style.height = '30px';
        closeButton.style.borderRadius = '8px';
        closeButton.style.border = `1px solid ${UI_COLORS.border}`;
        closeButton.style.background = 'linear-gradient(180deg, #4f2218 0%, #2f120d 100%)';
        closeButton.style.color = UI_COLORS.text;
        closeButton.style.cursor = 'pointer';
        closeButton.style.fontFamily = UI_FONT_TITLE;
        closeButton.style.fontSize = '20px';
        closeButton.style.lineHeight = '1';
        closeButton.addEventListener('click', () => {
            this.toggleArmorWindow();
        });

        header.appendChild(title);
        header.appendChild(closeButton);

        const placeholder = document.createElement('div');
        placeholder.style.fontFamily = UI_FONT_BODY;
        placeholder.style.fontSize = '12px';
        placeholder.style.color = UI_COLORS.textSoft;
        placeholder.style.lineHeight = '1.5';
        placeholder.style.padding = '8px 10px';
        placeholder.style.borderRadius = '10px';
        placeholder.style.border = `1px solid ${UI_COLORS.borderSoft}`;
        placeholder.style.background = 'rgba(8, 8, 8, 0.35)';
        placeholder.textContent =
            'Panel de armadura placeholder. Aquí se mostrará equipo, resistencias y stats defensivos.';

        root.appendChild(header);
        root.appendChild(placeholder);
        document.body.appendChild(root);

        this.enableInventoryWindowDragging(root, header);
        this.armorModalRoot = root;
    }

    private startSettingsLatencyPolling(): void {
        if (this.settingsLatencyIntervalId !== null) {
            return;
        }

        void this.updateSettingsLatency();
        this.settingsLatencyIntervalId = window.setInterval(() => {
            void this.updateSettingsLatency();
        }, 5000);
    }

    private stopSettingsLatencyPolling(): void {
        if (this.settingsLatencyIntervalId === null) {
            return;
        }

        window.clearInterval(this.settingsLatencyIntervalId);
        this.settingsLatencyIntervalId = null;
    }

    private async updateSettingsLatency(): Promise<void> {
        const endpoint = this.resolveAuthEndpoint();
        const normalizedEndpoint = endpoint.endsWith('/')
            ? endpoint.slice(0, -1)
            : endpoint;
        const startAt = performance.now();

        try {
            const response = await fetch(`${normalizedEndpoint}/health`, {
                method: 'GET',
                cache: 'no-store'
            });

            if (!response.ok) {
                this.settingsLatencyMs = null;
                this.connectionHealth = 'error';
            } else {
                this.settingsLatencyMs = Math.max(1, Math.round(performance.now() - startAt));
                this.connectionHealth = this.settingsLatencyMs > 100 ? 'warn' : 'ok';
            }
        } catch {
            this.settingsLatencyMs = null;
            this.connectionHealth = 'error';
        }

        if (this.currentUtilitySection === 'settings') {
            this.refreshUtilityPanel();
        }
    }

    private async toggleFullscreenMode(): Promise<void> {
        if (document.fullscreenElement === null) {
            await document.documentElement.requestFullscreen();
        } else {
            await document.exitFullscreen();
        }

        if (this.currentUtilitySection === 'settings') {
            this.refreshUtilityPanel();
        }
    }

    private closeSession(): void {
        this.authToken = null;
        this.localCharacterId = null;
        this.localSessionId = null;
        window.location.reload();
    }

    private getConnectedPlayerNames(): string[] {
        const names = new Set<string>();

        if (this.localPlayerName) {
            names.add(this.localPlayerName);
        }

        for (const visual of this.networkPlayers.values()) {
            names.add(visual.nameLabel.text);
        }

        return [...names].sort((left, right) => left.localeCompare(right));
    }

    private getTileTypeAt(tileX: number, tileY: number): TileType | null {
        if (
            tileX < 0 ||
            tileY < 0 ||
            tileX >= MAP_WIDTH_IN_TILES ||
            tileY >= MAP_HEIGHT_IN_TILES
        ) {
            return null;
        }

        const override = this.worldTileOverrides.get(`${tileX}:${tileY}`);

        if (override && override.tileType >= 0) {
            return override.tileType as TileType;
        }

        return WORLD_MAP[tileY][tileX];
    }

    private isTileWalkableForPathfinding(tileX: number, tileY: number): boolean {
        if (!this.isTileInsideWorld(tileX, tileY)) {
            return false;
        }

        const override = this.worldTileOverrides.get(`${tileX}:${tileY}`);

        if (override) {
            if (override.walkableMode === 1) {
                return true;
            }

            if (override.walkableMode === 0) {
                return false;
            }

            if (override.tileType >= 0) {
                return !isBlockingTile(override.tileType as TileType);
            }
        }

        return this.collisionSystem.isWalkable(tileX, tileY);
    }

    private getMiniMapTileColor(tile: TileType | null): string {
        if (tile === null) {
            return 'rgba(255, 255, 255, 0.04)';
        }

        switch (tile) {
            case TileType.Water:
                return '#255f87';
            case TileType.Bridge:
            case TileType.Road:
                return '#7b5a30';
            case TileType.Wall:
            case TileType.HouseRoof:
                return '#5b4334';
            case TileType.HouseFloor:
                return '#8d6b43';
            case TileType.Garden:
                return '#5e8141';
            case TileType.Fence:
                return '#72542f';
            case TileType.Tree:
            case TileType.Bush:
                return '#305d2e';
            case TileType.Rock:
            case TileType.Statue:
            case TileType.Crate:
                return '#6f6654';
            case TileType.MarketStall:
                return '#8a4d2a';
            case TileType.LampPost:
                return '#d4a857';
            case TileType.Fountain:
                return '#5a88a8';
            case TileType.Banner:
                return '#a73d3d';
            case TileType.Flower:
                return '#7b4ea3';
            default:
                return '#4b6b3a';
        }
    }

    private drawWorldMapPreview(
        context: CanvasRenderingContext2D,
        width: number,
        height: number,
        playerTileX: number,
        playerTileY: number,
        zoom: number
    ): void {
        const baseCellSize = Math.min(
            width / MAP_WIDTH_IN_TILES,
            height / MAP_HEIGHT_IN_TILES
        );
        const cellSize = baseCellSize * zoom;
        const mapWidthPx = cellSize * MAP_WIDTH_IN_TILES;
        const mapHeightPx = cellSize * MAP_HEIGHT_IN_TILES;
        let offsetX = (width - mapWidthPx) / 2;
        let offsetY = (height - mapHeightPx) / 2;

        if (zoom > 1) {
            offsetX = width / 2 - (playerTileX + 0.5) * cellSize;
            offsetY = height / 2 - (playerTileY + 0.5) * cellSize;

            if (mapWidthPx > width) {
                offsetX = Math.min(0, Math.max(width - mapWidthPx, offsetX));
            }

            if (mapHeightPx > height) {
                offsetY = Math.min(0, Math.max(height - mapHeightPx, offsetY));
            }
        }

        context.clearRect(0, 0, width, height);
        context.fillStyle = '#0b0b0b';
        context.fillRect(0, 0, width, height);

        const startTileX = Math.max(0, Math.floor(-offsetX / cellSize) - 1);
        const endTileX = Math.min(
            MAP_WIDTH_IN_TILES - 1,
            Math.ceil((width - offsetX) / cellSize) + 1
        );
        const startTileY = Math.max(0, Math.floor(-offsetY / cellSize) - 1);
        const endTileY = Math.min(
            MAP_HEIGHT_IN_TILES - 1,
            Math.ceil((height - offsetY) / cellSize) + 1
        );

        for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
            for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
                const tile = this.getTileTypeAt(tileX, tileY);
                context.fillStyle = this.getMiniMapTileColor(tile);
                context.fillRect(
                    offsetX + tileX * cellSize,
                    offsetY + tileY * cellSize,
                    cellSize,
                    cellSize
                );
            }
        }

        context.strokeStyle = 'rgba(255, 255, 255, 0.10)';
        context.lineWidth = 1;

        const gridStep = Math.max(
            8,
            Math.floor(Math.max(MAP_WIDTH_IN_TILES, MAP_HEIGHT_IN_TILES) / 20)
        );

        for (let tileY = 0; tileY < MAP_HEIGHT_IN_TILES; tileY += gridStep) {
            const y = offsetY + tileY * cellSize + 0.5;
            context.beginPath();
            context.moveTo(offsetX, y);
            context.lineTo(offsetX + mapWidthPx, y);
            context.stroke();
        }

        for (let tileX = 0; tileX < MAP_WIDTH_IN_TILES; tileX += gridStep) {
            const x = offsetX + tileX * cellSize + 0.5;
            context.beginPath();
            context.moveTo(x, offsetY);
            context.lineTo(x, offsetY + mapHeightPx);
            context.stroke();
        }

        const markerX = offsetX + playerTileX * cellSize;
        const markerY = offsetY + playerTileY * cellSize;

        context.fillStyle = '#f3c96f';
        context.strokeStyle = '#2b1605';
        context.lineWidth = 1;
        context.beginPath();
        context.arc(
            markerX + cellSize / 2,
            markerY + cellSize / 2,
            Math.max(2, cellSize * 1.5),
            0,
            Math.PI * 2
        );
        context.fill();
        context.stroke();

        context.fillStyle = 'rgba(255, 255, 255, 0.16)';
        context.fillRect(offsetX, offsetY, mapWidthPx, 1);
        context.fillRect(offsetX, offsetY + mapHeightPx - 1, mapWidthPx, 1);
        context.fillRect(offsetX, offsetY, 1, mapHeightPx);
        context.fillRect(offsetX + mapWidthPx - 1, offsetY, 1, mapHeightPx);
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
            if (dragging) {
                const key = this.resolveWindowPositionKey(root);

                if (key) {
                    this.saveWindowPosition(root, key);
                }
            }

            dragging = false;
        });
    }

    private resolveWindowPositionKey(root: HTMLDivElement): WindowPositionKey | null {
        if (root === this.inventoryUiRoot) {
            return 'inventory';
        }

        if (root === this.armorModalRoot) {
            return 'armor';
        }

        if (root === this.utilityPanelRoot) {
            return this.currentUtilitySection;
        }

        return null;
    }

    private saveWindowPosition(root: HTMLDivElement, key: WindowPositionKey): void {
        const rect = root.getBoundingClientRect();

        window.localStorage.setItem(
            `${WINDOW_POSITION_STORAGE_PREFIX}${key}`,
            JSON.stringify({
                left: rect.left,
                top: rect.top
            } satisfies StoredWindowPosition)
        );
    }

    private restoreWindowPosition(root: HTMLDivElement, key: WindowPositionKey): void {
        const raw = window.localStorage.getItem(`${WINDOW_POSITION_STORAGE_PREFIX}${key}`);

        if (!raw) {
            return;
        }

        try {
            const parsed: unknown = JSON.parse(raw);

            if (!this.isRecord(parsed)) {
                return;
            }

            const { left, top } = parsed as Partial<StoredWindowPosition>;

            if (!Number.isFinite(left) || !Number.isFinite(top)) {
                return;
            }

            root.style.left = `${left}px`;
            root.style.top = `${top}px`;
            root.style.right = 'auto';
            root.style.bottom = 'auto';
            root.style.transform = 'none';
        } catch {
            return;
        }
    }

    private toggleInventoryWindow(): void {
        if (!this.inventoryUiRoot) {
            return;
        }

        this.isInventoryWindowOpen = !this.isInventoryWindowOpen;

        if (this.isInventoryWindowOpen) {
            this.restoreWindowPosition(this.inventoryUiRoot, 'inventory');
        } else {
            this.saveWindowPosition(this.inventoryUiRoot, 'inventory');
        }

        this.inventoryUiRoot.style.display = this.isInventoryWindowOpen ? 'grid' : 'none';
        this.refreshBottomBarState();

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
        const activeElement = document.activeElement;

        if (!activeElement) {
            return false;
        }

        if (this.chatInputElement && activeElement === this.chatInputElement) {
            return true;
        }

        if (
            activeElement instanceof HTMLInputElement ||
            activeElement instanceof HTMLTextAreaElement ||
            activeElement instanceof HTMLSelectElement
        ) {
            return true;
        }

        return (activeElement as HTMLElement).isContentEditable;
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

    private syncTileOverrides(rawOverrides: unknown): void {
        const nextOverrides = new Map<string, WorldTileOverride>();

        for (const override of this.extractTileOverrides(rawOverrides)) {
            const key = `${override.tileX}:${override.tileY}`;
            nextOverrides.set(key, override);
        }

        for (const [key, current] of this.worldTileOverrides.entries()) {
            const next = nextOverrides.get(key);

            if (!next) {
                this.worldTileOverrides.delete(key);
                this.markChunkDirtyByTile(current.tileX, current.tileY);
                continue;
            }

            if (
                current.tileType !== next.tileType ||
                current.walkableMode !== next.walkableMode
            ) {
                this.worldTileOverrides.set(key, next);
                this.markChunkDirtyByTile(next.tileX, next.tileY);
            }
        }

        for (const [key, override] of nextOverrides.entries()) {
            if (this.worldTileOverrides.has(key)) {
                continue;
            }

            this.worldTileOverrides.set(key, override);
            this.markChunkDirtyByTile(override.tileX, override.tileY);
        }

        if (this.dirtyChunkKeys.size > 0) {
            this.updateVisibleWorldChunks(this.player.tileX, this.player.tileY);
        }
    }

    private extractTileOverrides(rawOverrides: unknown): WorldTileOverride[] {
        if (!this.isRecord(rawOverrides)) {
            return [];
        }

        const overrides: WorldTileOverride[] = [];
        const mapLike = rawOverrides as {
            entries?: () => IterableIterator<[string, unknown]>;
        };

        if (typeof mapLike.entries === 'function') {
            for (const [, value] of mapLike.entries()) {
                const parsed = this.parseTileOverride(value);

                if (parsed) {
                    overrides.push(parsed);
                }
            }

            return overrides;
        }

        for (const value of Object.values(rawOverrides)) {
            const parsed = this.parseTileOverride(value);

            if (parsed) {
                overrides.push(parsed);
            }
        }

        return overrides;
    }

    private parseTileOverride(value: unknown): WorldTileOverride | null {
        if (!this.isRecord(value)) {
            return null;
        }

        const { tileX, tileY, tileType, walkableMode } = value;

        if (
            typeof tileX !== 'number' ||
            typeof tileY !== 'number' ||
            typeof tileType !== 'number' ||
            typeof walkableMode !== 'number'
        ) {
            return null;
        }

        if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) {
            return null;
        }

        return {
            tileX,
            tileY,
            tileType,
            walkableMode
        };
    }

    private markChunkDirtyByTile(tileX: number, tileY: number): void {
        const chunkX = Math.floor(tileX / this.chunkSizeInTiles);
        const chunkY = Math.floor(tileY / this.chunkSizeInTiles);
        this.dirtyChunkKeys.add(this.chunkKey(chunkX, chunkY));
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

        if (this.currentUtilitySection === 'users') {
            this.refreshUtilityPanel();
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
            if (this.currentUtilitySection === 'map') {
                this.refreshUtilityPanel();
            }

            if (
                this.queuedMoveTarget &&
                playerState.tileX === this.queuedMoveTarget.tileX &&
                playerState.tileY === this.queuedMoveTarget.tileY
            ) {
                this.cancelQueuedPathMovement();
            }
            return;
        }

        this.player.moveTo(playerState.tileX, playerState.tileY, this.movementDurationMs);

        if (this.currentUtilitySection === 'map') {
            this.refreshUtilityPanel();
        }
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
        this.createBottomActionBar();

        if (!this.hasRegisteredGroundVisualDnD) {
            this.registerGroundVisualDragHandlers();
            this.hasRegisteredGroundVisualDnD = true;
        }

        this.events.once('shutdown', () => {
            this.chatInputElement?.parentElement?.remove();
            this.chatInputElement = null;
            this.moveTargetIndicatorPulseTween?.remove();
            this.moveTargetIndicatorPulseTween = null;
            this.moveTargetIndicator?.destroy();
            this.moveTargetIndicator = null;
            this.bottomActionBarRoot?.remove();
            this.bottomActionBarRoot = null;
            this.bottomUtilityButtons.clear();
            this.utilityPanelRoot?.remove();
            this.utilityPanelRoot = null;
            this.utilityPanelTitle = null;
            this.utilityPanelContent = null;
            this.inventoryUiRoot?.remove();
            this.inventoryUiRoot = null;
            this.inventoryUiSlots = null;
            this.isInventoryWindowOpen = false;
            this.armorModalRoot?.remove();
            this.armorModalRoot = null;
            this.isArmorWindowOpen = false;
            this.currentUtilitySection = null;
            this.settingsLatencyMs = null;
            this.connectionHealth = 'unknown';
            this.isMapPreviewLoading = false;
            if (this.mapPreviewLoadingTimeoutId !== null) {
                window.clearTimeout(this.mapPreviewLoadingTimeoutId);
                this.mapPreviewLoadingTimeoutId = null;
            }
            this.stopSettingsLatencyPolling();
            this.mapWindowRoot?.remove();
            this.mapWindowRoot = null;
            this.friendsWindowRoot?.remove();
            this.friendsWindowRoot = null;
            this.usersWindowRoot?.remove();
            this.usersWindowRoot = null;
            this.clearFogOfWarLayer();
            this.clearRenderedWorldChunks();
            this.worldTileOverrides.clear();
            this.dirtyChunkKeys.clear();
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
            root.style.background = 'radial-gradient(circle at top, rgba(68, 41, 16, 0.55), rgba(0, 0, 0, 0.82))';
            root.style.display = 'flex';
            root.style.alignItems = 'center';
            root.style.justifyContent = 'center';
            root.style.zIndex = '9999';
            root.style.backdropFilter = 'blur(4px)';

            const card = document.createElement('div');
            card.style.width = 'min(420px, 92vw)';
            card.style.padding = '26px';
            card.style.borderRadius = '16px';
            card.style.background = UI_COLORS.panel;
            card.style.border = `1px solid ${UI_COLORS.border}`;
            card.style.boxShadow = UI_COLORS.shadow;

            const title = document.createElement('h2');
            title.textContent = 'Acceso al Reino';
            title.style.margin = '0 0 8px';
            title.style.color = UI_COLORS.text;
            title.style.fontFamily = UI_FONT_TITLE;
            title.style.fontSize = '24px';
            title.style.textAlign = 'center';

            const subtitle = document.createElement('p');
            subtitle.textContent = 'Registra tu cuenta con personaje o inicia sesión para elegir uno.';
            subtitle.style.margin = '0 0 16px';
            subtitle.style.color = UI_COLORS.textSoft;
            subtitle.style.fontFamily = UI_FONT_BODY;
            subtitle.style.fontSize = '14px';
            subtitle.style.textAlign = 'center';

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
                applyInputStyle(input);
                return input;
            };

            const modeToggle = document.createElement('button');
            modeToggle.type = 'button';
            modeToggle.textContent = 'Cambiar a registro';
            modeToggle.style.display = 'block';
            modeToggle.style.width = '100%';
            modeToggle.style.marginBottom = '28px';
            applyButtonStyle(modeToggle, 'secondary');

            const authSpacer = document.createElement('div');
            authSpacer.style.height = '8px';

            const usernameInput = createInput('Usuario (a-z, 0-9, _)', '');
            const passwordInput = createInput('Contraseña', '', 'password');
            const characterNameInput = createInput('Nombre de personaje', '');

            const characterSelect = document.createElement('select');
            applyInputStyle(characterSelect);
            characterSelect.style.display = 'none';

            const createExtraCharacterInput = createInput(
                'Nuevo personaje para esta cuenta',
                ''
            );
            createExtraCharacterInput.style.display = 'none';

            const createExtraCharacterButton = document.createElement('button');
            createExtraCharacterButton.type = 'button';
            createExtraCharacterButton.textContent = 'Crear personaje';
            applyButtonStyle(createExtraCharacterButton, 'secondary');
            createExtraCharacterButton.style.display = 'none';

            const status = document.createElement('p');
            status.style.margin = '0 0 10px';
            status.style.color = '#fda4af';
            status.style.fontFamily = UI_FONT_BODY;
            status.style.fontSize = '13px';
            status.style.minHeight = '18px';
            status.style.textAlign = 'center';

            const button = document.createElement('button');
            button.textContent = 'Iniciar sesión';
            button.style.marginTop = '14px';
            applyButtonStyle(button, 'primary');

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

            const restorePreferredCharacterSelection = (
                characters: readonly CharacterSummary[]
            ): void => {
                const storedCharacterId = window.localStorage.getItem(
                    LAST_CHARACTER_STORAGE_KEY
                );

                if (!storedCharacterId) {
                    return;
                }

                const preferredIndex = characters.findIndex(
                    (character) => character.id === storedCharacterId
                );

                if (preferredIndex >= 0) {
                    characterSelect.selectedIndex = preferredIndex;
                }
            };

            const persistSelectedCharacter = (): void => {
                const selectedId = characterSelect.value;

                if (!selectedId) {
                    return;
                }

                window.localStorage.setItem(LAST_CHARACTER_STORAGE_KEY, selectedId);
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
                    persistSelectedCharacter();
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

                        const response = await this.requestRegister(
                            username,
                            password,
                            characterName
                        );

                        root.remove();
                        resolve({
                            playerName: response.createdCharacter.name,
                            characterId: response.createdCharacter.id,
                            token: response.token
                        });
                        return;
                    } else if (loginResponse === null) {
                        const response = await this.requestLogin(username, password);

                        if (response.characters.length === 0) {
                            throw new Error('Esta cuenta no tiene personajes.');
                        }

                        loginResponse = response;
                        renderCharacters(response.characters);
                        restorePreferredCharacterSelection(response.characters);
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

                        persistSelectedCharacter();
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

            characterSelect.addEventListener('change', () => {
                persistSelectedCharacter();
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
            card.appendChild(authSpacer);
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

        return `${protocol}://${window.location.hostname}:2567`;
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

        if (this.currentUtilitySection === 'users') {
            this.refreshUtilityPanel();
        }
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
        slot.style.borderRadius = '10px';
        slot.style.border = `1px solid ${UI_COLORS.borderSoft}`;
        slot.style.background = 'linear-gradient(180deg, rgba(52, 34, 18, 0.98) 0%, rgba(18, 12, 8, 0.98) 100%)';
        slot.style.color = UI_COLORS.text;
        slot.style.padding = '4px';
        slot.style.textAlign = 'left';
        slot.style.cursor = item ? 'pointer' : 'default';
        slot.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.24)';

        if (!item) {
            slot.textContent = '';
            slot.disabled = true;
            slot.style.opacity = '0.45';
            return slot;
        }

        slot.draggable = true;

        const title = document.createElement('div');
        title.textContent = item.slug;
        title.style.fontFamily = UI_FONT_BODY;
        title.style.fontSize = '9px';
        title.style.color = UI_COLORS.text;

        const qty = document.createElement('div');
        qty.textContent = `x${item.quantity}`;
        qty.style.fontFamily = UI_FONT_BODY;
        qty.style.fontSize = '10px';
        qty.style.fontWeight = '700';
        qty.style.color = isGround ? UI_COLORS.success : UI_COLORS.accentStrong;

        const action = document.createElement('div');
        action.textContent = isGround ? 'Pickup' : 'Drop';
        action.style.fontFamily = UI_FONT_BODY;
        action.style.fontSize = '8px';
        action.style.color = isGround ? UI_COLORS.success : UI_COLORS.danger;

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
