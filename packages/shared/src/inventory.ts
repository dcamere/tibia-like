export type InventoryEntry = {
    slug: string;
    name: string;
    quantity: number;
};

export type InventorySyncPayload = {
    items: InventoryEntry[];
    goldCopper: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const isInventoryEntry = (value: unknown): value is InventoryEntry => {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.slug === 'string' &&
        typeof value.name === 'string' &&
        typeof value.quantity === 'number' &&
        Number.isFinite(value.quantity)
    );
};

export const isInventorySyncPayload = (
    value: unknown
): value is InventorySyncPayload => {
    if (!isRecord(value) || !Array.isArray(value.items)) {
        return false;
    }

    return (
        value.items.every((entry) => isInventoryEntry(entry)) &&
        typeof value.goldCopper === 'number' &&
        Number.isFinite(value.goldCopper)
    );
};