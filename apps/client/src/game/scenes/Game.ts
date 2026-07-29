import {
    Input,
    Scene,
    Types,
    Utils
} from 'phaser';

import { Creature } from '../entities/Creature';
import { Player } from '../entities/Player';
import { tileToWorldPosition } from '../world/coordinates';

import {
    isBlockingTile,
    MAP_HEIGHT_IN_TILES,
    MAP_WIDTH_IN_TILES,
    TILE_SIZE,
    TileType,
    WORLD_HEIGHT,
    WORLD_MAP,
    WORLD_WIDTH
} from '../worldMap';

type MovementKeys = Record<
    'up' | 'down' | 'left' | 'right',
    Input.Keyboard.Key
>;

export class Game extends Scene {
    private player!: Player;
    private creature!: Creature;

    private cursors!: Types.Input.Keyboard.CursorKeys;
    private wasdKeys!: MovementKeys;

    private canMove = true;

    private readonly moveCooldownMs = 120;
    private readonly movementDurationMs = 100;

    constructor() {
        super('Game');
    }

    create(): void {
        this.createWorld();
        this.createPlayer();
        this.createCreature();
        this.createKeyboardControls();
        this.configureCamera();
        this.createInterface();
        this.startCreatureMovement();
    }

    update(): void {
        if (!this.canMove) {
            return;
        }

        if (this.cursors.left.isDown || this.wasdKeys.left.isDown) {
            this.tryMovePlayer(-1, 0);
        } else if (
            this.cursors.right.isDown ||
            this.wasdKeys.right.isDown
        ) {
            this.tryMovePlayer(1, 0);
        } else if (
            this.cursors.up.isDown ||
            this.wasdKeys.up.isDown
        ) {
            this.tryMovePlayer(0, -1);
        } else if (
            this.cursors.down.isDown ||
            this.wasdKeys.down.isDown
        ) {
            this.tryMovePlayer(0, 1);
        }
    }

    private createWorld(): void {
        this.cameras.main.setBackgroundColor('#16211b');

        for (
            let tileY = 0;
            tileY < MAP_HEIGHT_IN_TILES;
            tileY += 1
        ) {
            for (
                let tileX = 0;
                tileX < MAP_WIDTH_IN_TILES;
                tileX += 1
            ) {
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

    private createGroundTile(
        tileX: number,
        tileY: number
    ): void {
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

    private createTileObject(
        tileX: number,
        tileY: number,
        tileType: TileType
    ): void {
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
                console.warn(
                    `Unknown tile type ${tileType} at ${tileX},${tileY}`
                );
        }
    }

    private createWall(
        tileX: number,
        tileY: number
    ): void {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        this.add
            .rectangle(
                position.x,
                position.y,
                TILE_SIZE,
                TILE_SIZE,
                0x806044
            )
            .setStrokeStyle(2, 0x3d291c)
            .setDepth(5);
    }

    private createTree(
        tileX: number,
        tileY: number
    ): void {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        this.add
            .rectangle(
                position.x,
                position.y + 8,
                8,
                16,
                0x68421f
            )
            .setDepth(5);

        this.add
            .circle(
                position.x,
                position.y - 3,
                13,
                0x1f7a35
            )
            .setStrokeStyle(2, 0x124d22)
            .setDepth(6);
    }

    private createRock(
        tileX: number,
        tileY: number
    ): void {
        const position = tileToWorldPosition(tileX, tileY, TILE_SIZE);

        this.add
            .ellipse(
                position.x,
                position.y,
                TILE_SIZE - 6,
                TILE_SIZE - 12,
                0x7b7f84
            )
            .setStrokeStyle(2, 0x414449)
            .setDepth(5);
    }

    private createPlayer(): void {
        const initialTileX = 5;
        const initialTileY = 5;

        if (
            this.isOutsideWorld(initialTileX, initialTileY) ||
            this.isTileBlocked(initialTileX, initialTileY)
        ) {
            throw new Error(
                'The initial player position is invalid.'
            );
        }

        this.player = new Player(this, {
            tileX: initialTileX,
            tileY: initialTileY,
            tileSize: TILE_SIZE
        });
    }

    private createCreature(): void {
        const initialTileX = 11;
        const initialTileY = 11;

        if (
            this.isOutsideWorld(initialTileX, initialTileY) ||
            this.isTileBlocked(initialTileX, initialTileY)
        ) {
            throw new Error(
                'The initial creature position is invalid.'
            );
        }

        this.creature = new Creature(this, {
            name: 'Rat',
            tileX: initialTileX,
            tileY: initialTileY,
            tileSize: TILE_SIZE
        });
    }

    private startCreatureMovement(): void {
        this.time.addEvent({
            delay: 700,
            loop: true,
            callback: () => {
                this.tryMoveCreature();
            }
        });
    }

    private tryMoveCreature(): void {
        const possibleDirections = [
            { deltaX: -1, deltaY: 0 },
            { deltaX: 1, deltaY: 0 },
            { deltaX: 0, deltaY: -1 },
            { deltaX: 0, deltaY: 1 }
        ];

        Utils.Array.Shuffle(possibleDirections);

        for (const direction of possibleDirections) {
            const nextTileX =
                this.creature.tileX + direction.deltaX;

            const nextTileY =
                this.creature.tileY + direction.deltaY;

            if (
                !this.canCreatureMoveTo(
                    nextTileX,
                    nextTileY
                )
            ) {
                continue;
            }

            this.creature.moveTo(
                nextTileX,
                nextTileY,
                250
            );

            return;
        }
    }

    private canCreatureMoveTo(
        tileX: number,
        tileY: number
    ): boolean {
        if (
            this.isOutsideWorld(tileX, tileY) ||
            this.isTileBlocked(tileX, tileY)
        ) {
            return false;
        }

        const isPlayerTile =
            tileX === this.player.tileX &&
            tileY === this.player.tileY;

        return !isPlayerTile;
    }

    private createKeyboardControls(): void {
        const keyboard = this.input.keyboard;

        if (!keyboard) {
            throw new Error(
                'Keyboard input is not available.'
            );
        }

        this.cursors = keyboard.createCursorKeys();

        this.wasdKeys = keyboard.addKeys({
            up: Input.Keyboard.KeyCodes.W,
            down: Input.Keyboard.KeyCodes.S,
            left: Input.Keyboard.KeyCodes.A,
            right: Input.Keyboard.KeyCodes.D
        }) as MovementKeys;
    }

    private configureCamera(): void {
        this.cameras.main.setBounds(
            0,
            0,
            WORLD_WIDTH,
            WORLD_HEIGHT
        );

        this.cameras.main.startFollow(
            this.player.gameObject,
            true,
            0.15,
            0.15
        );

        this.cameras.main.setZoom(1.5);
    }

    private createInterface(): void {
        this.add
            .text(
                16,
                16,
                'WASD o flechas\nMapa generado desde datos',
                {
                    fontFamily: 'Arial',
                    fontSize: '16px',
                    color: '#ffffff',
                    backgroundColor: '#000000aa',
                    padding: {
                        x: 10,
                        y: 6
                    }
                }
            )
            .setScrollFactor(0)
            .setDepth(1000);
    }

    private tryMovePlayer(
        deltaX: number,
        deltaY: number
    ): void {
        const nextTileX = this.player.tileX + deltaX;
        const nextTileY = this.player.tileY + deltaY;

        const isCreatureTile =
            nextTileX === this.creature.tileX &&
            nextTileY === this.creature.tileY;

        if (
            this.isOutsideWorld(nextTileX, nextTileY) ||
            this.isTileBlocked(nextTileX, nextTileY) ||
            isCreatureTile
        ) {
            this.startMoveCooldown();
            return;
        }

        this.player.moveTo(
            nextTileX,
            nextTileY,
            this.movementDurationMs
        );

        this.startMoveCooldown();
    }

    private isOutsideWorld(
        tileX: number,
        tileY: number
    ): boolean {
        return (
            tileX < 0 ||
            tileX >= MAP_WIDTH_IN_TILES ||
            tileY < 0 ||
            tileY >= MAP_HEIGHT_IN_TILES
        );
    }

    private isTileBlocked(
        tileX: number,
        tileY: number
    ): boolean {
        const tileType = WORLD_MAP[tileY]?.[tileX];

        if (tileType === undefined) {
            return true;
        }

        return isBlockingTile(tileType);
    }

    private startMoveCooldown(): void {
        this.canMove = false;

        this.time.delayedCall(
            this.moveCooldownMs,
            () => {
                this.canMove = true;
            }
        );
    }
}