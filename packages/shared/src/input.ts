import { isDirection, type Direction } from './direction';
import { EntityId } from './entity';

/**
 * Client -> server intent: "I want to move in this direction." Never a
 * position. The server decides the resulting tile.
 */
export type MoveInput = {
    direction: Direction;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

export const isMoveInput = (value: unknown): value is MoveInput => {
    if (!isRecord(value)) {
        return false;
    }

    return isDirection(value.direction);
};

/**
 * Client -> server intent: "I want to attack this entity." The server
 * decides range, cooldown and damage — this message carries no combat
 * outcome, only the player's intent.
 */
export type AttackInput = {
    creatureId: EntityId;
};

export const isAttackInput = (value: unknown): value is AttackInput => {
    if (!isRecord(value)) {
        return false;
    }

    return typeof value.creatureId === 'string';
};

export type DropItemInput = {
    slug: string;
    quantity: number;
    targetTileX?: number;
    targetTileY?: number;
};

export const isDropItemInput = (value: unknown): value is DropItemInput => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.slug === 'string' &&
        typeof value.quantity === 'number' &&
        Number.isFinite(value.quantity) &&
        (value.targetTileX === undefined ||
            (typeof value.targetTileX === 'number' && Number.isFinite(value.targetTileX))) &&
        (value.targetTileY === undefined ||
            (typeof value.targetTileY === 'number' && Number.isFinite(value.targetTileY)))
    );
};

export type PickupItemInput = {
    slug: string;
    quantity: number;
    targetTileX?: number;
    targetTileY?: number;
};

export const isPickupItemInput = (
    value: unknown
): value is PickupItemInput => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.slug === 'string' &&
        typeof value.quantity === 'number' &&
        Number.isFinite(value.quantity) &&
        (value.targetTileX === undefined ||
            (typeof value.targetTileX === 'number' && Number.isFinite(value.targetTileX))) &&
        (value.targetTileY === undefined ||
            (typeof value.targetTileY === 'number' && Number.isFinite(value.targetTileY)))
    );
};
