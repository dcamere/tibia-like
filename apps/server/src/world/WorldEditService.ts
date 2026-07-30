import { prisma } from '../db';

export type StoredTileOverride = {
    tileX: number;
    tileY: number;
    tileTypeOverride: number | null;
    walkableOverride: boolean | null;
};

export const listWorldTileOverrides = async (): Promise<StoredTileOverride[]> => {
    const rows = await prisma.worldTileOverride.findMany({
        orderBy: [{ tileY: 'asc' }, { tileX: 'asc' }]
    });

    return rows.map((row) => ({
        tileX: row.tileX,
        tileY: row.tileY,
        tileTypeOverride: row.tileTypeOverride,
        walkableOverride: row.walkableOverride
    }));
};

export const upsertWorldTileTypeOverride = async (
    tileX: number,
    tileY: number,
    tileTypeOverride: number | null
): Promise<StoredTileOverride> => {
    const row = await prisma.worldTileOverride.upsert({
        where: {
            tileX_tileY: {
                tileX,
                tileY
            }
        },
        create: {
            tileX,
            tileY,
            tileTypeOverride,
            walkableOverride: null
        },
        update: {
            tileTypeOverride
        }
    });

    return {
        tileX: row.tileX,
        tileY: row.tileY,
        tileTypeOverride: row.tileTypeOverride,
        walkableOverride: row.walkableOverride
    };
};

export const upsertWorldWalkableOverride = async (
    tileX: number,
    tileY: number,
    walkableOverride: boolean | null
): Promise<StoredTileOverride> => {
    const row = await prisma.worldTileOverride.upsert({
        where: {
            tileX_tileY: {
                tileX,
                tileY
            }
        },
        create: {
            tileX,
            tileY,
            tileTypeOverride: null,
            walkableOverride
        },
        update: {
            walkableOverride
        }
    });

    return {
        tileX: row.tileX,
        tileY: row.tileY,
        tileTypeOverride: row.tileTypeOverride,
        walkableOverride: row.walkableOverride
    };
};

export const clearWorldTileOverride = async (
    tileX: number,
    tileY: number
): Promise<void> => {
    await prisma.worldTileOverride.deleteMany({
        where: {
            tileX,
            tileY
        }
    });
};
