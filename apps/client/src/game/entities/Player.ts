import { GameObjects, Scene } from 'phaser';

import { tileToWorldPosition } from '../world/coordinates';

type PlayerOptions = {
    tileX: number;
    tileY: number;
    tileSize: number;
};

/**
 * Represents the local player entity: its logical tile position and
 * its visual representation. Placeholder rectangle for now; will be
 * swapped for a sprite later without changing the public API.
 */
export class Player {
    public tileX: number;
    public tileY: number;

    public readonly gameObject: GameObjects.Rectangle;

    private readonly scene: Scene;
    private readonly tileSize: number;

    constructor(scene: Scene, options: PlayerOptions) {
        this.scene = scene;
        this.tileSize = options.tileSize;

        this.tileX = options.tileX;
        this.tileY = options.tileY;

        const position = tileToWorldPosition(
            this.tileX,
            this.tileY,
            this.tileSize
        );

        this.gameObject = scene.add
            .rectangle(
                position.x,
                position.y,
                this.tileSize - 6,
                this.tileSize - 6,
                0x3b82f6
            )
            .setStrokeStyle(2, 0xffffff)
            .setDepth(10);
    }

    public moveTo(
        tileX: number,
        tileY: number,
        durationMs: number
    ): void {
        this.tileX = tileX;
        this.tileY = tileY;

        const position = tileToWorldPosition(
            tileX,
            tileY,
            this.tileSize
        );

        this.scene.tweens.killTweensOf(this.gameObject);

        this.scene.tweens.add({
            targets: this.gameObject,
            x: position.x,
            y: position.y,
            duration: durationMs,
            ease: 'Linear'
        });
    }
}
