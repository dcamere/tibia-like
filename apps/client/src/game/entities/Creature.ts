import { GameObjects, Scene } from 'phaser';

import {
    EntityId,
    type Direction
} from '@tibia-like/shared';

import {
    ensureMedievalSpriteTextures,
    getMedievalRatTexture
} from '../rendering/MedievalSprites';
import { tileToWorldPosition, WorldPosition } from '../world/coordinates';

type CreatureOptions = {
    id: EntityId;
    name: string;
    tileX: number;
    tileY: number;
    tileSize: number;
    maxHealth: number;
};

type CreatureSyncState = {
    tileX: number;
    tileY: number;
    currentHealth: number;
    isAlive: boolean;
};

const HEALTH_BAR_WIDTH = 24;
const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_OFFSET_Y = -18;

/**
 * A creature/NPC: logical combat state (health, alive/dead) plus its
 * visual representation. Health and death are computed here locally for
 * now, but through a small, isolated surface (takeDamage/respawn) so the
 * same rules can be re-triggered by authoritative server messages later
 * instead of local input, without changing how the entity renders.
 */
export class Creature {
    public readonly id: EntityId;
    public readonly name: string;

    public tileX: number;
    public tileY: number;

    public readonly maxHealth: number;
    public currentHealth: number;
    public isAlive = true;

    private readonly scene: Scene;
    private readonly tileSize: number;
    private readonly spawnTileX: number;
    private readonly spawnTileY: number;
    private readonly container: GameObjects.Container;
    private readonly selectionRing: GameObjects.Rectangle;
    private readonly healthBarFill: GameObjects.Rectangle;
    private readonly bodySprite: GameObjects.Image;
    private facingDirection: Direction = 'down';

    private onClickHandler: (() => void) | null = null;

    constructor(scene: Scene, options: CreatureOptions) {
        this.scene = scene;
        this.tileSize = options.tileSize;

        this.id = options.id;
        this.name = options.name;

        this.tileX = options.tileX;
        this.tileY = options.tileY;

        this.spawnTileX = options.tileX;
        this.spawnTileY = options.tileY;

        this.maxHealth = options.maxHealth;
        this.currentHealth = options.maxHealth;

        const position = tileToWorldPosition(
            this.tileX,
            this.tileY,
            this.tileSize
        );

        ensureMedievalSpriteTextures(scene);

        const initialTexture = getMedievalRatTexture(
            scene,
            this.facingDirection,
            false
        );

        this.bodySprite = scene.add
            .image(0, 2, initialTexture.textureKey, initialTexture.frame)
            .setDisplaySize(this.tileSize - 6, this.tileSize - 6);

        const nameLabel = scene.add
            .text(0, -25, options.name, {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3
            })
            .setOrigin(0.5);

        this.selectionRing = scene.add
            .rectangle(
                0,
                2,
                this.tileSize - 4,
                this.tileSize - 4,
                0xffffff,
                0
            )
            .setStrokeStyle(2, 0xffe066)
            .setVisible(false);

        const healthBarBackground = scene.add
            .rectangle(
                -HEALTH_BAR_WIDTH / 2,
                HEALTH_BAR_OFFSET_Y,
                HEALTH_BAR_WIDTH,
                HEALTH_BAR_HEIGHT,
                0x3f0f0f
            )
            .setOrigin(0, 0.5);

        this.healthBarFill = scene.add
            .rectangle(
                -HEALTH_BAR_WIDTH / 2,
                HEALTH_BAR_OFFSET_Y,
                HEALTH_BAR_WIDTH,
                HEALTH_BAR_HEIGHT,
                0x2ecc71
            )
            .setOrigin(0, 0.5);

        this.container = scene.add.container(
            position.x,
            position.y,
            [
                this.selectionRing,
                this.bodySprite,
                healthBarBackground,
                this.healthBarFill,
                nameLabel
            ]
        );

        this.container.setDepth(9);
        this.container.setSize(this.tileSize, this.tileSize);
        this.container.setInteractive();

        this.container.on('pointerdown', () => {
            this.onClickHandler?.();
        });
    }

    public onClick(handler: () => void): void {
        this.onClickHandler = handler;
    }

    public setSelected(isSelected: boolean): void {
        this.selectionRing.setVisible(isSelected);
    }

    public takeDamage(amount: number): void {
        if (!this.isAlive) {
            return;
        }

        this.currentHealth = Math.max(0, this.currentHealth - amount);
        this.updateHealthBar();

        if (this.currentHealth === 0) {
            this.die();
        }
    }

    public respawn(): void {
        this.tileX = this.spawnTileX;
        this.tileY = this.spawnTileY;
        this.currentHealth = this.maxHealth;
        this.isAlive = true;

        this.updateHealthBar();
        this.setSelected(false);

        const position = tileToWorldPosition(
            this.spawnTileX,
            this.spawnTileY,
            this.tileSize
        );

        this.container.setPosition(position.x, position.y);
        this.container.setAlpha(1);
        this.container.setInteractive();
        this.facingDirection = 'down';
        const idleTexture = getMedievalRatTexture(
            this.scene,
            this.facingDirection,
            false
        );

        this.bodySprite.setTexture(idleTexture.textureKey, idleTexture.frame);
    }

    public moveTo(
        tileX: number,
        tileY: number,
        durationMs: number
    ): void {
        if (!this.isAlive) {
            return;
        }

        this.facingDirection = this.resolveDirection(
            this.tileX,
            this.tileY,
            tileX,
            tileY
        );

        this.tileX = tileX;
        this.tileY = tileY;

        const position = tileToWorldPosition(
            tileX,
            tileY,
            this.tileSize
        );

        this.scene.tweens.killTweensOf(this.container);

        const walkTexture = getMedievalRatTexture(
            this.scene,
            this.facingDirection,
            true
        );

        this.bodySprite.setTexture(walkTexture.textureKey, walkTexture.frame);

        this.scene.tweens.add({
            targets: this.container,
            x: position.x,
            y: position.y,
            duration: durationMs,
            ease: 'Linear',
            onComplete: () => {
                const idleTexture = getMedievalRatTexture(
                    this.scene,
                    this.facingDirection,
                    false
                );

                this.bodySprite.setTexture(
                    idleTexture.textureKey,
                    idleTexture.frame
                );
            }
        });
    }

    public syncFromServer(
        state: CreatureSyncState,
        durationMs: number
    ): void {
        const previousTileX = this.tileX;
        const previousTileY = this.tileY;

        this.facingDirection = this.resolveDirection(
            previousTileX,
            previousTileY,
            state.tileX,
            state.tileY
        );

        const nextHealth = Math.max(
            0,
            Math.min(this.maxHealth, state.currentHealth)
        );

        this.tileX = state.tileX;
        this.tileY = state.tileY;

        const position = tileToWorldPosition(
            state.tileX,
            state.tileY,
            this.tileSize
        );

        this.scene.tweens.killTweensOf(this.container);

        if (state.isAlive) {
            this.isAlive = true;
            this.currentHealth = nextHealth;
            this.updateHealthBar();
            this.container.setAlpha(1);
            this.container.setInteractive();

            if (durationMs > 0) {
                const walkTexture = getMedievalRatTexture(
                    this.scene,
                    this.facingDirection,
                    true
                );

                this.bodySprite.setTexture(
                    walkTexture.textureKey,
                    walkTexture.frame
                );

                this.scene.tweens.add({
                    targets: this.container,
                    x: position.x,
                    y: position.y,
                    duration: durationMs,
                    ease: 'Linear',
                    onComplete: () => {
                        const idleTexture = getMedievalRatTexture(
                            this.scene,
                            this.facingDirection,
                            false
                        );

                        this.bodySprite.setTexture(
                            idleTexture.textureKey,
                            idleTexture.frame
                        );
                    }
                });
            } else {
                const idleTexture = getMedievalRatTexture(
                    this.scene,
                    this.facingDirection,
                    false
                );

                this.bodySprite.setTexture(idleTexture.textureKey, idleTexture.frame);
                this.container.setPosition(position.x, position.y);
            }

            return;
        }

        this.currentHealth = 0;
        this.updateHealthBar();

        if (this.isAlive) {
            this.die();
        }

        this.container.setPosition(position.x, position.y);
    }

    public getWorldPosition(): WorldPosition {
        return { x: this.container.x, y: this.container.y };
    }

    public destroy(): void {
        this.container.destroy();
        this.onClickHandler = null;
    }

    private die(): void {
        this.isAlive = false;
        this.setSelected(false);
        this.container.disableInteractive();
        this.container.setAlpha(0.3);
        const idleTexture = getMedievalRatTexture(
            this.scene,
            this.facingDirection,
            false
        );

        this.bodySprite.setTexture(idleTexture.textureKey, idleTexture.frame);
    }

    private resolveDirection(
        fromTileX: number,
        fromTileY: number,
        toTileX: number,
        toTileY: number
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

        return this.facingDirection;
    }

    private updateHealthBar(): void {
        const healthRatio = this.currentHealth / this.maxHealth;
        this.healthBarFill.width = HEALTH_BAR_WIDTH * healthRatio;
    }
}
