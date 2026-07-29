import { Input, Scene } from 'phaser';

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
    private readonly arrowKeys: MovementKeys;
    private readonly wasdKeys: MovementKeys;

    constructor(scene: Scene) {
        const keyboard = scene.input.keyboard;

        if (!keyboard) {
            throw new Error(
                'Keyboard input is not available.'
            );
        }

        // Disable key capture so typed letters reach the HTML chat input.
        this.arrowKeys = {
            up: keyboard.addKey(Input.Keyboard.KeyCodes.UP, false),
            down: keyboard.addKey(Input.Keyboard.KeyCodes.DOWN, false),
            left: keyboard.addKey(Input.Keyboard.KeyCodes.LEFT, false),
            right: keyboard.addKey(Input.Keyboard.KeyCodes.RIGHT, false)
        };

        this.wasdKeys = {
            up: keyboard.addKey(Input.Keyboard.KeyCodes.W, false),
            down: keyboard.addKey(Input.Keyboard.KeyCodes.S, false),
            left: keyboard.addKey(Input.Keyboard.KeyCodes.A, false),
            right: keyboard.addKey(Input.Keyboard.KeyCodes.D, false)
        };
    }

    public getRequestedDirection(): Direction | null {
        if (this.arrowKeys.left.isDown || this.wasdKeys.left.isDown) {
            return 'left';
        }

        if (this.arrowKeys.right.isDown || this.wasdKeys.right.isDown) {
            return 'right';
        }

        if (this.arrowKeys.up.isDown || this.wasdKeys.up.isDown) {
            return 'up';
        }

        if (this.arrowKeys.down.isDown || this.wasdKeys.down.isDown) {
            return 'down';
        }

        return null;
    }
}
