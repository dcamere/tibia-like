import { GameObjects, Scene } from 'phaser';
import type { Direction } from '@tibia-like/shared';

import {
    ensureMedievalSpriteTextures,
    getMedievalPlayerTexture
} from '../rendering/MedievalSprites';
import { tileToWorldPosition } from '../world/coordinates';

type PlayerOptions = {
    name: string;
    tileX: number;
    tileY: number;
    tileSize: number;
    maxHealth: number;
};

const HEALTH_BAR_WIDTH = 26;
const HEALTH_BAR_HEIGHT = 5;
const HEALTH_BAR_OFFSET_Y = -20;

/**
 * Represents the local player entity: its logical tile position, its
 * health, and its visual representation. Placeholder rectangle body for
 * now using directional medieval sprites. Health tracking lives here locally
 * for the prototype, but through
 * the same kind of small surface (takeDamage) used by Creature, so it
 * can later be driven by authoritative server state instead.
 */
export class Player {
    public readonly name: string;

    public tileX: number;
    public tileY: number;

    public readonly maxHealth: number;
    public currentHealth: number;

    public readonly gameObject: GameObjects.Container;

    private readonly scene: Scene;
    private readonly tileSize: number;
    private readonly healthBarFill: GameObjects.Rectangle;
    private readonly bodySprite: GameObjects.Image;
    private facingDirection: Direction = 'down';

    constructor(scene: Scene, options: PlayerOptions) {
        this.scene = scene;
        this.tileSize = options.tileSize;

        this.name = options.name;

        this.tileX = options.tileX;
        this.tileY = options.tileY;

        this.maxHealth = options.maxHealth;
        this.currentHealth = options.maxHealth;

        const position = tileToWorldPosition(
            this.tileX,
            this.tileY,
            this.tileSize
        );

        ensureMedievalSpriteTextures(scene);

        const initialTexture = getMedievalPlayerTexture(
            scene,
            this.facingDirection,
            false
        );

        this.bodySprite = scene.add
            .image(0, 1, initialTexture.textureKey, initialTexture.frame)
            .setDisplaySize(this.tileSize - 4, this.tileSize - 4);

        const nameLabel = scene.add
            .text(0, -25, options.name, {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3
            })
            .setOrigin(0.5);

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

        this.gameObject = scene.add.container(
            position.x,
            position.y,
            [this.bodySprite, healthBarBackground, this.healthBarFill, nameLabel]
        );

        this.gameObject.setDepth(10);
    }

    public takeDamage(amount: number): void {
        this.currentHealth = Math.max(0, this.currentHealth - amount);
        this.updateHealthBar();
    }

    public moveTo(
        tileX: number,
        tileY: number,
        durationMs: number
    ): void {
        const direction = this.resolveDirection(
            this.tileX,
            this.tileY,
            tileX,
            tileY
        );

        this.facingDirection = direction;
        this.tileX = tileX;
        this.tileY = tileY;

        const position = tileToWorldPosition(
            tileX,
            tileY,
            this.tileSize
        );

        this.scene.tweens.killTweensOf(this.gameObject);

        if (durationMs > 0) {
            const walkTexture = getMedievalPlayerTexture(
                this.scene,
                this.facingDirection,
                true
            );

            this.bodySprite.setTexture(walkTexture.textureKey, walkTexture.frame);
        } else {
            const idleTexture = getMedievalPlayerTexture(
                this.scene,
                this.facingDirection,
                false
            );

            this.bodySprite.setTexture(idleTexture.textureKey, idleTexture.frame);
        }

        this.scene.tweens.add({
            targets: this.gameObject,
            x: position.x,
            y: position.y,
            duration: durationMs,
            ease: 'Linear',
            onComplete: () => {
                const idleTexture = getMedievalPlayerTexture(
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

