import { GameObjects, Scene } from 'phaser';
import type { Direction } from '@tibia-like/shared';

const SPRITE_SIZE = 32;
const EXTERNAL_PLAYER_SPRITESHEET_KEY = 'medieval-player-sheet';
const EXTERNAL_RAT_SPRITESHEET_KEY = 'medieval-rat-sheet';

type DirectionTextureSet = {
    idle: string;
    walk: string;
};

type DirectionFrameSet = {
    idle: number;
    walk: number;
};

export type MedievalSpriteFrame = {
    textureKey: string;
    frame?: number;
};

const PLAYER_DIRECTION_TEXTURE_KEYS: Record<Direction, DirectionTextureSet> = {
    up: {
        idle: 'medieval-player-up-idle',
        walk: 'medieval-player-up-walk'
    },
    down: {
        idle: 'medieval-player-down-idle',
        walk: 'medieval-player-down-walk'
    },
    left: {
        idle: 'medieval-player-left-idle',
        walk: 'medieval-player-left-walk'
    },
    right: {
        idle: 'medieval-player-right-idle',
        walk: 'medieval-player-right-walk'
    }
};

const RAT_DIRECTION_TEXTURE_KEYS: Record<Direction, DirectionTextureSet> = {
    up: {
        idle: 'medieval-rat-up-idle',
        walk: 'medieval-rat-up-walk'
    },
    down: {
        idle: 'medieval-rat-down-idle',
        walk: 'medieval-rat-down-walk'
    },
    left: {
        idle: 'medieval-rat-left-idle',
        walk: 'medieval-rat-left-walk'
    },
    right: {
        idle: 'medieval-rat-right-idle',
        walk: 'medieval-rat-right-walk'
    }
};

const PLAYER_DIRECTION_FRAMES: Record<Direction, DirectionFrameSet> = {
    up: { idle: 0, walk: 1 },
    down: { idle: 2, walk: 3 },
    left: { idle: 4, walk: 5 },
    right: { idle: 6, walk: 7 }
};

const RAT_DIRECTION_FRAMES: Record<Direction, DirectionFrameSet> = {
    up: { idle: 0, walk: 1 },
    down: { idle: 2, walk: 3 },
    left: { idle: 4, walk: 5 },
    right: { idle: 6, walk: 7 }
};

export const preloadMedievalSpriteSheets = (scene: Scene): void => {
    scene.load.spritesheet(EXTERNAL_PLAYER_SPRITESHEET_KEY, 'assets/sprites/player-medieval.svg', {
        frameWidth: SPRITE_SIZE,
        frameHeight: SPRITE_SIZE
    });

    scene.load.spritesheet(EXTERNAL_RAT_SPRITESHEET_KEY, 'assets/sprites/rat-medieval.svg', {
        frameWidth: SPRITE_SIZE,
        frameHeight: SPRITE_SIZE
    });
};

const ensureTexture = (
    scene: Scene,
    key: string,
    painter: (graphics: GameObjects.Graphics) => void
): void => {
    if (scene.textures.exists(key)) {
        return;
    }

    const graphics = scene.make.graphics(undefined, false);

    graphics.clear();
    painter(graphics);
    graphics.generateTexture(key, SPRITE_SIZE, SPRITE_SIZE);
    graphics.destroy();
};

const paintPlayerFrame = (
    graphics: GameObjects.Graphics,
    direction: Direction,
    isWalking: boolean
): void => {
    const isFacingUp = direction === 'up';
    const isFacingDown = direction === 'down';
    const isFacingLeft = direction === 'left';
    const isFacingRight = direction === 'right';

    // Helmet and head.
    graphics.fillStyle(0x2f3d4a, 1);
    graphics.fillRect(12, 4, 8, 5);

    graphics.fillStyle(0xd6d2c4, 1);
    graphics.fillRect(12, 10, 8, 6);

    // Cloak/tunic body.
    graphics.fillStyle(0x6b3f27, 1);
    graphics.fillRect(11, 16, 10, 8);

    // Legs in walk/idle stance.
    graphics.fillStyle(0x364a5d, 1);
    if (isWalking) {
        graphics.fillRect(9, 24, 4, 6);
        graphics.fillRect(19, 22, 4, 8);
    } else {
        graphics.fillRect(10, 24, 4, 6);
        graphics.fillRect(18, 24, 4, 6);
    }

    // Arms and side gear.
    graphics.fillStyle(0x8f6a3a, 1);
    graphics.fillRect(8, 14, 3, 9);
    graphics.fillRect(21, 14, 3, 9);

    // Chest emblem.
    graphics.fillStyle(0xa58c5e, 1);
    graphics.fillRect(14, 17, 4, 3);

    // Direction hints to make facing clear.
    if (isFacingUp) {
        graphics.fillStyle(0xb8c6d3, 1);
        graphics.fillRect(14, 4, 4, 2);
    }

    if (isFacingDown) {
        graphics.fillStyle(0x3e2f24, 1);
        graphics.fillRect(13, 22, 6, 2);
    }

    if (isFacingLeft) {
        graphics.fillStyle(0xb8c6d3, 1);
        graphics.fillRect(7, 16, 2, 4);
    }

    if (isFacingRight) {
        graphics.fillStyle(0xb8c6d3, 1);
        graphics.fillRect(23, 16, 2, 4);
    }
};

const paintRatFrame = (
    graphics: GameObjects.Graphics,
    direction: Direction,
    isWalking: boolean
): void => {
    const isFacingUp = direction === 'up';
    const isFacingDown = direction === 'down';
    const isFacingLeft = direction === 'left';
    const isFacingRight = direction === 'right';

    // Low-profile rodent silhouette with ears and tail.
    graphics.fillStyle(0x5a4638, 1);
    graphics.fillEllipse(16, 18, 18, 11);

    graphics.fillStyle(0x806454, 1);
    graphics.fillEllipse(12, 14, 8, 7);

    graphics.fillStyle(0xb48d8d, 1);
    if (isFacingLeft) {
        graphics.fillCircle(8, 12, 2);
        graphics.fillCircle(12, 10, 2);
    } else if (isFacingRight) {
        graphics.fillCircle(20, 10, 2);
        graphics.fillCircle(24, 12, 2);
    } else {
        graphics.fillCircle(10, 11, 2);
        graphics.fillCircle(15, 10, 2);
    }

    graphics.fillStyle(0x8f7676, 1);
    if (isFacingLeft) {
        graphics.fillRect(4, 19, 6, 2);
    } else if (isFacingRight) {
        graphics.fillRect(22, 19, 6, 2);
    } else if (isFacingUp) {
        graphics.fillRect(15, 23, 2, 6);
    } else if (isFacingDown) {
        graphics.fillRect(15, 19, 2, 6);
    }

    if (isWalking) {
        graphics.fillStyle(0x4a382d, 1);
        graphics.fillRect(11, 21, 2, 3);
        graphics.fillRect(17, 22, 2, 2);
    }
};

export const ensureMedievalSpriteTextures = (scene: Scene): void => {
    const directions: readonly Direction[] = ['up', 'down', 'left', 'right'];

    for (const direction of directions) {
        const textureSet = PLAYER_DIRECTION_TEXTURE_KEYS[direction];

        ensureTexture(scene, textureSet.idle, (graphics) => {
            paintPlayerFrame(graphics, direction, false);
        });

        ensureTexture(scene, textureSet.walk, (graphics) => {
            paintPlayerFrame(graphics, direction, true);
        });

        const ratTextureSet = RAT_DIRECTION_TEXTURE_KEYS[direction];

        ensureTexture(scene, ratTextureSet.idle, (graphics) => {
            paintRatFrame(graphics, direction, false);
        });

        ensureTexture(scene, ratTextureSet.walk, (graphics) => {
            paintRatFrame(graphics, direction, true);
        });
    }
};

export const getMedievalPlayerTexture = (
    scene: Scene,
    direction: Direction,
    isWalking: boolean
): MedievalSpriteFrame => {
    if (scene.textures.exists(EXTERNAL_PLAYER_SPRITESHEET_KEY)) {
        const frames = PLAYER_DIRECTION_FRAMES[direction];

        return {
            textureKey: EXTERNAL_PLAYER_SPRITESHEET_KEY,
            frame: isWalking ? frames.walk : frames.idle
        };
    }

    const textureSet = PLAYER_DIRECTION_TEXTURE_KEYS[direction];

    return {
        textureKey: isWalking ? textureSet.walk : textureSet.idle
    };
};

export const getMedievalRatTexture = (
    scene: Scene,
    direction: Direction,
    isWalking: boolean
): MedievalSpriteFrame => {
    if (scene.textures.exists(EXTERNAL_RAT_SPRITESHEET_KEY)) {
        const frames = RAT_DIRECTION_FRAMES[direction];

        return {
            textureKey: EXTERNAL_RAT_SPRITESHEET_KEY,
            frame: isWalking ? frames.walk : frames.idle
        };
    }

    const textureSet = RAT_DIRECTION_TEXTURE_KEYS[direction];

    return {
        textureKey: isWalking ? textureSet.walk : textureSet.idle
    };
};
