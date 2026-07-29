import { Input, Scene, Types } from 'phaser';

import { Direction, DIRECTION_DELTAS } from '@tibia-like/shared';

export type { Direction };
export { DIRECTION_DELTAS };

type MovementKeys = Record<Direction, Input.Keyboard.Key>;

/**
 * Reads keyboard state (arrow keys and WASD) and exposes it as a single
 * requested Direction. Only one direction is reported per frame so
 * tile-based movement stays deterministic, matching what will later be
 * sent to the server as a discrete input intent.
 */
export class KeyboardController {
    private readonly cursors: Types.Input.Keyboard.CursorKeys;
    private readonly wasdKeys: MovementKeys;

    constructor(scene: Scene) {
        const keyboard = scene.input.keyboard;

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

    public getRequestedDirection(): Direction | null {
        if (this.cursors.left.isDown || this.wasdKeys.left.isDown) {
            return 'left';
        }

        if (this.cursors.right.isDown || this.wasdKeys.right.isDown) {
            return 'right';
        }

        if (this.cursors.up.isDown || this.wasdKeys.up.isDown) {
            return 'up';
        }

        if (this.cursors.down.isDown || this.wasdKeys.down.isDown) {
            return 'down';
        }

        return null;
    }
}
