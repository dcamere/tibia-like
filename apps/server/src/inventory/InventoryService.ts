import { type Prisma } from '@prisma/client';

import { prisma } from '../db';

const CONTAINER_INVENTORY = 'inventory';
const CONTAINER_EQUIPMENT = 'equipment';

export type InventoryEntry = {
    slug: string;
    name: string;
    quantity: number;
};

export type GroundEntry = {
    slug: string;
    name: string;
    quantity: number;
};

export type GroundItemSnapshot = {
    id: string;
    slug: string;
    name: string;
    tileX: number;
    tileY: number;
    quantity: number;
};

const PLAYER_PICKUP_RANGE = 1;

const COIN_VALUE_BY_SLUG: Record<string, number> = {
    copper_coin: 1,
    silver_coin: 100,
    gold_coin: 10_000
};

const resolveCoinValue = (slug: string): number | null => {
    return COIN_VALUE_BY_SLUG[slug] ?? null;
};

const ensureDefaultContainers = async (
    tx: Prisma.TransactionClient,
    characterId: string
): Promise<void> => {
    const existing = await tx.container.findMany({
        where: { characterId },
        select: { type: true }
    });

    const hasInventory = existing.some((entry) => entry.type === CONTAINER_INVENTORY);
    const hasEquipment = existing.some((entry) => entry.type === CONTAINER_EQUIPMENT);

    if (!hasInventory) {
        await tx.container.create({
            data: {
                characterId,
                name: 'Inventory',
                type: CONTAINER_INVENTORY,
                capacity: 24
            }
        });
    }

    if (!hasEquipment) {
        await tx.container.create({
            data: {
                characterId,
                name: 'Equipment',
                type: CONTAINER_EQUIPMENT,
                capacity: 10
            }
        });
    }
};

const getInventoryContainer = async (
    tx: Prisma.TransactionClient,
    characterId: string
) => {
    await ensureDefaultContainers(tx, characterId);

    const container = await tx.container.findFirst({
        where: {
            characterId,
            type: CONTAINER_INVENTORY
        }
    });

    if (!container) {
        throw new Error('Inventory container is missing.');
    }

    return container;
};

const addItemToInventory = async (
    tx: Prisma.TransactionClient,
    characterId: string,
    itemDefinitionId: string,
    quantity: number
): Promise<void> => {
    if (quantity <= 0) {
        throw new Error('Quantity must be positive.');
    }

    const itemDefinition = await tx.itemDefinition.findUnique({
        where: { id: itemDefinitionId }
    });

    if (!itemDefinition) {
        throw new Error('Item definition not found.');
    }

    const coinValue = resolveCoinValue(itemDefinition.slug);

    if (coinValue !== null) {
        await tx.character.update({
            where: { id: characterId },
            data: {
                goldCopper: {
                    increment: coinValue * quantity
                }
            }
        });

        return;
    }

    const inventoryContainer = await getInventoryContainer(tx, characterId);

    if (!itemDefinition.stackable) {
        for (let index = 0; index < quantity; index += 1) {
            await tx.characterItem.create({
                data: {
                    characterId,
                    itemDefinitionId,
                    containerId: inventoryContainer.id,
                    quantity: 1
                }
            });
        }

        return;
    }

    let remaining = quantity;

    const existingStacks = await tx.characterItem.findMany({
        where: {
            characterId,
            itemDefinitionId,
            containerId: inventoryContainer.id,
            equippedSlot: null
        },
        orderBy: {
            createdAt: 'asc'
        }
    });

    for (const stack of existingStacks) {
        if (remaining <= 0) {
            break;
        }

        const freeSpace = itemDefinition.maxStack - stack.quantity;

        if (freeSpace <= 0) {
            continue;
        }

        const delta = Math.min(freeSpace, remaining);

        await tx.characterItem.update({
            where: { id: stack.id },
            data: {
                quantity: stack.quantity + delta
            }
        });

        remaining -= delta;
    }

    while (remaining > 0) {
        const chunk = Math.min(itemDefinition.maxStack, remaining);

        await tx.characterItem.create({
            data: {
                characterId,
                itemDefinitionId,
                containerId: inventoryContainer.id,
                quantity: chunk
            }
        });

        remaining -= chunk;
    }
};

const consumeInventoryQuantity = async (
    tx: Prisma.TransactionClient,
    characterId: string,
    itemDefinitionId: string,
    quantity: number
): Promise<void> => {
    if (quantity <= 0) {
        throw new Error('Quantity must be positive.');
    }

    const stacks = await tx.characterItem.findMany({
        where: {
            characterId,
            itemDefinitionId,
            equippedSlot: null,
            container: {
                type: CONTAINER_INVENTORY
            }
        },
        orderBy: {
            createdAt: 'asc'
        }
    });

    const totalQuantity = stacks.reduce((sum, stack) => sum + stack.quantity, 0);

    if (totalQuantity < quantity) {
        throw new Error('Not enough quantity in inventory.');
    }

    let remaining = quantity;

    for (const stack of stacks) {
        if (remaining <= 0) {
            break;
        }

        const consumed = Math.min(stack.quantity, remaining);
        const nextQuantity = stack.quantity - consumed;

        if (nextQuantity === 0) {
            await tx.characterItem.delete({
                where: { id: stack.id }
            });
        } else {
            await tx.characterItem.update({
                where: { id: stack.id },
                data: { quantity: nextQuantity }
            });
        }

        remaining -= consumed;
    }
};

const upsertGroundItem = async (
    tx: Prisma.TransactionClient,
    input: {
        itemDefinitionId: string;
        tileX: number;
        tileY: number;
        quantity: number;
    }
): Promise<void> => {
    const existing = await tx.groundItem.findFirst({
        where: {
            itemDefinitionId: input.itemDefinitionId,
            tileX: input.tileX,
            tileY: input.tileY,
            ownerCharacterId: null
        },
        orderBy: {
            createdAt: 'asc'
        }
    });

    if (existing) {
        await tx.groundItem.update({
            where: { id: existing.id },
            data: {
                quantity: existing.quantity + input.quantity
            }
        });

        return;
    }

    await tx.groundItem.create({
        data: {
            itemDefinitionId: input.itemDefinitionId,
            tileX: input.tileX,
            tileY: input.tileY,
            quantity: input.quantity,
            ownerCharacterId: null
        }
    });
};

export const listInventory = async (
    characterId: string
): Promise<InventoryEntry[]> => {
    const items = await prisma.characterItem.findMany({
        where: {
            characterId,
            equippedSlot: null,
            container: {
                type: CONTAINER_INVENTORY
            }
        },
        include: {
            itemDefinition: true
        },
        orderBy: [{ itemDefinition: { slug: 'asc' } }, { createdAt: 'asc' }]
    });

    const grouped = new Map<string, InventoryEntry>();

    for (const item of items) {
        const key = item.itemDefinition.slug;
        const current = grouped.get(key);

        if (!current) {
            grouped.set(key, {
                slug: item.itemDefinition.slug,
                name: item.itemDefinition.name,
                quantity: item.quantity
            });
            continue;
        }

        current.quantity += item.quantity;
    }

    return [...grouped.values()];
};

export const listGroundItemsAt = async (
    tileX: number,
    tileY: number
): Promise<GroundEntry[]> => {
    const items = await prisma.groundItem.findMany({
        where: {
            tileX,
            tileY
        },
        include: {
            itemDefinition: true
        },
        orderBy: [{ itemDefinition: { slug: 'asc' } }, { createdAt: 'asc' }]
    });

    return items.map((item) => ({
        slug: item.itemDefinition.slug,
        name: item.itemDefinition.name,
        quantity: item.quantity
    }));
};

export const listAllGroundItems = async (): Promise<GroundItemSnapshot[]> => {
    const items = await prisma.groundItem.findMany({
        include: {
            itemDefinition: true
        },
        orderBy: [{ tileY: 'asc' }, { tileX: 'asc' }, { createdAt: 'asc' }]
    });

    return items.map((item) => ({
        id: item.id,
        slug: item.itemDefinition.slug,
        name: item.itemDefinition.name,
        tileX: item.tileX,
        tileY: item.tileY,
        quantity: item.quantity
    }));
};

export const giveItemToCharacter = async (
    characterId: string,
    slug: string,
    quantity: number
): Promise<void> => {
    if (quantity <= 0) {
        throw new Error('Quantity must be positive.');
    }

    await prisma.$transaction(async (tx) => {
        const itemDefinition = await tx.itemDefinition.findUnique({
            where: {
                slug
            }
        });

        if (!itemDefinition) {
            throw new Error('Item definition not found.');
        }

        await addItemToInventory(tx, characterId, itemDefinition.id, quantity);
    });
};

const removeCurrencyForCoinDrop = async (
    tx: Prisma.TransactionClient,
    characterId: string,
    coinValue: number,
    quantity: number
): Promise<void> => {
    const costCopper = coinValue * quantity;

    const character = await tx.character.findUnique({
        where: { id: characterId },
        select: { goldCopper: true }
    });

    if (!character) {
        throw new Error('Character not found.');
    }

    if (character.goldCopper < costCopper) {
        throw new Error('Not enough gold.');
    }

    await tx.character.update({
        where: { id: characterId },
        data: {
            goldCopper: {
                decrement: costCopper
            }
        }
    });
};

export const dropItemFromCharacter = async (
    characterId: string,
    slug: string,
    quantity: number,
    tileX: number,
    tileY: number
): Promise<void> => {
    if (quantity <= 0) {
        throw new Error('Quantity must be positive.');
    }

    await prisma.$transaction(async (tx) => {
        const itemDefinition = await tx.itemDefinition.findUnique({
            where: {
                slug
            }
        });

        if (!itemDefinition) {
            throw new Error('Item definition not found.');
        }

        const coinValue = resolveCoinValue(itemDefinition.slug);

        if (coinValue !== null) {
            await removeCurrencyForCoinDrop(tx, characterId, coinValue, quantity);
            await upsertGroundItem(tx, {
                itemDefinitionId: itemDefinition.id,
                tileX,
                tileY,
                quantity
            });
            return;
        }

        await consumeInventoryQuantity(tx, characterId, itemDefinition.id, quantity);
        await upsertGroundItem(tx, {
            itemDefinitionId: itemDefinition.id,
            tileX,
            tileY,
            quantity
        });
    });
};

export const pickupGroundItemForCharacter = async (
    input: {
        characterId: string;
        playerTileX: number;
        playerTileY: number;
        slug: string;
        quantity: number;
        targetTileX: number;
        targetTileY: number;
    }
): Promise<void> => {
    if (input.quantity <= 0) {
        throw new Error('Quantity must be positive.');
    }

    const distanceX = Math.abs(input.playerTileX - input.targetTileX);
    const distanceY = Math.abs(input.playerTileY - input.targetTileY);

    if (Math.max(distanceX, distanceY) > PLAYER_PICKUP_RANGE) {
        throw new Error('Too far to pick up item.');
    }

    await prisma.$transaction(async (tx) => {
        const groundItem = await tx.groundItem.findFirst({
            where: {
                tileX: input.targetTileX,
                tileY: input.targetTileY,
                itemDefinition: {
                    slug: input.slug
                }
            },
            include: {
                itemDefinition: true
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        if (!groundItem) {
            throw new Error('Ground item not found.');
        }

        if (groundItem.quantity < input.quantity) {
            throw new Error('Not enough quantity on the ground.');
        }

        const remainingOnGround = groundItem.quantity - input.quantity;

        if (remainingOnGround === 0) {
            await tx.groundItem.delete({
                where: { id: groundItem.id }
            });
        } else {
            await tx.groundItem.update({
                where: { id: groundItem.id },
                data: { quantity: remainingOnGround }
            });
        }

        const coinValue = resolveCoinValue(groundItem.itemDefinition.slug);

        if (coinValue !== null) {
            await tx.character.update({
                where: { id: input.characterId },
                data: {
                    goldCopper: {
                        increment: coinValue * input.quantity
                    }
                }
            });

            return;
        }

        await addItemToInventory(tx, input.characterId, groundItem.itemDefinitionId, input.quantity);
    });
};

export const getCharacterGoldCopper = async (characterId: string): Promise<number> => {
    const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: {
            goldCopper: true
        }
    });

    if (!character) {
        throw new Error('Character not found.');
    }

    return character.goldCopper;
};
