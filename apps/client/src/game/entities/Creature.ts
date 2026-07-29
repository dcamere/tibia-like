import { GameObjects, Scene } from 'phaser';

import { tileToWorldPosition } from '../world/coordinates';

type CreatureOptions = {
    name: string;
    tileX: number;
    tileY: number;
    tileSize: number;
};

export class Creature {
    public tileX: number;
    public tileY: number;

    private readonly scene: Scene;
    private readonly tileSize: number;
    private readonly container: GameObjects.Container;

    constructor(scene: Scene, options: CreatureOptions) {
        this.scene = scene;
        this.tileSize = options.tileSize;

        this.tileX = options.tileX;
        this.tileY = options.tileY;

        const position = tileToWorldPosition(
            this.tileX,
            this.tileY,
            this.tileSize
        );

        const body = scene.add
            .ellipse(
                0,
                2,
                this.tileSize - 10,
                this.tileSize - 16,
                0x8b7355
            )
            .setStrokeStyle(2, 0x3f3327);

        const leftEar = scene.add.circle(
            -7,
            -7,
            4,
            0xc58f8f
        );

        const rightEar = scene.add.circle(
            7,
            -7,
            4,
            0xc58f8f
        );

        const nameLabel = scene.add
            .text(0, -25, options.name, {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 3
            })
            .setOrigin(0.5);

        this.container = scene.add.container(
            position.x,
            position.y,
            [body, leftEar, rightEar, nameLabel]
        );

        this.container.setDepth(9);
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

        this.scene.tweens.killTweensOf(this.container);

        this.scene.tweens.add({
            targets: this.container,
            x: position.x,
            y: position.y,
            duration: durationMs,
            ease: 'Linear'
        });
    }
}